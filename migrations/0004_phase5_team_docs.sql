-- Phase 5: users and roles, append-only activity history, and document metadata (files live in R2).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'maintenance')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  at TEXT NOT NULL DEFAULT (datetime('now')),
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  label TEXT,
  changes TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_record ON activity(entity, entity_id, id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, id);

-- History is append-only: no edits or deletes, through the app or SQL.
CREATE TRIGGER IF NOT EXISTS activity_no_update BEFORE UPDATE ON activity
  BEGIN SELECT RAISE(ABORT, 'activity is append-only'); END;
CREATE TRIGGER IF NOT EXISTS activity_no_delete BEFORE DELETE ON activity
  BEGIN SELECT RAISE(ABORT, 'activity is append-only'); END;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL CHECK (entity IN ('lease', 'tenant', 'work_order', 'bill')),
  entity_id INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_record ON documents(entity, entity_id);
