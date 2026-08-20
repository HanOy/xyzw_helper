import Database from 'better-sqlite3';
import { CONFIG } from '../config.js';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  server        TEXT,
  remark        TEXT,
  avatar        TEXT,
  import_method TEXT,
  source_url    TEXT,
  encrypted     TEXT NOT NULL,
  iv            TEXT NOT NULL,
  auth_tag      TEXT NOT NULL,
  ws_url        TEXT,
  upgraded      INTEGER DEFAULT 0,
  upgraded_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_updated_at ON tokens(updated_at DESC);

CREATE TABLE IF NOT EXISTS role_cache (
  token_id TEXT NOT NULL,
  section  TEXT NOT NULL,
  data     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (token_id, section)
);

CREATE TABLE IF NOT EXISTS ws_connections (
  token_id     TEXT PRIMARY KEY,
  status       TEXT NOT NULL,
  session_id   TEXT,
  last_error   TEXT,
  last_message_at TEXT,
  created_at   TEXT NOT NULL,
  random_seed_synced INTEGER DEFAULT 0,
  random_seed  INTEGER
);

CREATE TABLE IF NOT EXISTS task_runs (
  id           TEXT PRIMARY KEY,
  token_id     TEXT,
  batch_id     TEXT,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  current      INTEGER DEFAULT 0,
  total        INTEGER DEFAULT 0,
  stage        TEXT,
  settings     TEXT,
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT,
  cancelled_at TEXT,
  error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_runs_token ON task_runs(token_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_runs_batch ON task_runs(batch_id);

CREATE TABLE IF NOT EXISTS task_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  token_id   TEXT,
  level      TEXT NOT NULL,
  message    TEXT NOT NULL,
  ts         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_logs_run ON task_logs(run_id, id);

CREATE TABLE IF NOT EXISTS session_keys (
  id         TEXT PRIMARY KEY,
  key_data   TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
`;

export const db = new Database(CONFIG.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA_SQL);

export function closeDb(): void {
  db.close();
}

export type DbInstance = typeof db;