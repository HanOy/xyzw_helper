// @ts-nocheck
import axios from 'axios';
import { db } from '../db/index.js';
import { getVault } from '../crypto/vault.js';
import { getTokenId } from './transformToken.js';
import { transformToken } from './authUser.js';
import { CONFIG } from '../config.js';
import { logger } from '../logger.js';
import { bus } from '../events/bus.js';
import { g_utils } from '../game/bonProtocol.js';

const log = logger.child({ mod: 'tokens' });

export interface TokenRow {
  id: string;
  name: string;
  server: string | null;
  remark: string | null;
  avatar: string | null;
  import_method: string | null;
  source_url: string | null;
  ws_url: string | null;
  upgraded: number;
  upgraded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenPublic {
  id: string;
  name: string;
  server: string | null;
  remark: string | null;
  avatar: string | null;
  importMethod: string | null;
  sourceUrl: string | null;
  wsUrl: string | null;
  upgraded: boolean;
  upgradedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status?: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export interface TokenImportBinRequest {
  method: 'bin';
  name: string;
  bin: string;
  wsUrl?: string;
  remark?: string;
}

export interface TokenImportUrlRequest {
  method: 'url';
  name: string;
  url: string;
  wsUrl?: string;
  remark?: string;
  server?: string;
}

export interface TokenImportManualRequest {
  method: 'manual';
  name: string;
  bin: string;
  wsUrl?: string;
  remark?: string;
  server?: string;
}

export interface TokenImportWxQrcodeRequest {
  method: 'wxQrcode';
  names: { roleId: string; name: string; server: string; serverId: string; roleIndex: number; wsUrl?: string }[];
  bin: string;
}

export type TokenImportRequest = TokenImportBinRequest | TokenImportManualRequest | TokenImportUrlRequest | TokenImportWxQrcodeRequest;

interface StoredBin {
  bin: Buffer;
  serverId: number;
}

export class TokenService {
  list(): TokenPublic[] {
    const rows = db
      .prepare(`SELECT * FROM tokens ORDER BY updated_at DESC`)
      .all() as TokenRow[];
    return rows.map(toPublic);
  }

  get(id: string): TokenPublic | null {
    const row = db.prepare('SELECT * FROM tokens WHERE id = ?').get(id) as TokenRow | undefined;
    return row ? toPublic(row) : null;
  }

  decryptToken(id: string): string {
    const row = db.prepare('SELECT encrypted, iv, auth_tag FROM tokens WHERE id = ?').get(id) as
      | { encrypted: string; iv: string; auth_tag: string }
      | undefined;
    if (!row) throw new Error('token 不存在');
    return getVault().decrypt(row.encrypted, row.iv, row.auth_tag);
  }

  async importOne(req: TokenImportRequest): Promise<TokenPublic[]> {
    if (req.method === 'wxQrcode') {
      return this.importWxQrcode(req);
    }
    const single = await this.importSingle(req);
    return [single];
  }

  private resolveImportTokenId(name: string, computedId: string): string {
    // token id 由 MD5(整个 bin) 派生,而 bin 内含会过期的会话 p。
    // 过期后重扫 → p 变化 → id 变化 → 旧 token 残留、定时任务等关联断裂。
    // 按 name 唯一匹配复用已有 id,使重扫走 ON CONFLICT 原地更新而非新建记录。
    const rows = db
      .prepare('SELECT id FROM tokens WHERE name = ?')
      .all(name) as Array<{ id: string }>;
    if (rows.length === 1) return rows[0].id;
    return computedId;
  }

  private async importSingle(req: TokenImportBinRequest | TokenImportManualRequest | TokenImportUrlRequest): Promise<TokenPublic> {
    let binBuf: Buffer;
    let sourceUrl: string | null = null;

    if (req.method === 'bin' || req.method === 'manual') {
      binBuf = decodeBinInput(req.bin);
    } else {
      sourceUrl = req.url;
      const data = await fetchUrlToken(req.url);
      binBuf = decodeBinInput(data);
    }

    const parsed = parseBin(binBuf);
    const id = this.resolveImportTokenId(req.name, getTokenId(binBuf));

    const auth = await transformToken(binBuf);
    const encrypted = JSON.stringify(auth);

    const vault = getVault();
    const enc = vault.encrypt(encrypted);

    const now = new Date().toISOString();
    const row: TokenRow = {
      id,
      name: req.name,
      server: req.method === 'url' && req.server ? req.server : null,
      remark: req.remark ?? null,
      avatar: null,
      import_method: req.method,
      source_url: sourceUrl,
      ws_url: req.wsUrl ?? null,
      upgraded: 0,
      upgraded_at: null,
      created_at: now,
      updated_at: now,
    };

    db.prepare(
      `INSERT INTO tokens(id, name, server, remark, avatar, import_method, source_url, encrypted, iv, auth_tag, ws_url, upgraded, upgraded_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         remark = excluded.remark,
         ws_url = excluded.ws_url,
         encrypted = excluded.encrypted,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         updated_at = excluded.updated_at`,
    ).run(
      row.id,
      row.name,
      row.server,
      row.remark,
      row.avatar,
      row.import_method,
      row.source_url,
      enc.encrypted,
      enc.iv,
      enc.authTag,
      row.ws_url,
      row.upgraded,
      row.upgraded_at,
      row.created_at,
      now,
    );

    bus.emit('task', {
      type: 'task.log',
      runId: 'tokens',
      tokenId: id,
      level: 'info',
      message: `Token 导入: ${row.name}`,
      ts: now,
    });
    log.info({ id, name: row.name }, 'token imported');
    return toPublic(row);
  }

  private async importWxQrcode(req: TokenImportWxQrcodeRequest): Promise<TokenPublic[]> {
    const masterBin = decodeBinInput(req.bin);
    const parsed = parseBin(masterBin);
    const results: TokenPublic[] = [];
    for (const item of req.names) {
      const modified: StoredBin = { bin: Buffer.from(masterBin), serverId: Number(item.serverId) };
      modified.bin = replaceServerId(modified.bin, Number(item.serverId));
      const id = this.resolveImportTokenId(item.name, getTokenId(modified.bin));
      const auth = await transformToken(modified.bin);
      const vault = getVault();
      const enc = vault.encrypt(JSON.stringify(auth));
      const now = new Date().toISOString();
      const row: TokenRow = {
        id,
        name: item.name,
        server: item.server,
        remark: null,
        avatar: null,
        import_method: 'wxQrcode',
        source_url: null,
        ws_url: item.wsUrl ?? null,
        upgraded: 0,
        upgraded_at: null,
        created_at: now,
        updated_at: now,
      };
      db.prepare(
        `INSERT INTO tokens(id, name, server, remark, avatar, import_method, source_url, encrypted, iv, auth_tag, ws_url, upgraded, upgraded_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           encrypted = excluded.encrypted,
           iv = excluded.iv,
           auth_tag = excluded.auth_tag,
           updated_at = excluded.updated_at`,
      ).run(
        row.id,
        row.name,
        row.server,
        row.remark,
        row.avatar,
        row.import_method,
        row.source_url,
        enc.encrypted,
        enc.iv,
        enc.authTag,
        row.ws_url,
        row.upgraded,
        row.upgraded_at,
        row.created_at,
        now,
      );
      results.push(toPublic(row));
    }
    return results;
  }

  async refreshByUrl(id: string): Promise<TokenPublic> {
    const row = db.prepare('SELECT * FROM tokens WHERE id = ?').get(id) as TokenRow | undefined;
    if (!row) throw new Error('token 不存在');
    if (row.import_method !== 'url' || !row.source_url) {
      throw new Error('该 token 不是 URL 类型');
    }
    const data = await fetchUrlToken(row.source_url);
    const binBuf = decodeBinInput(data);
    const auth = await transformToken(binBuf);
    const vault = getVault();
    const enc = vault.encrypt(JSON.stringify(auth));
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE tokens SET encrypted = ?, iv = ?, auth_tag = ?, updated_at = ? WHERE id = ?',
    ).run(enc.encrypted, enc.iv, enc.authTag, now, id);
    const updated: TokenRow = {
      ...row,
      encrypted: enc.encrypted,
      iv: enc.iv,
      auth_tag: enc.authTag,
      updated_at: now,
    };
    return toPublic(updated);
  }

  update(id: string, patch: Partial<Pick<TokenPublic, 'name' | 'remark' | 'avatar' | 'wsUrl'>>): TokenPublic {
    const row = db.prepare('SELECT * FROM tokens WHERE id = ?').get(id) as TokenRow | undefined;
    if (!row) throw new Error('token 不存在');
    const next = {
      name: patch.name ?? row.name,
      remark: patch.remark ?? row.remark,
      avatar: patch.avatar ?? row.avatar,
      ws_url: patch.wsUrl ?? row.ws_url,
    };
    db.prepare(
      'UPDATE tokens SET name = ?, remark = ?, avatar = ?, ws_url = ?, updated_at = ? WHERE id = ?',
    ).run(next.name, next.remark, next.avatar, next.ws_url, new Date().toISOString(), id);
    return toPublic({ ...row, ...next });
  }

  delete(id: string): void {
    db.prepare('DELETE FROM tokens WHERE id = ?').run(id);
    db.prepare('DELETE FROM role_cache WHERE token_id = ?').run(id);
    db.prepare('DELETE FROM ws_connections WHERE token_id = ?').run(id);
  }

  toConnectionMeta(id: string): import('../game/ConnectionPool.js').ConnectionMeta | null {
    const row = db
      .prepare('SELECT id, name, server, encrypted, iv, auth_tag, ws_url FROM tokens WHERE id = ?')
      .get(id) as
      | {
          id: string;
          name: string;
          server: string | null;
          encrypted: string;
          iv: string;
          auth_tag: string;
          ws_url: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      server: row.server,
      encrypted: row.encrypted,
      iv: row.iv,
      authTag: row.auth_tag,
      wsUrl: row.ws_url,
      defaultGameWsUrl: CONFIG.defaultGameWsUrl,
    };
  }
}

function toPublic(row: TokenRow): TokenPublic {
  return {
    id: row.id,
    name: row.name,
    server: row.server,
    remark: row.remark,
    avatar: row.avatar,
    importMethod: row.import_method,
    sourceUrl: row.source_url,
    wsUrl: row.ws_url,
    upgraded: !!row.upgraded,
    upgradedAt: row.upgraded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeBinInput(input: string): Buffer {
  const trimmed = input.trim();
  if (trimmed.startsWith('data:')) {
    const base64 = trimmed.slice(trimmed.indexOf(',') + 1);
    return Buffer.from(base64, 'base64');
  }
  return Buffer.from(trimmed, 'base64');
}

function parseBin(buf: Buffer): Record<string, unknown> {
  try {
    const parsed = g_utils.parse(buf);
    return (parsed.getData?.() ?? parsed.rawData ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function replaceServerId(buf: Buffer, serverId: number): Buffer {
  const parsed = g_utils.parse(buf) as unknown as {
    getData?: () => Record<string, unknown>;
    rawData?: Record<string, unknown>;
    _raw?: Record<string, unknown>;
  };
  const data = (parsed.getData?.() ?? parsed.rawData ?? parsed._raw) as
    | Record<string, unknown>
    | undefined;
  if (data && typeof data === 'object') {
    data.serverId = serverId;
  }
  return Buffer.from(g_utils.encode(data));
}

async function fetchUrlToken(url: string): Promise<string> {
  try {
    const res = await axios.get(url, {
      responseType: 'text',
      timeout: 15_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12; 23117RK66C Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36',
      },
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    try {
      const json = JSON.parse(text);
      if (typeof json === 'object' && json && typeof (json as Record<string, unknown>).token === 'string') {
        return (json as Record<string, unknown>).token as string;
      }
      if (typeof json === 'object' && json && typeof (json as Record<string, unknown>).data === 'string') {
        return (json as Record<string, unknown>).data as string;
      }
    } catch {
      // not json, treat as raw token
    }
    return text.trim();
  } catch (err) {
    throw new Error(`URL 拉取 Token 失败: ${(err as Error).message}`);
  }
}

export const tokenService = new TokenService();