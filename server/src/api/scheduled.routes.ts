import type { FastifyInstance } from 'fastify';
import {
  listScheduledTasks,
  getScheduledTask,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  setTaskEnabled,
  type ScheduledTaskInput,
} from '../tasks/scheduledTasks.js';
import { runScheduledTaskNow } from '../tasks/scheduler.js';

interface CreateBody {
  name: string;
  runType: 'daily' | 'cron';
  runTime?: string | null;
  cronExpression?: string | null;
  tokenIds: string[];
  selectedTasks?: string[];
  taskType?: string;
  enabled?: boolean;
}

function normalizeInput(body: CreateBody): ScheduledTaskInput {
  return {
    name: body.name,
    runType: body.runType,
    runTime: body.runTime ?? null,
    cronExpression: body.cronExpression ?? null,
    tokenIds: Array.isArray(body.tokenIds) ? body.tokenIds : [],
    selectedTasks: Array.isArray(body.selectedTasks) ? body.selectedTasks : [],
    taskType: body.taskType === 'daily' ? 'daily' : 'daily',
    enabled: body.enabled,
  };
}

export function registerScheduledRoutes(app: FastifyInstance): void {
  app.get('/api/scheduled-tasks', { preHandler: app.authPreHandler }, async () => {
    return { success: true, data: listScheduledTasks() };
  });

  app.post<{ Body: CreateBody }>(
    '/api/scheduled-tasks',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      if (!req.body?.name || !req.body?.runType || !Array.isArray(req.body?.tokenIds)) {
        reply.code(400);
        return { success: false, message: 'name/runType/tokenIds 必填' };
      }
      const task = createScheduledTask(normalizeInput(req.body));
      return { success: true, data: task };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/scheduled-tasks/:id',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const task = getScheduledTask(req.params.id);
      if (!task) {
        reply.code(404);
        return { success: false, message: '定时任务不存在' };
      }
      return { success: true, data: task };
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<CreateBody> }>(
    '/api/scheduled-tasks/:id',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const task = updateScheduledTask(req.params.id, normalizeInput(req.body as CreateBody));
      if (!task) {
        reply.code(404);
        return { success: false, message: '定时任务不存在' };
      }
      return { success: true, data: task };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/scheduled-tasks/:id',
    { preHandler: app.authPreHandler },
    async (req) => {
      const ok = deleteScheduledTask(req.params.id);
      return { success: ok };
    },
  );

  app.post<{ Params: { id: string }; Body: { enabled?: boolean } }>(
    '/api/scheduled-tasks/:id/toggle',
    { preHandler: app.authPreHandler },
    async (req) => {
      const enabled = req.body?.enabled ?? true;
      const task = setTaskEnabled(req.params.id, enabled);
      if (!task) {
        return { success: false, message: '定时任务不存在' };
      }
      return { success: true, data: task };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/scheduled-tasks/:id/run',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      try {
        const batchId = await runScheduledTaskNow(req.params.id);
        return { success: true, data: { batchId } };
      } catch (err) {
        reply.code(400);
        return { success: false, message: (err as Error).message };
      }
    },
  );
}
