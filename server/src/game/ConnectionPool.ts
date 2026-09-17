// @ts-nocheck
import { GameSocket, type GameSocketStatus, type GameMessage } from './GameSocket.js';
import { getVault } from '../crypto/vault.js';
import { transformToken, type AuthUserResult } from '../token/authUser.js';
import { bus, type BusEvent } from '../events/bus.js';
import { saveRoleCache } from './roleCache.js';
import { logger } from '../logger.js';
import { extractLastLoginTimestamp, generateRandomSeed } from './randomSeed.js';
import { tokenService } from '../token/TokenService.js';

const log = logger.child({ mod: 'connection-pool' });

// 瞬断类错误判据 (与 tasks/batch/helpers.ts 的 TRANSIENT_CONN_RE 同源; 不直接
// import, 避免 game/ → tasks/ 反向依赖)。
const TRANSIENT_CONN_RE = /connection closed|connection timeout|token 未连接|WebSocket 未连接/i;

export interface ConnectionMeta {
  id: string;
  name: string;
  server: string | null;
  encrypted: string;
  iv: string;
  authTag: string;
  wsUrl: string | null;
  defaultGameWsUrl: string;
}

export interface PoolEntry {
  socket: GameSocket;
  meta: ConnectionMeta;
  status: GameSocketStatus;
  lastError: string | null;
  connectedAt: string;
  lastRandomSeedSource: number | null;
}

export class ConnectionPool {
  private entries = new Map<string, PoolEntry>();
  private connectingSlots = 0;
  /** 正在自动续期的 token, 防止同一 token 并发/循环触发续期 */
  private refreshing = new Set<string>();
  private readonly maxConcurrent: number;
  private readonly intervalMs: number;
  private readonly defaultGameWsUrl: string;

  constructor(opts: {
    maxConcurrent?: number;
    intervalMs?: number;
    defaultGameWsUrl: string;
  }) {
    this.maxConcurrent = opts.maxConcurrent ?? 10;
    this.intervalMs = opts.intervalMs ?? 500;
    this.defaultGameWsUrl = opts.defaultGameWsUrl;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): PoolEntry | undefined {
    return this.entries.get(id);
  }

  list(): PoolEntry[] {
    return Array.from(this.entries.values());
  }

  async connect(meta: ConnectionMeta): Promise<PoolEntry> {
    const existing = this.entries.get(meta.id);
    if (existing && existing.socket.isConnected()) {
      return existing;
    }
    if (existing) {
      existing.socket.disconnect();
      this.entries.delete(meta.id);
    }

    const wsUrl = meta.wsUrl ?? this.buildGameWsUrl(meta);
    const socket = new GameSocket({
      url: wsUrl,
      tokenId: meta.id,
      onHandshakeFailed: (tokenId: string) => this.notifyTokenRefreshNeeded(tokenId, 'handshake_failed'),
      onReconnectExhausted: (tokenId: string) => void this.serverSideRefresh(tokenId),
      onFatalClose: (tokenId: string) => this.handleFatalClose(tokenId),
    });
    const entry: PoolEntry = {
      socket,
      meta,
      status: 'connecting',
      lastError: null,
      connectedAt: new Date().toISOString(),
      lastRandomSeedSource: null,
    };
    this.entries.set(meta.id, entry);
    this.attachHandlers(meta.id, socket);
    await socket.connect();
    return entry;
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.socket.disconnect();
    this.entries.delete(id);
    this.emitStatus(id, 'disconnected');
  }

  async reconnect(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('token not connected');
    entry.socket.disconnect();
    await entry.socket.connect();
  }

