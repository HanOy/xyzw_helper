import { connectionPool } from '../../game/poolSingleton.js';
import { tokenService } from '../../token/TokenService.js';
import { getSetting } from '../../settings/settingsService.js';
import { taskLog } from '../runState.js';
import { logger } from '../../logger.js';
import type { ConnectionMeta } from '../../game/ConnectionPool.js';
import { defaultDailySettings, defaultBatchSettings } from './helpers.js';

const batchLog = logger.child({ mod: 'batch' });

export interface BatchContextOptions {
  runId: string;
  tokenId: string;
  batchSettings?: Record<string, unknown>;
  dailySettings?: Record<string, unknown>;
  helperSettings?: Record<string, unknown>;
  weirdTowerMaxClimb?: number;
  receiverId?: string;
  securityPassword?: string;
  giftQuantity?: number;
  shouldStop?: () => boolean;
}

type LogLevel = 'info' | 'warn' | 'error' | 'success';

/**
 * 批量操作的统一依赖上下文，等价于前端 createTaskDeps 提供的 deps。
 * 游戏指令通过 connectionPool.send 发送，返回体与前端 api.tokens.command 的 resp.data 一致。
 */
export class BatchContext {
  runId: string;
  tokenId: string;
  batchSettings: Record<string, unknown>;
  dailySettings: Record<string, unknown>;
  helperSettings: Record<string, unknown>;
  weirdTowerMaxClimb: number;
  receiverId: string;
  securityPassword: string;
  giftQuantity: number;
  itemId = 37007;
  private _shouldStop: () => boolean;
  private meta: ConnectionMeta;
  private roleCache: any = null;

  constructor(opts: BatchContextOptions) {
    this.runId = opts.runId;
    this.tokenId = opts.tokenId;
    this.batchSettings = { ...defaultBatchSettings(), ...(opts.batchSettings ?? {}) };
    this.dailySettings = { ...defaultDailySettings(), ...(opts.dailySettings ?? {}) };
    this.helperSettings = { ...(opts.helperSettings ?? {}) };
    this.weirdTowerMaxClimb = opts.weirdTowerMaxClimb ?? 0;
    this.receiverId = opts.receiverId ?? '';
    this.securityPassword = opts.securityPassword ?? '';
    this.giftQuantity = opts.giftQuantity ?? 1;
    this._shouldStop = opts.shouldStop ?? (() => false);
    const m = tokenService.toConnectionMeta(opts.tokenId);
    if (!m) throw new Error('token 不存在');
    this.meta = m;
  }

  async send<T = any>(cmd: string, params: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
    return connectionPool.send<T>(this.tokenId, cmd, params, timeoutMs) as Promise<T>;
  }

  async sendNoAck(cmd: string, params: Record<string, unknown> = {}): Promise<void> {
    try {
      await this.send(cmd, params, 8000);
    } catch {
      // 吞掉异常，等价前端 sendMessage 的 fire-and-forget
    }
  }

  log(level: LogLevel, message: string): void {
    taskLog({ runId: this.runId, tokenId: this.tokenId, level, message });
  }

  sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  get delayConfig(): Record<string, number> {
    const bs = this.batchSettings as any;
    return {
      command: bs.commandDelay ?? 500,
      task: bs.taskDelay ?? 500,
      action: bs.actionDelay ?? 500,
      battle: bs.battleDelay ?? 500,
      refresh: bs.refreshDelay ?? 500,
      long: bs.longDelay ?? 1000,
    };
  }

  get shouldStop(): boolean {
    return this._shouldStop();
  }

  async ensureConnection(timeoutMs = 15000): Promise<void> {
    await connectionPool.ensureConnection(this.meta, timeoutMs);
  }

  async getRoleInfo(force = false): Promise<any> {
    if (!force && this.roleCache) return this.roleCache;
    const ri = await this.send('role_getroleinfo', {});
    this.roleCache = ri;
    return ri;
  }

  get role(): any {
    return this.roleCache?.role;
  }

  async loadSettings(tokenId = this.tokenId): Promise<any> {
    const raw = getSetting(`daily-settings:${tokenId}`);
    if (!raw) return defaultDailySettings();
    try {
      return { ...defaultDailySettings(), ...JSON.parse(raw) };
    } catch {
      return defaultDailySettings();
    }
  }
}
