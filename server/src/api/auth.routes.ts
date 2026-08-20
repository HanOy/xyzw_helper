import type { FastifyInstance } from 'fastify';
import { signSession } from '../auth/session.js';
import { getAuthCredentials, verifyPassword } from '../crypto/vault.js';

const ADMIN_USERNAME = 'admin';

export function setupAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/login', async (req, reply) => {
    const body = req.body as { password?: string } | undefined;
    if (!body?.password) {
      return reply.code(400).send({ success: false, message: '缺少密码' });
    }
    const creds = getAuthCredentials();
    if (!creds) {
      return reply.code(500).send({ success: false, message: '服务端未初始化' });
    }
    if (!verifyPassword(body.password, creds.salt, creds.hash)) {
      return reply.code(401).send({ success: false, message: '密码错误' });
    }
    const token = await signSession(app, { sub: ADMIN_USERNAME });
    return { success: true, data: { token, username: ADMIN_USERNAME } };
  });

  app.get('/api/auth/me', { preHandler: app.authPreHandler }, async () => ({
    success: true,
    data: { username: ADMIN_USERNAME },
  }));
}