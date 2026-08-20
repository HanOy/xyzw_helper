import crypto from 'node:crypto';

export function getTokenId(token: string | Buffer | Uint8Array): string {
  const buf =
    typeof token === 'string'
      ? Buffer.from(token, 'utf8')
      : Buffer.isBuffer(token)
        ? token
        : Buffer.from(token);
  return crypto.createHash('md5').update(buf).digest('hex');
}