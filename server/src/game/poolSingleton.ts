import { ConnectionPool } from './ConnectionPool.js';
import { CONFIG } from '../config.js';

export const connectionPool = new ConnectionPool({
  maxConcurrent: CONFIG.maxConcurrentConnections,
  intervalMs: CONFIG.connectionIntervalMs,
  zombieIdleMs: CONFIG.wsZombieIdleMs,
  defaultGameWsUrl: CONFIG.defaultGameWsUrl,
});
