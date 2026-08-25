/**
 * randomSeed 同步: 移植自原版前端 (src/utils/randomSeed + tokenStore.syncRandomSeedFromStatistics)
 * 游戏服要求登录后将基于 last:login:time 计算的种子回传 (system_custom), 否则会话约180s后被回收
 */

const XOR_A = 2118920861;
const XOR_B = 797788954;
const XOR_C = 1513922175;

export function generateRandomSeed(lastLoginTime?: number | string | null): number {
  if (lastLoginTime === undefined || lastLoginTime === null) return 0;
  const numericTime = Number(lastLoginTime);
  if (Number.isNaN(numericTime)) return 0;

  let seed = numericTime | 0;
  seed ^= XOR_A;
  seed = ((seed << 16) | (seed >>> 16)) >>> 0;
  seed ^= XOR_B;
  seed ^= XOR_C;
  return seed >>> 0;
}

function readStatisticsValue(stats: unknown, key: string): unknown {
  if (!stats || typeof stats !== 'object') return undefined;
  const rec = stats as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(rec, key)) return rec[key];
  return undefined;
}

export function extractLastLoginTimestamp(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, any>;

  const candidateSources = [
    p?.role?.statistics,
    p?.statistics,
    p?.role?.statisticsTime,
    p?.statisticsTime,
  ];
  const candidateKeys = ['last:login:time', 'lastLoginTime', 'last_login_time'];

  for (const stats of candidateSources) {
    if (!stats) continue;
    for (const key of candidateKeys) {
      const value = readStatisticsValue(stats, key);
      if (value !== undefined && value !== null) {
        const numeric = Number(value);
        if (!Number.isNaN(numeric) && numeric > 0) return numeric;
      }
    }
  }
  return null;
}
