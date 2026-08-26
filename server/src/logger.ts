import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { CONFIG } from './config.js';

const level = process.env.LOG_LEVEL ?? 'info';

/** 日志保留天数(含当天) */
const RETENTION_DAYS = 3;

function dateStamp(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 按天滚动的文件输出, 写入 <dataDir>/logs/xyzw-YYYY-MM-DD.log,
 * 启动及每次滚动时清理超过保留期的旧日志
 */
function dailyFileDestination(dir: string): pino.DestinationStream {
  fs.mkdirSync(dir, { recursive: true });
  let currentDate = '';
  let stream: fs.WriteStream | null = null;

  const cleanup = (): void => {
    const cutoff = dateStamp(new Date(Date.now() - (RETENTION_DAYS - 1) * 86_400_000));
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^xyzw-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!m) continue;
      if (m[1] < cutoff) {
        try {
          fs.rmSync(path.join(dir, f), { force: true });
        } catch {
          // ignore
        }
      }
    }
  };

  return {
    write(data: string) {
      try {
        const stamp = dateStamp(new Date());
        if (stamp !== currentDate) {
          stream?.end();
          currentDate = stamp;
          stream = fs.createWriteStream(path.join(dir, `xyzw-${stamp}.log`), {
            flags: 'a',
          });
          cleanup();
        }
        stream?.write(data);
      } catch {
        // 文件写入失败不影响 stdout
      }
    },
  };
}

/** 本地时区 ISO 时间戳(含偏移), 与容器 TZ/日志文件名对齐 */
function localIsoTime(): string {
  const d = new Date();
  const pad = (n: number, l = 2): string => String(n).padStart(l, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `,"time":"${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    `${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}"`
  );
}

function buildLogger(): pino.Logger {
  const base = { app: 'xyzw-server' };
  const stdOpts: pino.LoggerOptions = {
    level,
    base,
    // 可读时间戳(本地时区 ISO8601) + 字符串级别, 替代默认的 epoch 毫秒/数字级别
    timestamp: localIsoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  if (CONFIG.isDev) {
    return pino({
      ...stdOpts,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
      },
    });
  }
  return pino(
    stdOpts,
    pino.multistream([
      { level, stream: process.stdout as unknown as pino.DestinationStream },
      { level, stream: dailyFileDestination(path.join(CONFIG.dataDir, 'logs')) },
    ]),
  );
}

export const logger = buildLogger();

export type Logger = typeof logger;
