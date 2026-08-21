import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { CONFIG } from './config.js';
import { logger } from './logger.js';
import {
  loadPersistedCredentials,
  persistCredentials,
  setAuthCredentials,
  setVault,
} from './crypto/vault.js';
import { db } from './db/index.js';
import { attachAuthGuards } from './auth/middleware.js';
import { setupAuthRoutes } from './api/auth.routes.js';
import { registerTokenRoutes } from './api/token.routes.js';
import { registerGameRoutes } from './api/game.routes.js';
import { registerEventsRoute } from './api/events.routes.js';
import { registerLogsRoutes } from './api/logs.routes.js';
import { registerTaskRoutes } from './api/task.routes.js';
import { registerBatchRoutes } from './api/batch.routes.js';
import { registerWeixinRoutes } from './api/weixin.routes.js';
import { registerHortorRoutes } from './api/hortor.routes.js';
import { registerScheduledRoutes } from './api/scheduled.routes.js';
import { seedTasksIfNeeded } from './tasks/taskRunner.js';
import { startScheduler, stopScheduler } from './tasks/scheduler.js';
import { connectionPool } from './game/poolSingleton.js';

async function promptPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      [
        '',
        '检测不到交互式终端 (TTY).',
        '首次启动需要输入启动密码, 二选一:',
        '  1. 单独运行 `pnpm server` (会保留 TTY)',
        '  2. 设置环境变量 `XYZW_BOOT_PASSWORD=你的密码` 后再启动',
        '',
      ].join('\n'),
    );
  }
  process.stdout.write('\n请输入启动密码 (首次设置, 输入不可见): ');
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const muted = (raw: string): string => '*'.repeat(raw.length);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
      ((s: string) => {
        if (s.includes('\n') || s.includes('\r')) {
          process.stdout.write(s);
        } else {
          process.stdout.write(muted(s));
        }
      }) as unknown as (s: string) => void;
    rl.on('line', (line) => {
      process.stdout.write('\n');
      rl.close();
      resolve(line);
    });
    // Safety: 15 秒没输入就超时退出, 避免 docker 容器卡死
    const timer = setTimeout(() => {
      rl.close();
      process.stdout.write('\n');
      resolve('');
    }, 15_000);
    rl.on('close', () => clearTimeout(timer));
    rl.question('', () => undefined);
  });
}

async function ensureVault(): Promise<void> {
  const loaded = loadPersistedCredentials();
  if (loaded) {
    setVault(loaded.vault);
    setAuthCredentials(loaded.salt, loaded.hash);
    return;
  }
  let pwd = process.env.XYZW_BOOT_PASSWORD?.trim();
  if (!pwd) {
    pwd = await promptPassword();
  }
  if (!pwd) throw new Error('启动密码不能为空');
  const persisted = persistCredentials({ password: pwd });
  setVault(persisted.vault);
  setAuthCredentials(persisted.salt, persisted.hash);
  logger.info('已生成新的主密钥并加密持久化');
}

async function bootstrap() {
  process.stdout.write(
    `[xyzw] pid=${process.pid} node=${process.version} env.NODE_ENV=${process.env.NODE_ENV ?? ''} ` +
      `HOST=${process.env.HOST ?? ''} PORT=${process.env.PORT ?? ''} ` +
      `XYZW_BOOT_PASSWORD=${process.env.XYZW_BOOT_PASSWORD ? '***set***' : '(empty)'} ` +
      `XYZW_DATA_DIR=${process.env.XYZW_DATA_DIR ?? ''} XYZW_STATIC_DIR=${process.env.XYZW_STATIC_DIR ?? ''}\n`,
  );
  logger.info(
    {
      pid: process.pid,
      node: process.version,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        HOST: process.env.HOST,
        PORT: process.env.PORT,
        XYZW_BOOT_PASSWORD: process.env.XYZW_BOOT_PASSWORD ? '***set***' : '(empty)',
        XYZW_DATA_DIR: process.env.XYZW_DATA_DIR,
        XYZW_STATIC_DIR: process.env.XYZW_STATIC_DIR,
      },
    },
    'xyzw server starting',
  );
  await ensureVault();

  const app = Fastify({ logger: false, trustProxy: true });

  app.addHook('onResponse', async (req, reply) => {
    logger.debug({ method: req.method, url: req.url, status: reply.statusCode }, 'http');
  });

  await app.register(cors, { origin: true, credentials: true });

  await app.register(jwt, {
    secret: crypto.randomBytes(32).toString('hex'),
    sign: { expiresIn: CONFIG.jwtExpiresIn },
  });

  attachAuthGuards(app);

  setupAuthRoutes(app);
  registerTokenRoutes(app);
  registerGameRoutes(app);
  registerEventsRoute(app);
  registerLogsRoutes(app);
  registerTaskRoutes(app);
  registerBatchRoutes(app);
  registerWeixinRoutes(app);
  registerHortorRoutes(app);
  registerScheduledRoutes(app);

  app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

  if (CONFIG.staticDir && fs.existsSync(CONFIG.staticDir)) {
    await app.register(fastifyStatic, {
      root: CONFIG.staticDir,
      prefix: '/',
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) {
        reply.code(404).send({ success: false, message: 'Not Found' });
        return;
      }
      const indexPath = path.join(CONFIG.staticDir!, 'index.html');
      if (fs.existsSync(indexPath)) {
        reply.type('text/html').send(fs.readFileSync(indexPath));
      } else {
        reply.code(404).send({ success: false, message: 'Not Found' });
      }
    });
  }

  seedTasksIfNeeded();

  await app.listen({ port: CONFIG.port, host: CONFIG.host });
  logger.info({ port: CONFIG.port, host: CONFIG.host }, 'server listening');

  startScheduler();

  const shutdown = async () => {
    logger.info('shutting down');
    stopScheduler();
    await connectionPool.shutdown();
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[xyzw] fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.stderr.write(`\n[xyzw] fatal: ${err.message}\n`);
  process.exit(1);
});