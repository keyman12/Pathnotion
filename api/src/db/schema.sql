-- PathNotion schema (SQLite)
-- Applied on startup by db/client.ts. Additive-only; migrations go at the bottom as guarded ALTERs.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Users / founders
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT UNIQUE NOT NULL,              -- 'D' | 'R' | short founder code
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',    -- 'admin' | 'member'
  color         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Products (aka categories / projects)
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL,
  accent      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Sub-folders per product (e.g. Dashboard/dave)
CREATE TABLE IF NOT EXISTS subfolders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subfolders_product ON subfolders(product_id);

-- Backlog items (work tickets)
CREATE TABLE IF NOT EXISTS backlog_items (
  id            TEXT PRIMARY KEY,                  -- e.g. PTH-204
  title         TEXT NOT NULL,
  note          TEXT,
  product_id    TEXT REFERENCES products(id) ON DELETE SET NULL,
  subfolder_id  INTEGER REFERENCES subfolders(id) ON DELETE SET NULL,
  stage         TEXT NOT NULL DEFAULT 'now',       -- 'now' | 'next' | 'later'
  owner_key     TEXT NOT NULL,                     -- FK to users.key (not enforced; allows seed D/R)
  due_date      TEXT,
  progress      INTEGER NOT NULL DEFAULT 0,
  flag          TEXT,                              -- 'overdue' | 'due-soon'
  age           TEXT,                              -- display-only: '3d', '1w'
  sort_order    INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_backlog_product ON backlog_items(product_id);
CREATE INDEX IF NOT EXISTS idx_backlog_stage ON backlog_items(stage);

-- Tasks (shared to-do)
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  owner_key   TEXT NOT NULL,
  due         TEXT,
  done        INTEGER NOT NULL DEFAULT 0,
  link_type   TEXT,                                -- 'doc' | 'backlog'
  link_ref    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Calendar events
CREATE TABLE IF NOT EXISTS calendar_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  day_of_week  INTEGER NOT NULL,                   -- 0=Mon..4=Fri
  start_hour   REAL NOT NULL,
  end_hour     REAL NOT NULL,
  who          TEXT NOT NULL,                      -- 'D' | 'R' | 'SHARED'
  kind         TEXT,                               -- 'shared' | 'meet' | 'deep' | 'personal'
  flag         TEXT,                               -- 'clash'
  source       TEXT,                               -- 'local' | 'caldav'
  external_id  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Calendar sources (CalDAV)
CREATE TABLE IF NOT EXISTS calendar_sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key      TEXT NOT NULL,
  email         TEXT,
  mode          TEXT NOT NULL DEFAULT 'caldav',    -- 'caldav' | 'ics'
  endpoint      TEXT,
  last_sync_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Docs + blocks + comments
CREATE TABLE IF NOT EXISTS docs (
  id          TEXT PRIMARY KEY,
  slug        TEXT,
  title       TEXT NOT NULL,
  root        TEXT NOT NULL,                       -- 'product' | 'finance' | 'sales' | 'legal'
  product_id  TEXT,
  group_name  TEXT,
  size_label  TEXT,
  tags        TEXT,                                -- JSON array
  created_by  TEXT,
  updated_by  TEXT,
  updated     TEXT,                                -- display label ('today', '2d ago')
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS doc_blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id      TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL,
  type        TEXT NOT NULL,
  data        TEXT NOT NULL                        -- JSON payload per block type
);

CREATE TABLE IF NOT EXISTS doc_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id    INTEGER NOT NULL REFERENCES doc_blocks(id) ON DELETE CASCADE,
  author_key  TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id       TEXT REFERENCES docs(id) ON DELETE SET NULL,
  filename     TEXT NOT NULL,
  ext          TEXT,
  bytes        INTEGER,
  s3_key       TEXT,
  uploaded_by  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent (Jeff)
CREATE TABLE IF NOT EXISTS agent_jobs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  schedule      TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  description   TEXT,
  last_run_at   TEXT
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id        TEXT PRIMARY KEY,
  job_id    TEXT REFERENCES agent_jobs(id) ON DELETE SET NULL,
  status    TEXT,
  summary   TEXT,
  changes   INTEGER,
  diff      TEXT,                                  -- JSON
  ran_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role        TEXT NOT NULL,                       -- 'user' | 'agent'
  text        TEXT NOT NULL,
  actions     TEXT,                                -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS access_grants (
  module        TEXT PRIMARY KEY,                  -- 'calendar' | 'docs' | 'backlog' | 'tasks'
  can_read      INTEGER NOT NULL DEFAULT 1,
  can_write     INTEGER NOT NULL DEFAULT 0,
  last_touched  TEXT
);

-- Session store (connect-better-sqlite3-session / manual)
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expire  INTEGER NOT NULL                         -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- Business categories (Finance / Sales / Legal / HR / Operations …)
CREATE TABLE IF NOT EXISTS business_categories (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'money',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-user notification preferences (daily digest)
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled         INTEGER NOT NULL DEFAULT 1,
  delivery_time   TEXT NOT NULL DEFAULT '07:00',   -- HH:MM local
  sections        TEXT NOT NULL DEFAULT '{"meetings":true,"overdue":true,"tasks":true,"upcoming":true}',
  last_sent_date  TEXT,                            -- YYYY-MM-DD of last delivery (dedupe)
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
