import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { bus } from '../events/bus.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'task' });

export type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface TaskLogInput {
  runId: string;
  tokenId?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export function createRun(opts: { type: string; tokenId?: string; batchId?: string; settings?: Record<string, unknown> }): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO task_runs(id, token_id, batch_id, type, status, current, total, settings, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, 0, ?, ?)`,
  ).run(id, opts.tokenId ?? null, opts.batchId ?? null, opts.type, JSON.stringify(opts.settings ?? {}), now);
  return id;
}

export function updateRun(id: string, patch: Partial<{
  status: RunStatus;
  current: number;
  total: number;
  stage: string;
  startedAt: string;
  finishedAt: string;
  cancelledAt: string;
  error: string;
}>): void {
  const fields: string[] = [];
  const params: unknown[] = [];
  if (patch.status) {
    fields.push('status = ?');
    params.push(patch.status);
  }
  if (patch.current !== undefined) {
    fields.push('current = ?');
    params.push(patch.current);
  }
  if (patch.total !== undefined) {
    fields.push('total = ?');
    params.push(patch.total);
  }
  if (patch.stage !== undefined) {
    fields.push('stage = ?');
    params.push(patch.stage);
  }
  if (patch.startedAt) {
    fields.push('started_at = ?');
    params.push(patch.startedAt);
  }
  if (patch.finishedAt) {
    fields.push('finished_at = ?');
    params.push(patch.finishedAt);
  }
  if (patch.cancelledAt) {
    fields.push('cancelled_at = ?');
    params.push(patch.cancelledAt);
  }
  if (patch.error) {
    fields.push('error = ?');
    params.push(patch.error);
  }
  if (!fields.length) return;
  params.push(id);
  db.prepare(`UPDATE task_runs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function getRun(id: string): Record<string, unknown> | null {
  const row = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id);
  return row ? (row as Record<string, unknown>) : null;
}

export function isCancelled(id: string): boolean {
  const row = db.prepare('SELECT cancelled_at FROM task_runs WHERE id = ?').get(id) as
    | { cancelled_at: string | null }
    | undefined;
  return !!(row && row.cancelled_at);
}

export function taskLog({ runId, tokenId, level, message }: TaskLogInput): void {
  const ts = new Date().toISOString();
  db.prepare('INSERT INTO task_logs(run_id, token_id, level, message, ts) VALUES (?, ?, ?, ?, ?)').run(
    runId,
    tokenId ?? null,
    level,
    message,
    ts,
  );
  bus.emit('task', { type: 'task.log', runId, tokenId, level, message, ts });
  log[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info']({ runId, tokenId, message }, 'task-log');
}

export function taskProgress(runId: string, current: number, total: number, stage?: string): void {
  bus.emit('task', { type: 'task.progress', runId, current, total, stage });
  updateRun(runId, { current, total, stage });
}