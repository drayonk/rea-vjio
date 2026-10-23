import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  forward_to TEXT,
  forwarding_enabled INTEGER NOT NULL DEFAULT 0,
  do_not_disturb INTEGER NOT NULL DEFAULT 0,
  push_token TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS numbers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_sid TEXT NOT NULL UNIQUE,
  e164 TEXT NOT NULL,
  country TEXT NOT NULL,
  locality TEXT,
  label TEXT,
  sms INTEGER NOT NULL,
  voice INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  released_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS numbers_active_e164
  ON numbers(e164) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  number_id TEXT NOT NULL REFERENCES numbers(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  counterpart TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_sid TEXT UNIQUE,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread
  ON messages(number_id, counterpart, created_at);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  number_id TEXT NOT NULL REFERENCES numbers(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  counterpart TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_seconds INTEGER,
  voicemail_url TEXT,
  voicemail_seconds INTEGER,
  provider_sid TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS calls_by_number ON calls(number_id, created_at);
`;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export const now = () => new Date().toISOString();
