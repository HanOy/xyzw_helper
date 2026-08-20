const XOR_A = 2118920861;
const XOR_B = 797788954;
const XOR_C = 1513922175;

export function generateRandomSeed(lastLoginTime?: number | string | null): number {
  if (lastLoginTime === undefined || lastLoginTime === null) {
    return 0;
  }
  const numericTime = Number(lastLoginTime);
  if (Number.isNaN(numericTime)) {
    return 0;
  }
  let seed = numericTime | 0;
  seed ^= XOR_A;
  seed = ((seed << 16) | (seed >>> 16)) >>> 0;
  seed ^= XOR_B;
  seed ^= XOR_C;
  return seed >>> 0;
}