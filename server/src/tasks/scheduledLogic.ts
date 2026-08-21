export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function dailyMatches(runTime: string, now: Date): boolean {
  const [h, m] = runTime.split(':').map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  return now.getHours() === h && now.getMinutes() === m;
}

function matchesField(value: number, field: string): boolean {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = Number(stepStr);
      if (Number.isNaN(step) || step < 1) return false;
      const [lo, hi] = range === '*' ? [0, 59] : range.split('-').map(Number);
      if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      continue;
    }
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      if (value >= lo && value <= hi) return true;
      continue;
    }
    if (Number(part) === value) return true;
  }
  return false;
}

export function cronMatches(expression: string, now: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  const dowValue = now.getDay();
  const dowMatches =
    matchesField(dowValue, dow) || (dowValue === 0 && matchesField(7, dow));
  return (
    matchesField(now.getMinutes(), minute) &&
    matchesField(now.getHours(), hour) &&
    matchesField(now.getDate(), dom) &&
    matchesField(now.getMonth() + 1, month) &&
    dowMatches
  );
}

export function isTaskDue(
  task: { runType: 'daily' | 'cron'; runTime?: string | null; cronExpression?: string | null },
  now: Date,
): boolean {
  if (task.runType === 'daily') {
    return task.runTime ? dailyMatches(task.runTime, now) : false;
  }
  return task.cronExpression ? cronMatches(task.cronExpression, now) : false;
}

export function alreadyRanThisMinute(
  task: { lastRunAt?: string | null },
  now: Date,
): boolean {
  if (!task.lastRunAt) return false;
  const last = new Date(task.lastRunAt);
  return (
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate() &&
    last.getHours() === now.getHours() &&
    last.getMinutes() === now.getMinutes()
  );
}

export function shouldRunNow(
  task: {
    enabled: boolean;
    runType: 'daily' | 'cron';
    runTime?: string | null;
    cronExpression?: string | null;
    lastRunAt?: string | null;
  },
  now: Date,
): boolean {
  if (!task.enabled) return false;
  if (!isTaskDue(task, now)) return false;
  return !alreadyRanThisMinute(task, now);
}
