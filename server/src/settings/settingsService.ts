import { db } from '../db/index.js';

export interface SettingRow {
  key: string;
  value: string;
}

export function getSetting(key: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function listSettings(prefix?: string): SettingRow[] {
  if (prefix) {
    const rows = db
      .prepare("SELECT key, value FROM settings WHERE key LIKE ? ESCAPE '\\'")
      .all(`${prefix}%`) as SettingRow[];
    return rows;
  }
  const rows = db.prepare('SELECT key, value FROM settings').all() as SettingRow[];
  return rows;
}
