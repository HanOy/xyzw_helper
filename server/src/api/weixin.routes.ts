import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { loginWithWechatCode, getLoginRoles } from '../game/wxLogin.js';

const WX_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN',
  Referer: 'https://open.weixin.qq.com/',
} as const;

export function registerWeixinRoutes(app: FastifyInstance): void {
  // 微信扫码登录: 用 code 换取 combUser + 生成 bin + 拉取角色列表
  app.post<{ Body: { code?: string } }>(
    '/api/weixin/login',
    { preHandler: app.authPreHandler },
    async (req, reply) => {
      const code = req.body?.code;
      if (!code) {
        reply.code(400);
        return { success: false, message: '缺少 code' };
      }
      try {
        const combUser = await loginWithWechatCode(code);
        const { bin, roles } = await getLoginRoles(combUser);
        return { success: true, data: { bin: bin.toString('base64'), roles } };
      } catch (err) {
        reply.code(502);
        return { success: false, message: (err as Error).message };
      }
    },
  );

  app.get('/api/weixin/connect/app/qrconnect', async (req, reply) => {
    const qs = new URL(req.url, 'http://x').search;
    const url = `https://open.weixin.qq.com/connect/app/qrconnect${qs}`;
    try {
      const resp = await axios.get(url, {
        headers: { ...WX_HEADERS, Accept: 'text/html' },
        timeout: 15_000,
        responseType: 'text',
      });
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return resp.data;
    } catch (err) {
      reply.code(502);
      return { success: false, message: `weixin qrconnect failed: ${(err as Error).message}` };
    }
  });

  app.get('/api/weixin/connect/l/qrconnect', async (req, reply) => {
    const qs = new URL(req.url, 'http://x').search;
    const url = `https://long.open.weixin.qq.com/connect/l/qrconnect${qs}`;
    try {
      const resp = await axios.get(url, {
        headers: { ...WX_HEADERS, Accept: '*/*' },
        timeout: 8_000,
        responseType: 'text',
      });
      reply.header('Content-Type', 'text/plain; charset=utf-8');
      return resp.data;
    } catch (err) {
      reply.code(502);
      return `error=${encodeURIComponent((err as Error).message)}`;
    }
  });

  app.get('/api/weixin/connect/qrcode/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const url = `https://open.weixin.qq.com/connect/qrcode/${filename}`;
    try {
      const resp = await axios.get(url, {
        headers: WX_HEADERS,
        timeout: 10_000,
        responseType: 'arraybuffer',
      });
      const ct = (resp.headers['content-type'] as string) ?? 'image/png';
      reply.header('Content-Type', ct);
      return reply.send(Buffer.from(resp.data as ArrayBuffer));
    } catch (err) {
      reply.code(502);
      return { success: false, message: `weixin qrcode image failed: ${(err as Error).message}` };
    }
  });
}