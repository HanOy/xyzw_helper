import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';

export function registerLogsRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { tokenId?: string; runId?: string; page?: string; limit?: string } }>(
    '/api/logs',
    { preHandler: app.authPreHandler },
    async (req) => {
      const { tokenId, runId } = req.query;
      const page = Number(req.query.page ?? 1);
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const where: string[] = [];
      const params: unknown[] = [];
      if (runId) {
        where.push('run_id = ?');
        params.push(runId);
      } else if (tokenId) {
        where.push('token_id = ?');
        params.push(tokenId);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const offset = (page - 1) * limit;
      const rows = db
        .prepare(
          `SELECT id, run_id, token_id, level, message, ts FROM task_logs ${whereSql}
           ORDER BY id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset) as {
        id: number;
        run_id: string;
        token_id: string | null;
        level: string;
        message: string;
        ts: string;
      }[];
      return {
        success: true,
        data: {
          page,
          limit,
          items: rows.map((r) => ({
            id: r.id,
            runId: r.run_id,
            tokenId: r.token_id,
            level: r.level,
            message: r.message,
            ts: r.ts,
          })),
        },
      };
    },
  );
}