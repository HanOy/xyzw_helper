import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';

declare module 'fastify' {
  interface FastifyInstance {
    authPreHandler: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authOptionalPreHandler: (req: FastifyRequest) => Promise<void>;
  }
}

export function attachAuthGuards(app: FastifyInstance): void {
  app.decorate('authPreHandler', async function (req: FastifyRequest, reply: FastifyReply) {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ success: false, message: '未授权' });
    }
  });

  app.decorate('authOptionalPreHandler', async function (req: FastifyRequest) {
    try {
      await req.jwtVerify();
    } catch {
      // anonymous ok
    }
  });
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}