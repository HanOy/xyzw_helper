import type { FastifyInstance } from 'fastify';
import axios from 'axios';

const HORTOR_HEADERS_BASE = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 12; 23117RK66C Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36',
  Accept: '*/*',
  Host: 'comb-platform.hortorgames.com',
  Connection: 'keep-alive',
  'Content-Type': 'text/plain; charset=utf-8',
  Origin: 'https://open.weixin.qq.com',
  Referer: 'https://open.weixin.qq.com/',
} as const;

export function registerHortorRoutes(app: FastifyInstance): void {
  // 通用代理: /api/hortor/<rest> -> https://comb-platform.hortorgames.com/<rest>
  app.all('/api/hortor/*', async (req, reply) => {
    const restPath = (req.params as { '*': string })['*'];
    const search = new URL(req.url, 'http://x').search;
    const url = `https://comb-platform.hortorgames.com/${restPath}${search}`;
    try {
      const resp = await axios.request({
        method: req.method as string,
        url,
        headers: {
          ...HORTOR_HEADERS_BASE,
          'Content-Type': (req.headers['content-type'] as string) ?? HORTOR_HEADERS_BASE['Content-Type'],
        },
        data: req.body as unknown,
        timeout: 15_000,
        responseType: 'text',
        validateStatus: () => true,
      });
      const ct = (resp.headers['content-type'] as string) ?? 'text/plain; charset=UTF-8';
      reply.header('Content-Type', ct);
      return reply.code(resp.status).send(resp.data);
    } catch (err) {
      reply.code(502);
      return { success: false, message: `hortor proxy failed: ${(err as Error).message}` };
    }
  });
}