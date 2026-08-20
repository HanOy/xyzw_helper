import type { FastifyInstance } from 'fastify';
import { runDailyTasks } from '../tasks/DailyTaskRunner.js';
import { cancelRun } from '../tasks/taskRunner.js';
import { getRun } from '../tasks/runState.js';
import { db } from '../db/index.js';

export function registerTaskRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string }; Body: { settings?: Record<string, unknown> } }>(
    '/api/tokens/:id/tasks/daily',
    { preHandler: app.authPreHandler },
    async (req) => {
      const runId = await runDailyTasks(req.params.id, req.body?.settings as any);
      return { success: true, data: { runId } };
    },
  );

  app.post<{ Params: { runId: string } }>(
    '/api/tasks/:runId/cancel',
    { preHandler: app.authPreHandler },
    async (req) => {
      await cancelRun(req.params.runId);
      return { success: true };
    },
  );

  app.get<{ Params: { runId: string } }>(
    '/api/tasks/:runId',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const run = getRun(req.params.runId);
      if (!run) {
        reply.code(404);
        return { success: false, message: 'run 不存在' };
      }
      return { success: true, data: serializeRun(run) };
    },
  );

  app.get<{ Querystring: { tokenId?: string; limit?: string } }>(
    '/api/tasks',
    { preHandler: app.authPreHandler },
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const where: string[] = [];
      const params: unknown[] = [];
      if (req.query.tokenId) {
        where.push('token_id = ?');
        params.push(req.query.tokenId);
      }
      const sql = `SELECT * FROM task_runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY created_at DESC LIMIT ?`;
      const rows = db.prepare(sql).all(...params, limit) as Record<string, unknown>[];
      return { success: true, data: rows.map(serializeRun) };
    },
  );
}

function serializeRun(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    tokenId: row.token_id,
    batchId: row.batch_id,
    type: row.type,
    status: row.status,
    current: row.current,
    total: row.total,
    stage: row.stage,
    settings: row.settings ? safeJson(row.settings as string) : null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    cancelledAt: row.cancelled_at,
    error: row.error,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}