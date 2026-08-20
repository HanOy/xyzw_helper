import { getTokenId } from './transformToken.js';

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export function isLikelyBase64(input: string): boolean {
  if (input.length < 4) return false;
  if (input.length % 4 !== 0) return false;
  return BASE64_REGEX.test(input);
}

export function stripPrefix(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('token:')) return trimmed.slice(6).trim();
  if (trimmed.startsWith('Token:')) return trimmed.slice(6).trim();
  return trimmed;
}

export function generateId(rawToken: string): string {
  return getTokenId(rawToken);
}

export function generateRandomId(): string {
  return crypto.randomUUID();
}