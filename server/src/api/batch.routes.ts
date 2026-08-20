import type { FastifyInstance } from 'fastify';
import { runBatchDailyTasks, cancelRun } from '../tasks/taskRunner.js';

export function registerBatchRoutes(app: FastifyInstance): void {
  app.post<{ Body: { tokenIds: string[]; settings?: Record<string, unknown> } }>(
    '/api/batch/daily-tasks',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      if (!req.body?.tokenIds?.length) {
        reply.code(400);
        return { success: false, message: 'tokenIds 不能为空' };
      }
      const batchId = await runBatchDailyTasks(req.body);
      return { success: true, data: { batchId } };
    },
  );

  app.post<{ Params: { batchId: string } }>(
    '/api/batch/:batchId/stop',
    { preHandler: app.authPreHandler },
    async (req) => {
      await cancelRun(req.params.batchId);
      return { success: true };
    },
  );
}