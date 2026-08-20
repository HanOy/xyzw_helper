import { describe, it, expect } from 'vitest';
import { buildTenBatchPlan, getItemQuantity, getClaimableBoxPoints } from '../src/tasks/helpers.js';

describe('helpers', () => {
  it('builds batch plan of size 10', () => {
    const plan = buildTenBatchPlan(35);
    expect(plan).toEqual([10, 10, 10, 5]);
  });

  it('handles totals smaller than batch size', () => {
    expect(buildTenBatchPlan(0)).toEqual([]);
    expect(buildTenBatchPlan(7)).toEqual([7]);
  });

  it('respects custom batch size', () => {
    expect(buildTenBatchPlan(20, 5)).toEqual([5, 5, 5, 5]);
  });

  it('extracts item quantity from roleInfo', () => {
    expect(
      getItemQuantity({ role: { items: { 1001: { quantity: 42 } } } }, 1001),
    ).toBe(42);
    expect(
      getItemQuantity({ role: { items: { '1002': { count: 7 } } } }, '1002'),
    ).toBe(7);
    expect(getItemQuantity({}, 999)).toBe(0);
  });

  it('finds boxPoints in nested candidates', () => {
    const data = { role: { boxPoints: 17 } };
    expect(getClaimableBoxPoints(data)).toBe(17);
  });

  it('returns 0 when no claimable points found', () => {
    expect(getClaimableBoxPoints({})).toBe(0);
  });
});