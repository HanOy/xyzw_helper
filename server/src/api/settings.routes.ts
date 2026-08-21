import type { FastifyInstance } from 'fastify';
import {
  getSetting,
  setSetting,
  deleteSetting,
  listSettings,
} from '../settings/settingsService.js';

interface PutBody {
  value: unknown;
}

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', { preHandler: app.authPreHandler }, async (req) => {
    const prefix = (req.query as { prefix?: string }).prefix;
    return { success: true, data: listSettings(prefix) };
  });

  app.get<{ Params: { key: string } }>(
    '/api/settings/:key',
    { preHandler: app.authPreHandler },
    async (req) => {
      const key = decodeURIComponent(req.params.key);
      const value = getSetting(key);
      return { success: true, data: value === null ? null : { key, value } };
    },
  );

  app.put<{ Params: { key: string }; Body: PutBody }>(
    '/api/settings/:key',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const key = decodeURIComponent(req.params.key);
      const value = req.body?.value;
      if (value === undefined) {
        reply.code(400);
        return { success: false, message: 'value 必填' };
      }
      const stored = typeof value === 'string' ? value : JSON.stringify(value);
      setSetting(key, stored);
      return { success: true, data: { key, value: stored } };
    },
  );

  app.delete<{ Params: { key: string } }>(
    '/api/settings/:key',
    { preHandler: app.authPreHandler },
    async (req) => {
      const key = decodeURIComponent(req.params.key);
      deleteSetting(key);
      return { success: true };
    },
  );
}
