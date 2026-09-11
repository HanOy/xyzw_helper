import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

function loadDotEnv(): void {
  const envPath = path.join(SERVER_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  saltPath: string;
  sessionKeyPath: string;
  defaultGameWsUrl: string;
  maxConcurrentConnections: number;
  connectionIntervalMs: number;
  jwtExpiresIn: string;
  isDev: boolean;
  staticDir: string | null;
}

export function loadConfig(): AppConfig {
  const dataDir = process.env.XYZW_DATA_DIR
    ? path.resolve(process.env.XYZW_DATA_DIR)
    : path.join(SERVER_ROOT, 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const staticDir = process.env.XYZW_STATIC_DIR
    ? path.resolve(process.env.XYZW_STATIC_DIR)
    : null;

  return {
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST ?? '127.0.0.1',
    dataDir,
    dbPath: path.join(dataDir, 'app.db'),
    saltPath: path.join(dataDir, '.salt'),
    sessionKeyPath: path.join(dataDir, '.session-key'),
    defaultGameWsUrl:
      process.env.XYZW_WS_URL ?? 'wss://xxz-xyzw.hortorgames.com/agent',
    maxConcurrentConnections: Number(process.env.XYZW_MAX_CONN ?? 10),
    connectionIntervalMs: Number(process.env.XYZW_CONN_INTERVAL_MS ?? 500),
    jwtExpiresIn: process.env.XYZW_JWT_TTL ?? '7d',
    isDev: process.env.NODE_ENV !== 'production',
    staticDir,
  };
}

export const CONFIG = loadConfig();