import type { FastifyInstance } from 'fastify';
import { tokenService, type TokenImportRequest, type TokenPublic } from '../token/TokenService.js';
import { connectionPool } from '../game/poolSingleton.js';
import { listRoleCache } from '../game/roleCache.js';

export function registerTokenRoutes(app: FastifyInstance): void {
  app.get(
    '/api/tokens',
    { preHandler: app.authPreHandler },
    async (): Promise<{ success: true; data: TokenPublic[] }> => {
      const list = tokenService.list().map((t) => attachStatus(t));
      return { success: true, data: list };
    },
  );

  app.post<{ Body: TokenImportRequest }>(
    '/api/tokens',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      try {
        const data = await tokenService.importOne(req.body);
        return { success: true, data };
      } catch (err) {
        reply.code(400);
        return { success: false, message: (err as Error).message };
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/tokens/:id',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const t = tokenService.get(req.params.id);
      if (!t) {
        reply.code(404);
        return { success: false, message: 'token 不存在' };
      }
      return { success: true, data: attachStatus(t) };
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Pick<TokenPublic, 'name' | 'remark' | 'avatar' | 'wsUrl'>> }>(
    '/api/tokens/:id',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      try {
        const t = tokenService.update(req.params.id, req.body ?? {});
        return { success: true, data: attachStatus(t) };
      } catch (err) {
        reply.code(404);
        return { success: false, message: (err as Error).message };
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/tokens/:id',
    { preHandler: app.authPreHandler },
    async (req) => {
      await connectionPool.disconnect(req.params.id).catch(() => undefined);
      tokenService.delete(req.params.id);
      return { success: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/tokens/:id/refresh',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      try {
        const t = await tokenService.refreshByUrl(req.params.id);
        return { success: true, data: t };
      } catch (err) {
        reply.code(400);
        return { success: false, message: (err as Error).message };
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/tokens/:id/data',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const t = tokenService.get(req.params.id);
      if (!t) {
        reply.code(404);
        return { success: false, message: 'token 不存在' };
      }
      const data = listRoleCache(req.params.id);
      return { success: true, data };
    },
  );
}

function attachStatus(t: TokenPublic): TokenPublic {
  const entry = connectionPool.get(t.id);
  return { ...t, status: entry?.status ?? 'disconnected' };
}