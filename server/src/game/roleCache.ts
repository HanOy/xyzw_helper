import { db } from '../db/index.js';

export type RoleCacheSection = 'role' | 'legion' | 'tower' | 'study' | 'activity';

export function saveRoleCache(tokenId: string, section: string, data: unknown): void {
  const stmt = db.prepare(
    `INSERT INTO role_cache(token_id, section, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(token_id, section) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  );
  stmt.run(tokenId, section, JSON.stringify(data ?? {}), new Date().toISOString());
}

export function loadRoleCache(tokenId: string, section: RoleCacheSection): unknown | null {
  const row = db
    .prepare('SELECT data FROM role_cache WHERE token_id = ? AND section = ?')
    .get(tokenId, section) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

export function listRoleCache(tokenId: string): Record<string, unknown> {
  const rows = db
    .prepare('SELECT section, data, updated_at FROM role_cache WHERE token_id = ?')
    .all(tokenId) as { section: string; data: string; updated_at: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.section] = { data: JSON.parse(r.data), updatedAt: r.updated_at };
    } catch {
      out[r.section] = { data: null, updatedAt: r.updated_at };
    }
  }
  return out;
}