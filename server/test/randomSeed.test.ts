import { describe, it, expect } from 'vitest';
import { generateRandomSeed } from '../src/game/RandomSeed.js';

describe('generateRandomSeed', () => {
  it('returns 0 for missing input', () => {
    expect(generateRandomSeed()).toBe(0);
    expect(generateRandomSeed(null)).toBe(0);
    expect(generateRandomSeed(undefined)).toBe(0);
  });

  it('returns 0 for non-numeric input', () => {
    expect(generateRandomSeed('not a number')).toBe(0);
  });

  it('produces deterministic uint32 output', () => {
    const a = generateRandomSeed(1700000000);
    const b = generateRandomSeed(1700000000);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs for different timestamps', () => {
    const a = generateRandomSeed(1700000000);
    const b = generateRandomSeed(1700000001);
    expect(a).not.toBe(b);
  });

  it('accepts string timestamp', () => {
    const a = generateRandomSeed(1700000000);
    const b = generateRandomSeed('1700000000');
    expect(a).toBe(b);
  });
});