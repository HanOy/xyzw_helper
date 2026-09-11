import { connectionPool } from '../../game/poolSingleton.js';

export const FISH_TARGET = 320;
export const ARENA_TARGET = 240;

export function getTodayStartSec(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function isTodayAvailable(lastTimeSec?: number): boolean {
  if (!lastTimeSec || typeof lastTimeSec !== 'number') return true;
  return lastTimeSec < getTodayStartSec();
}

export function calculateMonthProgress(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  return Math.min(1, Math.max(0, dayOfMonth / daysInMonth));
}

export function pickArenaTargetId(targets: any): number | null {
  const candidate =
    targets?.targets?.[0] ||
    targets?.targetList?.[0] ||
    targets?.roleList?.[0] ||
    targets?.list?.[0] ||
    targets?.rankList?.[0];
  if (candidate?.roleId) return candidate.roleId;
  if (candidate?.id) return candidate.id;
  return targets?.roleId || targets?.id || null;
}

export function defaultDailySettings(): Record<string, unknown> {
  return {
    arenaFormation: 2,
    towerFormation: 1,
    bossFormation: 1,
    bossTimes: 2,
    claimBottle: true,
    payRecruit: true,
    openBox: true,
    arenaEnable: true,
    claimHangUp: true,
    claimEmail: true,
    blackMarketPurchase: true,
    freeGachaEnable: true,
  };
}

export function defaultBatchSettings(): Record<string, unknown> {
  return {
    boxCount: 100,
    fishCount: 100,
    recruitCount: 100,
    defaultBoxType: 2001,
    defaultFishType: 1,
    receiverId: '',
    password: '',
    useGoldRefreshFallback: false,
    tokenListColumns: 2,
    commandDelay: 500,
    taskDelay: 500,
    actionDelay: 500,
    battleDelay: 500,
    refreshDelay: 500,
    longDelay: 1000,
    maxActive: 2,
    carMinColor: 4,
    connectionTimeout: 10000,
    reconnectDelay: 1000,
    maxLogEntries: 1000,
    smartDepartureGoldThreshold: 0,
    smartDepartureRecruitThreshold: 0,
    smartDepartureJadeThreshold: 0,
    smartDepartureTicketThreshold: 0,
    smartDepartureMatchAll: false,
    dreamPurchaseList: [],
  };
}

/** 单个 token 的最大尝试次数: 首次 + 一次连接层重试 */
export const TOKEN_MAX_ATTEMPTS = 2;

/**
 * 连接层瞬时错误: 连接断开/尚未就绪/建连超时。
 * 这类错误与业务无关, 等重连恢复后重试即可成功, 不应直接判定账号失败。
 */
const TRANSIENT_CONN_RE = /connection closed|connection timeout|token 未连接|WebSocket 未连接/i;

export function isTransientConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return TRANSIENT_CONN_RE.test(msg);
}

/**
 * 等待自动重连恢复 (轮询 readyState)。
 * 超时不抛错 — 交由调用方下一轮的 ensureConnection 兜底, 保持流程简单。
 */
export async function waitForReconnect(tokenId: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (connectionPool.get(tokenId)?.socket.isConnected()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
