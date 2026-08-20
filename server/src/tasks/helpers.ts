export const HELPER_BATCH_SIZE = 10;
export const HELPER_BATCH_DELAY_MS = 300;
export const HELPER_COMMAND_TIMEOUT_MS = 5000;
export const HELPER_RETRY_DELAY_MS = 1000;
export const HELPER_MAX_RETRIES = 2;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function buildTenBatchPlan(total: number, batchSize: number = HELPER_BATCH_SIZE): number[] {
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
  const safeBatchSize = Math.max(1, Math.trunc(Number(batchSize) || HELPER_BATCH_SIZE));
  const fullBatches = Math.floor(safeTotal / safeBatchSize);
  const remainder = safeTotal % safeBatchSize;
  const plan: number[] = Array.from({ length: fullBatches }, () => safeBatchSize);
  if (remainder > 0) plan.push(remainder);
  return plan;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

export function isRateLimitError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes('400312') || message.includes('操作过快');
}

export function getItemQuantity(roleInfo: any, itemId: number | string): number {
  const item =
    roleInfo?.role?.items?.[itemId] ??
    roleInfo?.role?.items?.[String(itemId)] ??
    roleInfo?.items?.[itemId] ??
    roleInfo?.items?.[String(itemId)];
  const quantity = item?.quantity ?? item?.count ?? 0;
  const numericQuantity = Number(quantity);
  return Number.isFinite(numericQuantity) ? numericQuantity : 0;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'string') {
    value = value.replace(/,/g, '').trim();
  }
  const number = Number(value as unknown);
  return Number.isFinite(number) ? number : null;
}

function pickNumericLeaf(value: unknown): number | null {
  const directNumber = toFiniteNumber(value);
  if (directNumber !== null) return directNumber;
  if (!value || typeof value !== 'object') return null;
  const preferredKeys = [
    'canClaim',
    'claimable',
    'available',
    'value',
    'amount',
    'quantity',
    'count',
    'num',
    'points',
    'score',
  ];
  for (const key of preferredKeys) {
    const number = toFiniteNumber((value as Record<string, unknown>)[key]);
    if (number !== null) return number;
  }
  return null;
}

export function getClaimableBoxPoints(roleInfo: any): number {
  const candidates = [
    roleInfo?.role?.boxPoint,
    roleInfo?.role?.boxPoints,
    roleInfo?.role?.box_point,
    roleInfo?.role?.box_points,
    roleInfo?.role?.boxPointReward,
    roleInfo?.role?.boxPointRewards,
    roleInfo?.role?.box_point_reward,
    roleInfo?.data?.role?.boxPoint,
    roleInfo?.data?.role?.boxPoints,
    roleInfo?.data?.role?.box_point,
    roleInfo?.data?.role?.box_points,
    roleInfo?.data?.role?.boxPointReward,
    roleInfo?.data?.role?.boxPointRewards,
    roleInfo?.data?.role?.box_point_reward,
    roleInfo?.boxPoint,
    roleInfo?.boxPoints,
    roleInfo?.box_point,
    roleInfo?.box_points,
    roleInfo?.boxPointReward,
    roleInfo?.boxPointRewards,
    roleInfo?.box_point_reward,
  ];
  for (const candidate of candidates) {
    const number = pickNumericLeaf(candidate);
    if (number !== null) return Math.max(0, Math.trunc(number));
  }

  const matches: { path: string; number: number }[] = [];
  const seen = new Set<unknown>();
  const scan = (value: unknown, path = '', depth = 0): void => {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (/box[_-]?points?|box.*point|point.*box/i.test(key)) {
        const number = pickNumericLeaf(child);
        if (number !== null) matches.push({ path: nextPath, number });
      }
      scan(child, nextPath, depth + 1);
    }
  };
  scan(roleInfo);
  if (matches.length === 0) return 0;
  matches.sort((left, right) => {
    const leftClaimScore = /claim|available|reward/i.test(left.path) ? 1 : 0;
    const rightClaimScore = /claim|available|reward/i.test(right.path) ? 1 : 0;
    return rightClaimScore - leftClaimScore;
  });
  return Math.max(0, Math.trunc(matches[0].number));
}