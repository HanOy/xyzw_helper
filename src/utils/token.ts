import crypto from 'crypto-js';
import { api } from '../api';

export function getTokenId(token: string | ArrayBuffer | Uint8Array): string {
  const buf =
    typeof token === 'string'
      ? token
      : Buffer.isBuffer(token)
        ? token.toString('base64')
        : Buffer.from(token).toString('base64');
  return crypto.MD5(crypto.lib.WordArray.create(buf)).toString(crypto.enc.Hex);
}

export async function transformToken(_buf: ArrayBuffer | Uint8Array): Promise<never> {
  throw new Error(
    'transformToken 已迁移, 请把 bin 传给 /api/tokens (method=wxQrcode) 让服务端转换',
  );
}

export async function getServerList(bin: ArrayBuffer | Uint8Array): Promise<unknown> {
  const buf =
    Buffer.isBuffer(bin)
      ? bin.toString('base64')
      : ArrayBuffer.isView(bin)
        ? Buffer.from(bin).toString('base64')
        : Buffer.from(bin).toString('base64');
  const result = await api.tokens.serverList('placeholder');
  void buf;
  return result;
}

export const scheduleAuthUserRequest = async <T>(fn: () => Promise<T>): Promise<T> => fn();
export const setAuthUserRateLimiterCallback = (): void => {};