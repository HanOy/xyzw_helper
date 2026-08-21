// @ts-nocheck
import { GameSocket, type GameSocketStatus, type GameMessage } from './GameSocket.js';
import { getVault } from '../crypto/vault.js';
import { transformToken, type AuthUserResult } from '../token/authUser.js';
import { logger } from '../logger.js';
import { bus, type BusEvent } from '../events/bus.js';
import { saveRoleCache } from './roleCache.js';

const log = logger.child({ mod: 'pool' });

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
}

export class ConnectionPool {
  private entries = new Map<string, PoolEntry>();
  private connectingSlots = 0;
  private readonly maxConcurrent: number;
  private readonly intervalMs: number;
  private readonly idleTimeoutMs: number;
  private readonly defaultGameWsUrl: string;
  private readonly lastActivity = new Map<string, number>();
  private readonly watchers = new Map<string, number>();
  private readonly activeTasks = new Map<string, number>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(opts: {
    maxConcurrent?: number;
    intervalMs?: number;
    idleTimeoutMs?: number;
    defaultGameWsUrl: string;
  }) {
    this.maxConcurrent = opts.maxConcurrent ?? 10;
    this.intervalMs = opts.intervalMs ?? 500;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 5 * 60 * 1000;
    this.defaultGameWsUrl = opts.defaultGameWsUrl;
    this.watchSseActivity();
    if (this.idleTimeoutMs > 0) {
      this.sweepTimer = setInterval(() => this.sweepIdle(), 30_000);
      this.sweepTimer.unref?.();
    }
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
    const socket = new GameSocket({ url: wsUrl });
    const entry: PoolEntry = {
      socket,
      meta,
      status: 'connecting',
      lastError: null,
      connectedAt: new Date().toISOString(),
    };
    this.entries.set(meta.id, entry);
    this.attachHandlers(meta.id, socket);
    this.touch(meta.id);
    await socket.connect();
    return entry;
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.socket.disconnect();
    this.entries.delete(id);
    this.lastActivity.delete(id);
    this.activeTasks.delete(id);
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

  async send<T = unknown>(id: string, cmd: string, params: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
    const entry = this.entries.get(id);
    if (!entry || !entry.socket.isConnected()) {
      throw new Error('token 未连接');
    }
    this.touch(id);
    return entry.socket.send<T>(cmd, params, timeoutMs);
  }

  touch(id: string): void {
    this.lastActivity.set(id, Date.now());
  }

  beginTask(id: string): void {
    this.activeTasks.set(id, (this.activeTasks.get(id) ?? 0) + 1);
    this.touch(id);
    this.refreshPersistent(id);
  }

  endTask(id: string): void {
    const next = (this.activeTasks.get(id) ?? 1) - 1;
    if (next <= 0) this.activeTasks.delete(id);
    else this.activeTasks.set(id, next);
    this.touch(id);
    this.refreshPersistent(id);
  }

  private watchSseActivity(): void {
    const apply = (delta: number, tokenIds: string[] | null) => {
      if (tokenIds === null) {
        for (const id of this.entries.keys()) {
          this.setWatcher(id, (this.watchers.get(id) ?? 0) + delta);
        }
        return;
      }
      for (const id of tokenIds) {
        this.setWatcher(id, (this.watchers.get(id) ?? 0) + delta);
      }
    };
    bus.on('sse.attach', (payload) => apply(1, (payload as { tokenIds?: string[] | null }).tokenIds ?? null));
    bus.on('sse.detach', (payload) => apply(-1, (payload as { tokenIds?: string[] | null }).tokenIds ?? null));
  }

  private setWatcher(id: string, count: number): void {
    if (count <= 0) this.watchers.delete(id);
    else this.watchers.set(id, count);
    this.refreshPersistent(id);
  }

  /** 有活跃任务或 SSE 订阅者时标记连接为 persistent，掉线后持续重连 */
  private refreshPersistent(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.socket.persistent =
      (this.activeTasks.get(id) ?? 0) > 0 || (this.watchers.get(id) ?? 0) > 0;
  }

  private sweepIdle(): void {
    if (this.idleTimeoutMs <= 0) return;
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if ((this.activeTasks.get(id) ?? 0) > 0) continue;
      if ((this.watchers.get(id) ?? 0) > 0) continue;
      const last = this.lastActivity.get(id) ?? Date.parse(entry.connectedAt);
      if (now - last >= this.idleTimeoutMs) {
        log.info({ tokenId: id, idleMs: now - last }, 'idle timeout, disconnecting');
        void this.disconnect(id);
      }
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
    });
  }

  private emitStatus(tokenId: string, status: GameSocketStatus, error?: string): void {
    bus.emit('status', { type: 'ws.status', tokenId, status, error });
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