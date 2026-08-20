import type { FastifyInstance } from 'fastify';
import { sseHub } from '../events/sseHub.js';

export function registerEventsRoute(app: FastifyInstance): void {
  app.get('/api/events/stream', async (req, reply) => {
    const q = (req.query ?? {}) as { tokenIds?: string };
    const ids = q.tokenIds
      ? q.tokenIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
    const id = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');

    const stream = sseHub.attach(id, ids);
    reply.raw.writeHead(200);
    const reader = stream.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(Buffer.from(value));
        }
      } catch {
        // client gone
      } finally {
        sseHub.detach(id);
      }
    };
    pump();
    req.raw.on('close', () => {
      sseHub.detach(id);
    });
  });
}