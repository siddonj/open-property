-- Phase 2: maintenance workflow (docs/sdlc/changes/phase-2-maintenance/spec.md).

-- Preventive-maintenance templates. Created before the work_orders column that references it.
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',     -- 'low' | 'normal' | 'high' | 'urgent'
  estimated_cost REAL,
  interval_unit TEXT NOT NULL,                 -- 'week' | 'month'
  interval_count INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL,                    -- 'YYYY-MM-DD'; first occurrence
  last_generated_through TEXT,                 -- high-water mark for generation
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE work_orders ADD COLUMN estimated_cost REAL;      -- approval basis; existing `cost` = actual
ALTER TABLE work_orders ADD COLUMN approval_status TEXT;     -- NULL (not required) | 'pending' | 'approved' | 'rejected'
ALTER TABLE work_orders ADD COLUMN approved_at TEXT;
ALTER TABLE work_orders ADD COLUMN recurring_task_id INTEGER REFERENCES recurring_tasks(id) ON DELETE SET NULL;
ALTER TABLE work_orders ADD COLUMN occurrence_date TEXT;     -- immutable dedupe key for generated work

CREATE UNIQUE INDEX IF NOT EXISTS idx_wo_recurrence ON work_orders(recurring_task_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_wo_scheduled ON work_orders(scheduled_at);

INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance_approval_threshold', '');
