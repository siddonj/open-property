-- Phase 1: leasing workflow (docs/sdlc/changes/phase-1-leasing/spec.md).
-- schema.sql stays the baseline; deltas live here and are tracked in d1_migrations.

ALTER TABLE applications ADD COLUMN follow_up_date TEXT;   -- 'YYYY-MM-DD'
ALTER TABLE applications ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_applications_follow_up ON applications(follow_up_date);

CREATE TABLE IF NOT EXISTS lease_checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- 'move_in' | 'move_out'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lease_id, kind)
);

CREATE TABLE IF NOT EXISTS lease_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL REFERENCES lease_checklists(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_list ON lease_checklist_items(checklist_id);

INSERT OR IGNORE INTO settings (key, value) VALUES ('renewal_notice_days', '60');
