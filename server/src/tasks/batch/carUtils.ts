const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export function normalizeCars(raw: any): any[] {
  const r = raw || {};
  const body = r.body || r;
  const roleCar = body.roleCar || body.rolecar || {};

  const carMap = roleCar.carDataMap || roleCar.cardatamap;
  if (carMap && typeof carMap === 'object') {
    return Object.entries(carMap).map(([id, info]: any, idx) => ({
      key: idx,
      id,
      ...(info || {}),
    }));
  }

  let arr = body.cars || body.list || body.data || body.carList || body.vehicles || [];
  if (!Array.isArray(arr) && typeof arr === 'object' && arr !== null) arr = Object.values(arr);
  if (Array.isArray(body) && arr.length === 0) arr = body;
  return (Array.isArray(arr) ? arr : []).map((it: any, idx: number) => ({ key: idx, ...it }));
}

export function gradeLabel(color: number): string {
  const map: Record<number, string> = {
    1: '绿·普通',
    2: '蓝·稀有',
    3: '紫·史诗',
    4: '橙·传说',
    5: '红·神话',
    6: '金·传奇',
  };
  return map[color] || '未知';
}

const bigPrizes = [
  { type: 3, itemId: 3201, value: 10 },
  { type: 3, itemId: 1001, value: 10 },
  { type: 3, itemId: 1022, value: 2000 },
  { type: 2, itemId: 0, value: 2000 },
  { type: 3, itemId: 1023, value: 5 },
  { type: 3, itemId: 1022, value: 2500 },
  { type: 3, itemId: 1001, value: 12 },
];

export function isBigPrize(rewards: any[]): boolean {
  if (!Array.isArray(rewards)) return false;
  return bigPrizes.some((p) =>
    rewards.find(
      (r) =>
        r.type === p.type &&
        r.itemId === p.itemId &&
        Number(r.value || 0) >= p.value,
    ),
  );
}

export function countRacingRefreshTickets(rewards: any[]): number {
  if (!Array.isArray(rewards)) return 0;
  return rewards.reduce(
    (acc, r) => acc + (r.type === 3 && r.itemId === 35002 ? Number(r.value || 0) : 0),
    0,
  );
}

function checkRewardConditions(
  rewards: any[],
  conditions: { gold?: number; recruit?: number; jade?: number; ticket?: number },
  matchAll = false,
): boolean {
  if (!Array.isArray(rewards) || !conditions) return false;
  const { gold, recruit, jade, ticket } = conditions;
  if (!gold && !recruit && !jade && !ticket) return false;

  let goldCount = 0;
  let recruitCount = 0;
  let jadeCount = 0;
  let ticketCount = 0;

  rewards.forEach((r) => {
    const val = Number(r.value || r.num || r.quantity || r.count || 0);
    const type = Number(r.type || 0);
    const itemId = Number(r.itemId || 0);
    if (type === 2) goldCount += val;
    if (itemId === 1001) recruitCount += val;
    if (itemId === 1022) jadeCount += val;
    if (itemId === 35002) ticketCount += val;
  });

  if (matchAll) {
    if (gold && goldCount < gold) return false;
    if (recruit && recruitCount < recruit) return false;
    if (jade && jadeCount < jade) return false;
    if (ticket && ticketCount < ticket) return false;
    return true;
  }
  if (gold && goldCount >= gold) return true;
  if (recruit && recruitCount >= recruit) return true;
  if (jade && jadeCount >= jade) return true;
  if (ticket && ticketCount >= ticket) return true;
  return false;
}

export function shouldSendCar(
  car: any,
  tickets: number,
  minColor = 4,
  customConditions: { gold?: number; recruit?: number; jade?: number; ticket?: number } = {},
  useGoldRefreshFallback = false,
  matchAll = false,
): boolean {
  const color = Number(car?.color || 0);
  const rewards = Array.isArray(car?.rewards) ? car.rewards : [];

  const customConditionsMet = checkRewardConditions(rewards, customConditions, matchAll);

  if (useGoldRefreshFallback) {
    if (color < minColor) return false;
    const hasConditions = Boolean(
      customConditions.gold || customConditions.recruit || customConditions.jade || customConditions.ticket,
    );
    if (hasConditions) return customConditionsMet;
    return true;
  }

  if (customConditionsMet) return true;

  const racingTickets = countRacingRefreshTickets(rewards);
  if (tickets >= 6) {
    return color >= minColor && (color >= 5 || racingTickets >= 4 || isBigPrize(rewards));
  }
  return color >= minColor || racingTickets >= 2 || isBigPrize(rewards);
}

export function canClaim(car: any): boolean {
  const t = Number(car?.sendAt || 0);
  if (!t) return false;
  const tsMs = t < 1e12 ? t * 1000 : t;
  return Date.now() - tsMs >= FOUR_HOURS_MS;
}
