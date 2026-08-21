import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { bus } from '../events/bus.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'task' });

// 同一 token 的批量任务(日常补差 / 批量操作)按 FIFO 串行执行：
// 后者入队,等前者(及其队列)跑完再执行,避免两套循环在同一 WS 连接上交错抢状态。
// 不限制单条手动指令(手动指令走发送队列本就串行)。
const runningBatchTokens = new Set<string>();
const tokenBatchQueues = new Map<string, Array<() => Promise<void>>>();

export function enqueueBatchToken(tokenId: string, fn: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve) => {
    const wrapped = async (): Promise<void> => {
      try {
        await fn();
      } catch {
        // fn 内部已记录日志
      } finally {
        resolve();
      }
    };
    if (runningBatchTokens.has(tokenId)) {
      const q = tokenBatchQueues.get(tokenId) ?? [];
      q.push(wrapped);
      tokenBatchQueues.set(tokenId, q);
      return;
    }
    runningBatchTokens.add(tokenId);
    void runTokenBatchQueue(tokenId, wrapped);
  });
}

async function runTokenBatchQueue(tokenId: string, first: () => Promise<void>): Promise<void> {
  let fn: (() => Promise<void>) | undefined = first;
  try {
    while (fn) {
      await fn();
      const q = tokenBatchQueues.get(tokenId);
      fn = q && q.length ? (q.shift() as () => Promise<void>) : undefined;
    }
  } finally {
    tokenBatchQueues.delete(tokenId);
    runningBatchTokens.delete(tokenId);
  }
}

export type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface TaskLogInput {
  runId: string;
  tokenId?: string;
  level: 'info' | 'warn' | 'error' | 'success';
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