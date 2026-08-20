import type { FastifyInstance } from 'fastify';

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export function buildJwtPlugin(secret: string) {
  return async (app: FastifyInstance) => {
    const fastifyJwt = (await import('@fastify/jwt')).default;
    await app.register(fastifyJwt, {
      secret,
      sign: { expiresIn: '7d' },
    });
  };
}

export async function signSession(app: FastifyInstance, payload: JwtPayload): Promise<string> {
  return app.jwt.sign(payload);
}

export async function verifySession(app: FastifyInstance, token: string): Promise<JwtPayload> {
  return app.jwt.verify(token) as JwtPayload;
}