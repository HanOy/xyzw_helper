import { db } from '../db/index.js';
import { logger } from '../logger.js';
import {
  dailyMatches,
  cronMatches,
  isTaskDue,
  shouldRunNow,
  alreadyRanThisMinute,
} from './scheduledLogic.js';

const log = logger.child({ mod: 'scheduled-tasks' });

export {
  dailyMatches,
  cronMatches,
  isTaskDue,
  shouldRunNow,
  alreadyRanThisMinute,
};

export type RunType = 'daily' | 'cron';
export type TaskType = 'daily';

export interface ScheduledTask {
  id: string;
  name: string;
  runType: RunType;
  runTime: string | null;
  cronExpression: string | null;
  tokenIds: string[];
  selectedTasks: string[];
  taskType: TaskType;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskInput {
  name: string;
  runType: RunType;
  runTime?: string | null;
  cronExpression?: string | null;
  tokenIds: string[];
  selectedTasks?: string[];
  taskType?: TaskType;
  enabled?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  return 'st_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function rowToTask(row: Record<string, unknown>): ScheduledTask {
  return {
    id: row.id as string,
    name: row.name as string,
    runType: row.run_type as RunType,
    runTime: (row.run_time as string) ?? null,
    cronExpression: (row.cron_expression as string) ?? null,
    tokenIds: JSON.parse((row.token_ids as string) ?? '[]'),
    selectedTasks: JSON.parse((row.selected_tasks as string) ?? '[]'),
    taskType: (row.task_type as TaskType) ?? 'daily',
    enabled: Number(row.enabled) === 1,
    lastRunAt: (row.last_run_at as string) ?? null,
    lastStatus: (row.last_status as string) ?? null,
    lastError: (row.last_error as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listScheduledTasks(): ScheduledTask[] {
  const rows = db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as Record<string, unknown>[];
  return rows.map(rowToTask);
}

export function getScheduledTask(id: string): ScheduledTask | null {
  const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToTask(row) : null;
}

export function createScheduledTask(input: ScheduledTaskInput): ScheduledTask {
  const id = genId();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO scheduled_tasks
       (id, name, run_type, run_time, cron_expression, token_ids, selected_tasks, task_type, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.runType,
    input.runTime ?? null,
    input.cronExpression ?? null,
    JSON.stringify(input.tokenIds ?? []),
    JSON.stringify(input.selectedTasks ?? []),
    input.taskType ?? 'daily',
    input.enabled === false ? 0 : 1,
    ts,
    ts,
  );
  return getScheduledTask(id)!;
}

export function updateScheduledTask(id: string, input: Partial<ScheduledTaskInput>): ScheduledTask | null {
  const existing = getScheduledTask(id);
  if (!existing) return null;
  const merged = {
    name: input.name ?? existing.name,
    runType: input.runType ?? existing.runType,
    runTime: input.runTime !== undefined ? input.runTime : existing.runTime,
    cronExpression:
      input.cronExpression !== undefined ? input.cronExpression : existing.cronExpression,
    tokenIds: input.tokenIds ?? existing.tokenIds,
    selectedTasks: input.selectedTasks ?? existing.selectedTasks,
    taskType: input.taskType ?? existing.taskType,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : (existing.enabled ? 1 : 0),
  };
  db.prepare(
    `UPDATE scheduled_tasks
       SET name = ?, run_type = ?, run_time = ?, cron_expression = ?, token_ids = ?, selected_tasks = ?, task_type = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.name,
    merged.runType,
    merged.runTime,
    merged.cronExpression,
    JSON.stringify(merged.tokenIds),
    JSON.stringify(merged.selectedTasks),
    merged.taskType,
    merged.enabled,
    nowIso(),
    id,
  );
  return getScheduledTask(id);
}

export function deleteScheduledTask(id: string): boolean {
  const res = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
  return res.changes > 0;
}

export function markTaskRun(id: string, status: string, error?: string): void {
  db.prepare(
    `UPDATE scheduled_tasks SET last_run_at = ?, last_status = ?, last_error = ? WHERE id = ?`,
  ).run(nowIso(), status, error ?? null, id);
}

export function setTaskEnabled(id: string, enabled: boolean): ScheduledTask | null {
  return updateScheduledTask(id, { enabled });
}

export const scheduledTaskLog = log;
