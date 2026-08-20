import pino from 'pino';
import { CONFIG } from './config.js';

const transport = CONFIG.isDev
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
  : undefined;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { app: 'xyzw-server' },
  transport,
});

export type Logger = typeof logger;