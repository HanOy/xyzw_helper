import { describe, it, expect } from 'vitest';
import { getTokenId } from '../src/token/transformToken.js';

describe('transformToken.getTokenId', () => {
  it('produces stable MD5 hex for same input', () => {
    const id1 = getTokenId('eyJ0b2tlbiI6ImFiY2QxMjM0In0=');
    const id2 = getTokenId('eyJ0b2tlbiI6ImFiY2QxMjM0In0=');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces different ids for different inputs', () => {
    const a = getTokenId('token-a');
    const b = getTokenId('token-b');
    expect(a).not.toBe(b);
  });

  it('handles Buffer input', () => {
    const buf = Buffer.from('eyJ0b2tlbiI6ImFiY2QxMjM0In0=', 'utf8');
    const a = getTokenId('eyJ0b2tlbiI6ImFiY2QxMjM0In0=');
    const b = getTokenId(buf);
    expect(a).toBe(b);
  });
});