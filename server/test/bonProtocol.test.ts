import { describe, it, expect } from 'vitest';
import { bon, getEnc, encode, parse } from '../src/game/bonProtocol.js';

describe('BON protocol', () => {
  it('round-trips an object through encode/decode', () => {
    const obj = { foo: 1, bar: 'hello', nested: { a: [1, 2, 3] } };
    const bytes = bon.encode(obj);
    const decoded = bon.decode(bytes);
    expect(decoded.foo).toBe(1);
    expect(decoded.bar).toBe('hello');
    expect(decoded.nested.a).toEqual([1, 2, 3]);
  });

  it('encodes a string reference for repeated strings', () => {
    const obj = { a: 'repeat', b: 'repeat' };
    const bytes = bon.encode(obj);
    const decoded = bon.decode(bytes);
    expect(decoded.a).toBe('repeat');
    expect(decoded.b).toBe('repeat');
  });

  it('handles binary data', () => {
    const obj = { bin: new Uint8Array([1, 2, 3, 4, 5]) };
    const bytes = bon.encode(obj);
    const decoded = bon.decode(bytes);
    expect(decoded.bin).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.bin)).toEqual([1, 2, 3, 4, 5]);
  });

  it('encodes body bytes via x encryption and recovers them', () => {
    const body = { clientVersion: '2.21.2', scene: '' };
    const enc = getEnc('x');
    const packetBytes = encode(body, enc);
    expect(packetBytes).toBeInstanceOf(ArrayBuffer);
    const u8 = new Uint8Array(packetBytes);
    expect(u8[0]).toBe(112);
    expect(u8[1]).toBe(120);
    const decrypted = enc.decrypt(u8);
    const decoded = bon.decode(decrypted);
    expect(decoded.clientVersion).toBe('2.21.2');
    expect(decoded.scene).toBe('');
  });

  it('wraps a body via bon.encode and exposes rawData', () => {
    const inner = { clientVersion: '2.21.2' };
    const body = bon.encode(inner);
    const packet = {
      cmd: 'role_getroleinfo',
      seq: 1,
      ack: 0,
      time: 1700000000,
      body,
    };
    const parsed = parse(bon.encode(packet), getEnc('auto'));
    expect(parsed.cmd).toBe('role_getroleinfo');
    expect(parsed.seq).toBe(1);
    expect(parsed.time).toBe(1700000000);
    const innerData = parsed.rawData;
    expect(innerData.clientVersion).toBe('2.21.2');
  });
});