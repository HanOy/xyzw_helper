import type { FastifyInstance } from 'fastify';
import { connectionPool } from '../game/poolSingleton.js';
import { tokenService } from '../token/TokenService.js';
import { listRoleCache } from '../game/roleCache.js';
import { getServerList } from '../token/authUser.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'game-routes' });

export function registerGameRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/api/tokens/:id/connect',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const meta = tokenService.toConnectionMeta(req.params.id);
      if (!meta) {
        reply.code(404);
        return { success: false, message: 'token 不存在' };
      }
      try {
        await connectionPool.connect(meta);
        return { success: true, data: { status: 'connected' } };
      } catch (err) {
        reply.code(500);
        return { success: false, message: (err as Error).message };
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/tokens/:id/disconnect',
    { preHandler: app.authPreHandler },
    async (req) => {
      await connectionPool.disconnect(req.params.id);
      return { success: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/tokens/:id/status',
    { preHandler: app.authPreHandler },
    async (req) => {
      const entry = connectionPool.get(req.params.id);
      return {
        success: true,
        data: {
          connected: entry?.socket.isConnected() ?? false,
          status: entry?.status ?? 'disconnected',
          lastError: entry?.lastError ?? null,
          connectedAt: entry?.connectedAt ?? null,
        },
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { cmd: string; params?: Record<string, unknown>; timeoutMs?: number };
  }>(
    '/api/tokens/:id/command',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      try {
        const result = await connectionPool.send(
          req.params.id,
          req.body.cmd,
          req.body.params ?? {},
          req.body.timeoutMs ?? 8000,
        );
        return { success: true, data: result };
      } catch (err) {
        reply.code(400);
        return { success: false, message: (err as Error).message };
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/tokens/:id/serverlist',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      try {
        const tokenStr = tokenService.decryptToken(req.params.id);
        const buf = Buffer.from(tokenStr, 'base64');
        const roles = await getServerList(buf);
        return { success: true, data: roles };
      } catch (err) {
        log.warn({ err: (err as Error).message }, 'getServerList failed');
        reply.code(400);
        return { success: false, message: (err as Error).message };
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/tokens/:id/cache',
    { preHandler: app.authPreHandler },
    async (req) => {
      const data = listRoleCache(req.params.id);
      return { success: true, data };
    },
  );
}