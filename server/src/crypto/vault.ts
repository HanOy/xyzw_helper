import crypto from 'node:crypto';
import fs from 'node:fs';
import { CONFIG } from '../config.js';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export interface Vault {
  masterKey: Buffer;
  encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string };
  decrypt(encrypted: string, iv: string, authTag: string): string;
}

let activeVault: Vault | null = null;
let activeAuthSalt: string | null = null;
let activeAuthHash: string | null = null;

export function setVault(v: Vault): void {
  activeVault = v;
}

export function getVault(): Vault {
  if (!activeVault) throw new Error('Vault not initialized');
  return activeVault;
}

export function setAuthCredentials(salt: string, hash: string): void {
  activeAuthSalt = salt;
  activeAuthHash = hash;
}

export function getAuthCredentials(): { salt: string; hash: string } | null {
  if (!activeAuthSalt || !activeAuthHash) return null;
  return { salt: activeAuthSalt, hash: activeAuthHash };
}

export function createVaultFromPassword(password: string): {
  vault: Vault;
  authSalt: string;
  authHash: string;
  vaultSalt: string;
} {
  const vaultSalt = crypto.randomBytes(SALT_BYTES);
  const masterKey = crypto.pbkdf2Sync(password, vaultSalt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256');

  const encrypt = (plaintext: string) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: enc.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  };

  const decrypt = (encrypted: string, iv: string, authTag: string) => {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      masterKey,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  };

  const vault: Vault = { masterKey, encrypt, decrypt };

  const authSalt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const authHash = crypto.pbkdf2Sync(password, authSalt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');

  return { vault, authSalt, authHash, vaultSalt: vaultSalt.toString('hex') };
}

export function verifyPassword(submitted: string, salt: string, expectedHash: string): boolean {
  const candidate = crypto.pbkdf2Sync(submitted, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expectedHash, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function persistCredentials(opts: {
  password: string;
}): { vault: Vault; salt: string; hash: string } {
  const { vault, authSalt, authHash } = createVaultFromPassword(opts.password);
  const sessionPass = deriveSessionPassphrase();
  const sessionSalt = crypto.randomBytes(SALT_BYTES);
  const wrapKey = crypto.pbkdf2Sync(sessionPass, sessionSalt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', wrapKey, iv);
  const wrapped = Buffer.concat([cipher.update(vault.masterKey), cipher.final()]);
  const authTag = cipher.getAuthTag();
  fs.writeFileSync(
    CONFIG.sessionKeyPath,
    JSON.stringify({
      encryptedKey: wrapped.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: sessionSalt.toString('base64'),
      authSalt,
      authHash,
    }),
    { mode: 0o600 },
  );
  return { vault, salt: authSalt, hash: authHash };
}

export function loadPersistedCredentials(): {
  vault: Vault;
  salt: string;
  hash: string;
} | null {
  if (!fs.existsSync(CONFIG.sessionKeyPath)) return null;
  try {
    const raw = fs.readFileSync(CONFIG.sessionKeyPath, 'utf8');
    const payload = JSON.parse(raw) as {
      encryptedKey: string;
      iv: string;
      authTag: string;
      salt: string;
      authSalt: string;
      authHash: string;
    };
    const sessionPass = deriveSessionPassphrase();
    const sessionSalt = Buffer.from(payload.salt, 'base64');
    const wrapKey = crypto.pbkdf2Sync(sessionPass, sessionSalt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', wrapKey, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const masterKey = Buffer.concat([
      decipher.update(Buffer.from(payload.encryptedKey, 'base64')),
      decipher.final(),
    ]);
    const vault: Vault = {
      masterKey,
      encrypt: (plaintext: string) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
        const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        return {
          encrypted: enc.toString('base64'),
          iv: iv.toString('base64'),
          authTag: cipher.getAuthTag().toString('base64'),
        };
      },
      decrypt: (encrypted: string, iv: string, authTag: string) => {
        const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));
        const out = Buffer.concat([
          decipher.update(Buffer.from(encrypted, 'base64')),
          decipher.final(),
        ]);
        return out.toString('utf8');
      },
    };
    return { vault, salt: payload.authSalt, hash: payload.authHash };
  } catch {
    return null;
  }
}

const SESSION_PASSPHRASE_ENV = 'XYZW_SESSION_PASSPHRASE';
function deriveSessionPassphrase(): string {
  return process.env[SESSION_PASSPHRASE_ENV] ?? 'xyzw-default-session-passphrase';
}

export function clearSessionKey(): void {
  if (fs.existsSync(CONFIG.sessionKeyPath)) fs.unlinkSync(CONFIG.sessionKeyPath);
}