  async ensureConnection(meta: ConnectionMeta, timeoutMs = 15000): Promise<PoolEntry> {
    const existing = this.entries.get(meta.id);
    if (existing && existing.socket.isConnected()) return existing;
    return Promise.race([
      this.connect(meta),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('connection timeout')), timeoutMs),
      ),
    ]);
  }

  /**
   * 发送指令, 带内联自愈:
   * 1. 未连接 → 先重建连接再发 (控制台等手动操作不再直接吃 "token 未连接")
   * 2. 发送中遇瞬断 (会话过期被踢/掉线) → 服务端续期换新凭据 → 重试一次
   * 自愈路径最长 ~15s (重建握手 / 3 次重连失败后续期), 期间调用方表现为请求变慢而非报错。
   * 重试仅一次, 续期不可用的类型 (manual) 走原错误路径。
   */
  async send<T = unknown>(id: string, cmd: string, params: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
    const entry = this.entries.get(id);
    if (!entry || !entry.socket.isConnected()) {
      const meta = entry?.meta ?? tokenService.toConnectionMeta(id);
      if (!meta) throw new Error('token 不存在');
      await this.ensureConnection(meta);
    }
    try {
      return await this.doSend<T>(id, cmd, params, timeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? '');
      if (!TRANSIENT_CONN_RE.test(msg)) throw err;
      // serverSideRefresh 有 refreshing 去重: 若重连耗尽已在途续期, 这里会跳过,
      // 等 waitConnected 拿到新连接即可; 续期失败/不可用则原样抛出瞬断错误。
      await this.serverSideRefresh(id).catch(() => undefined);
      await this.waitConnected(id, 8000);
      return this.doSend<T>(id, cmd, params, timeoutMs);
    }
  }

  private async doSend<T = unknown>(id: string, cmd: string, params: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const entry = this.entries.get(id);
    if (!entry || !entry.socket.isConnected()) {
      throw new Error('token 未连接');
    }
    return entry.socket.send<T>(cmd, params, timeoutMs);
  }

  /** 轮询等待连接就绪 (续期/重连在途时用); 超时静默返回, 由 doSend 抛出明确错误 */
  private async waitConnected(id: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.entries.get(id)?.socket.isConnected()) return;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  private buildGameWsUrl(meta: ConnectionMeta): string {
    const vault = getVault();
    const raw = vault.decrypt(meta.encrypted, meta.iv, meta.authTag);
    const sep = this.defaultGameWsUrl.includes('?') ? '&' : '?';
    return `${this.defaultGameWsUrl}${sep}p=${raw}&e=x&lang=chinese`;
  }

  async fetchAuthUser(meta: ConnectionMeta): Promise<AuthUserResult> {
    const vault = getVault();
    const rawToken = vault.decrypt(meta.encrypted, meta.iv, meta.authTag);
    const buf = Buffer.from(rawToken, 'base64');
    return transformToken(buf);
  }

  private attachHandlers(id: string, socket: GameSocket): void {
    socket.on('status', (status, error) => {
      const entry = this.entries.get(id);
      if (entry) {
        entry.status = status;
        entry.lastError = error ?? null;
      }
      this.emitStatus(id, status, error);
    });
    socket.on('message', (msg) => {
      const evt: BusEvent = { type: 'game.event', tokenId: id, msg };
      bus.emit('event', evt);
      this.persistIfRelevant(id, msg);
      this.trySyncRandomSeed(id, msg);
    });
  }

  /**
   * 收到角色信息后同步 randomSeed (缺失会导致游戏服约180s回收会话)
   */
  private trySyncRandomSeed(id: string, msg: GameMessage): void {
    const cmd = String(msg.cmd ?? '').toLowerCase();
    if (cmd !== 'role_getroleinforesp' && cmd !== 'role_getroleinfo') return;
    const entry = this.entries.get(id);
    if (!entry || !entry.socket.isConnected()) return;
    if (!msg.body || typeof msg.body !== 'object') return;

    const lastLoginTime = extractLastLoginTimestamp(msg.body);
    if (!lastLoginTime) return;
    if (entry.lastRandomSeedSource === lastLoginTime) return;

    const seed = generateRandomSeed(lastLoginTime);
    entry.socket
      .send('system_custom', { key: 'randomSeed', value: seed })
      .then(() => {
        entry.lastRandomSeedSource = lastLoginTime;
        log.debug({ tokenId: id, lastLoginTime, seed }, 'randomSeed synced');
      })
      .catch(() => undefined);
  }

  private emitStatus(tokenId: string, status: GameSocketStatus, error?: string): void {
    bus.emit('status', { type: 'ws.status', tokenId, status, error });
  }

  /**
   * 通知前端尝试刷新 Token (URL 导入有效; bin/wxQrcode 仅提示重新导入)
   * 通过 SSE 事件 token.refresh_suggested 传递
   */
  notifyTokenRefreshNeeded(tokenId: string, reason: string): void {
    const t = tokenService.get(tokenId);
    // 不是 URL 类型的直接发提示给前端(前端无法自动续期,需要重新导入)
    bus.emit('event', {
      type: 'token.refresh_suggested',
      tokenId,
      reason: t && t.importMethod !== 'url' ? `${reason}:non-url` : reason,
    });
  }

  /**
   * 服务端 fatal 踢线 (顶号/会话失效) 后的"让位"处理:
   * 不自动重连、不自动续期 —— 自动续期会从手机手里抢回会话, 形成互踢循环。
   * 仅广播 token.yielded 供前端提示; 恢复途径: 定时任务 ensureConnection /
   * 控制台 send 内联自愈 / 手动连接 (三者都是显式发起, 连回即顶掉手机, 符合预期)。
   */
  private handleFatalClose(tokenId: string): void {
    log.warn({ tokenId }, 'token 已让位 (服务端 fatal 踢线), 等待定时任务或手动连接');
    bus.emit('event', { type: 'token.yielded', tokenId, reason: 'server_fatal_kick' });
  }

  /**
   * 服务端自动续期 + 重连 (不依赖前端).
   * 在 WS reconnect 连续失败 3 次后由 GameSocket 触发 (~11s).
   * 流程: 读 importMethod → 选 refresh 路径(URL / raw_bin) → 更新加密凭据
   *       → **重新读取 meta** → 用新 p 重建连接.
   */
  async serverSideRefresh(tokenId: string): Promise<void> {
    if (this.refreshing.has(tokenId)) {
      log.warn({ tokenId }, 'serverSideRefresh: 已有续期在进行, 跳过');
      return;
    }
    this.refreshing.add(tokenId);
    try {
      const publicRow = tokenService.get(tokenId);
      if (!publicRow) {
        log.warn({ tokenId }, 'serverSideRefresh: token 不存在');
        return;
      }
      const importMethod = publicRow.importMethod;
      if (importMethod === 'url') {
        await tokenService.refreshByUrl(tokenId);
      } else if (importMethod === 'wxQrcode' || importMethod === 'bin') {
        await tokenService.refreshFromBin(tokenId);
      } else {
        log.warn({ tokenId, importMethod }, 'serverSideRefresh: 此类型无法自动续期, 需用户手动重导');
        return;
      }
      // 必须在续期之后再读 meta, 否则拿到的是刷新前的旧凭据 (旧 p 仍会握手失败)
      const freshMeta = tokenService.toConnectionMeta(tokenId);
      if (!freshMeta) {
        log.warn({ tokenId }, 'serverSideRefresh: 续期后读不到 meta, 放弃重连');
        return;
      }
      log.info({ tokenId, importMethod }, 'serverSideRefresh 成功, 准备用新凭据重连');
      // 旧 socket 已 close (onClose 触发 scheduleReconnect); disconnect 会清掉旧 entry 与重连排程
      await this.disconnect(tokenId);
      await this.connect(freshMeta);
      log.info({ tokenId }, 'serverSideRefresh 重连成功');
    } catch (err) {
      log.warn({ tokenId, err: (err as Error).message }, 'serverSideRefresh 失败, 维持原状态');
    } finally {
      this.refreshing.delete(tokenId);
    }
  }

  private persistIfRelevant(tokenId: string, msg: GameMessage): void {
    const section = sectionForCmd(msg.cmd);
    if (!section) return;
    saveRoleCache(tokenId, section, msg.body ?? msg.raw ?? {});
  }

  async shutdown(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const id of Array.from(this.entries.keys())) {
      await this.disconnect(id);
    }
  }
}

function sectionForCmd(cmd: string): string | null {
  const c = (cmd ?? '').toLowerCase();
  if (c === 'role_getroleinfo' || c === 'role_getroleinforesp') return 'role';
  if (c.includes('legion') || c.includes('legionwar')) return 'legion';
  if (c.includes('tower') || c.includes('bosstower') || c.includes('evotower')) return 'tower';
  if (c.includes('study')) return 'study';
  if (c.includes('activity')) return 'activity';
  return null;
}