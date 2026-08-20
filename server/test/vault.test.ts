import { describe, it, expect } from 'vitest';
import {
  createVaultFromPassword,
  verifyPassword,
  persistCredentials,
  loadPersistedCredentials,
  setVault,
  setAuthCredentials,
  getVault,
  getAuthCredentials,
} from '../src/crypto/vault.js';

describe('vault', () => {
  it('encrypts and decrypts a token', () => {
    const { vault } = createVaultFromPassword('p@ssw0rd');
    const enc = vault.encrypt('eyJ0b2tlbiI6ImFiY2QxMjM0In0=');
    const decrypted = vault.decrypt(enc.encrypted, enc.iv, enc.authTag);
    expect(decrypted).toBe('eyJ0b2tlbiI6ImFiY2QxMjM0In0=');
  });

  it('produces different IVs each encryption', () => {
    const { vault } = createVaultFromPassword('p@ssw0rd');
    const a = vault.encrypt('same');
    const b = vault.encrypt('same');
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
  });

  it('verifies correct password and rejects wrong', () => {
    const { authSalt, authHash } = createVaultFromPassword('correct');
    expect(verifyPassword('correct', authSalt, authHash)).toBe(true);
    expect(verifyPassword('wrong', authSalt, authHash)).toBe(false);
  });

  it('decrypt fails when authTag tampered', () => {
    const { vault } = createVaultFromPassword('p@ssw0rd');
    const enc = vault.encrypt('secret');
    const tamperedTag = Buffer.from(enc.authTag, 'base64');
    tamperedTag[0] ^= 0xff;
    expect(() =>
      vault.decrypt(enc.encrypted, enc.iv, tamperedTag.toString('base64')),
    ).toThrow();
  });

  it('persists and reloads credentials via session key', () => {
    const persisted = persistCredentials({ password: 'reload-me' });
    setVault(persisted.vault);
    setAuthCredentials(persisted.salt, persisted.hash);
    const reloaded = loadPersistedCredentials();
    expect(reloaded).not.toBeNull();
    expect(reloaded!.salt).toBe(persisted.salt);
    expect(reloaded!.hash).toBe(persisted.hash);
    const enc = persisted.vault.encrypt('hello');
    const decrypted = reloaded!.vault.decrypt(enc.encrypted, enc.iv, enc.authTag);
    expect(decrypted).toBe('hello');
  });

  it('setVault / getVault and getAuthCredentials work as a global', () => {
    const { vault, authSalt, authHash } = createVaultFromPassword('glob');
    setVault(vault);
    setAuthCredentials(authSalt, authHash);
    expect(getVault().masterKey.equals(vault.masterKey)).toBe(true);
    expect(getAuthCredentials()).toEqual({ salt: authSalt, hash: authHash });
  });
});