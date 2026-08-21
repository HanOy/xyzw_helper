import { describe, it, expect } from 'vitest';
import {
  dailyMatches,
  cronMatches,
  isTaskDue,
  alreadyRanThisMinute,
  shouldRunNow,
} from '../src/tasks/scheduledLogic.js';

function at(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

describe('dailyMatches', () => {
  it('matches exact HH:mm', () => {
    expect(dailyMatches('09:30', at(2026, 1, 1, 9, 30))).toBe(true);
  });
  it('rejects different hour', () => {
    expect(dailyMatches('09:30', at(2026, 1, 1, 10, 30))).toBe(false);
  });
  it('rejects different minute', () => {
    expect(dailyMatches('09:30', at(2026, 1, 1, 9, 31))).toBe(false);
  });
  it('handles single digit gracefully', () => {
    expect(dailyMatches('9:5', at(2026, 1, 1, 9, 5))).toBe(true);
  });
  it('returns false on invalid format', () => {
    expect(dailyMatches('', at(2026, 1, 1, 9, 5))).toBe(false);
    expect(dailyMatches('zz:zz', at(2026, 1, 1, 9, 5))).toBe(false);
  });
});

describe('cronMatches', () => {
  it('returns false for non-5-field expressions', () => {
    expect(cronMatches('0 9', at(2026, 1, 1, 9, 0))).toBe(false);
  });
  it('matches every-minute wildcard', () => {
    expect(cronMatches('* * * * *', at(2026, 1, 1, 9, 0))).toBe(true);
  });
  it('matches specific time', () => {
    expect(cronMatches('0 9 * * *', at(2026, 1, 1, 9, 0))).toBe(true);
    expect(cronMatches('0 9 * * *', at(2026, 1, 1, 9, 1))).toBe(false);
  });
  it('supports step syntax */15', () => {
    expect(cronMatches('*/15 * * * *', at(2026, 1, 1, 0, 0))).toBe(true);
    expect(cronMatches('*/15 * * * *', at(2026, 1, 1, 0, 15))).toBe(true);
    expect(cronMatches('*/15 * * * *', at(2026, 1, 1, 0, 30))).toBe(true);
    expect(cronMatches('*/15 * * * *', at(2026, 1, 1, 0, 10))).toBe(false);
  });
  it('supports ranges and lists', () => {
    expect(cronMatches('0 9-11 * * *', at(2026, 1, 1, 10, 0))).toBe(true);
    expect(cronMatches('0 9-11 * * *', at(2026, 1, 1, 12, 0))).toBe(false);
    expect(cronMatches('0 9,17 * * *', at(2026, 1, 1, 17, 0))).toBe(true);
    expect(cronMatches('0 9,17 * * *', at(2026, 1, 1, 10, 0))).toBe(false);
  });
  it('matches day-of-month', () => {
    expect(cronMatches('0 0 1 * *', at(2026, 1, 1, 0, 0))).toBe(true);
    expect(cronMatches('0 0 1 * *', at(2026, 1, 2, 0, 0))).toBe(false);
  });
  it('matches month', () => {
    expect(cronMatches('0 0 1 1 *', at(2026, 1, 1, 0, 0))).toBe(true);
    expect(cronMatches('0 0 1 2 *', at(2026, 1, 1, 0, 0))).toBe(false);
  });
  it('matches Monday via dow', () => {
    // 2026-01-05 is a Monday
    expect(cronMatches('0 9 * * 1', at(2026, 1, 5, 9, 0))).toBe(true);
    // Sunday should not match Monday field
    expect(cronMatches('0 9 * * 1', at(2026, 1, 4, 9, 0))).toBe(false);
  });
  it('matches Sunday via 0 and via 7', () => {
    // 2026-01-04 is a Sunday
    expect(cronMatches('0 9 * * 0', at(2026, 1, 4, 9, 0))).toBe(true);
    expect(cronMatches('0 9 * * 7', at(2026, 1, 4, 9, 0))).toBe(true);
    // Monday must not match
    expect(cronMatches('0 9 * * 0', at(2026, 1, 5, 9, 0))).toBe(false);
    expect(cronMatches('0 9 * * 7', at(2026, 1, 5, 9, 0))).toBe(false);
  });
});

describe('isTaskDue', () => {
  it('daily due when time matches', () => {
    expect(
      isTaskDue({ runType: 'daily', runTime: '08:00' }, at(2026, 1, 1, 8, 0)),
    ).toBe(true);
  });
  it('daily not due when time differs', () => {
    expect(
      isTaskDue({ runType: 'daily', runTime: '08:00' }, at(2026, 1, 1, 8, 1)),
    ).toBe(false);
  });
  it('daily not due with empty runTime', () => {
    expect(isTaskDue({ runType: 'daily', runTime: '' }, at(2026, 1, 1, 8, 0))).toBe(false);
  });
  it('cron due when expression matches', () => {
    expect(
      isTaskDue({ runType: 'cron', cronExpression: '0 8 * * *' }, at(2026, 1, 1, 8, 0)),
    ).toBe(true);
  });
  it('cron not due when expression mismatches', () => {
    expect(
      isTaskDue({ runType: 'cron', cronExpression: '0 9 * * *' }, at(2026, 1, 1, 8, 0)),
    ).toBe(false);
  });
});

describe('alreadyRanThisMinute', () => {
  it('false when lastRunAt is null', () => {
    expect(alreadyRanThisMinute({ lastRunAt: null }, at(2026, 1, 1, 8, 0))).toBe(false);
  });
  it('true when same minute', () => {
    const now = at(2026, 1, 1, 8, 0);
    expect(
      alreadyRanThisMinute({ lastRunAt: now.toISOString() }, now),
    ).toBe(true);
  });
  it('false when different minute', () => {
    const now = at(2026, 1, 1, 8, 1);
    expect(
      alreadyRanThisMinute({ lastRunAt: at(2026, 1, 1, 8, 0).toISOString() }, now),
    ).toBe(false);
  });
});

describe('shouldRunNow', () => {
  const base = { runType: 'daily' as const, runTime: '08:00', lastRunAt: null };
  it('false when disabled', () => {
    expect(shouldRunNow({ ...base, enabled: false }, at(2026, 1, 1, 8, 0))).toBe(false);
  });
  it('false when not due', () => {
    expect(shouldRunNow({ ...base, enabled: true }, at(2026, 1, 1, 8, 1))).toBe(false);
  });
  it('true when enabled and due and not yet run', () => {
    expect(shouldRunNow({ ...base, enabled: true }, at(2026, 1, 1, 8, 0))).toBe(true);
  });
  it('false when already run this minute', () => {
    const now = at(2026, 1, 1, 8, 0);
    expect(
      shouldRunNow({ ...base, enabled: true, lastRunAt: now.toISOString() }, now),
    ).toBe(false);
  });
});
