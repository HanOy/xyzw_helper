// @ts-nocheck
import axios from 'axios';
import { g_utils } from '../game/bonProtocol.js';

export interface AuthUserResult {
  encryptCombUser: string;
  sessId: number;
  connId: number;
  isRestore: number;
  [key: string]: unknown;
}

let queueCount = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;
const MAX_REQ = 25;

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  queueCount++;
  try {
    while (true) {
      const now = Date.now();
      if (now - windowStart > WINDOW_MS) {
        windowStart = now;
        queueCount = 1;
        break;
      }
      if (queueCount <= MAX_REQ) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return await fn();
  } finally {
    queueCount--;
  }
}

export async function transformToken(arrayBuffer: ArrayBuffer | Uint8Array | Buffer): Promise<AuthUserResult> {
  return withRateLimit(async () => {
    const res = await axios.post(
      'https://xxz-xyzw.hortorgames.com/login/authuser',
      arrayBuffer,
      {
        params: { _seq: 1 },
        headers: {
          'Content-Type': 'application/octet-stream',
          referrerPolicy: 'no-referrer',
        },
        responseType: 'arraybuffer',
        timeout: 15_000,
      },
    );
    const msg = g_utils.parse(Buffer.from(res.data as ArrayBuffer));
    const data = msg.getData() as Record<string, unknown>;
    const currentTime = Date.now();
    const sessId = currentTime * 100 + Math.floor(Math.random() * 100);
    const connId = currentTime + Math.floor(Math.random() * 10);
    return {
      ...data,
      sessId,
      connId,
      isRestore: 0,
    } as AuthUserResult;
  });
}

export async function getServerList(arrayBuffer: ArrayBuffer | Uint8Array | Buffer): Promise<unknown[]> {
  const res = await axios.post(
    'https://xxz-xyzw.hortorgames.com/login/serverlist',
    arrayBuffer,
    {
      params: { _seq: 3 },
      headers: {
        'Content-Type': 'application/octet-stream',
        referrerPolicy: 'no-referrer',
      },
      responseType: 'arraybuffer',
      timeout: 15_000,
    },
  );
  const msg = g_utils.parse(Buffer.from(res.data as ArrayBuffer));
  const data = msg.getData() as { roles?: unknown[] };
  return data.roles ?? [];
}