-- Phase 3: financial operations (docs/sdlc/changes/phase-3-financial/spec.md).
-- New money columns are integer cents. Bills and payments are never cascaded away
-- from properties or vendors (D7); the Phase 6 ledger posts from these rows.

-- Chart of accounts, HUD multifamily numbering (MHDC).
CREATE TABLE IF NOT EXISTS gl_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','asset')),
  is_operating INTEGER NOT NULL DEFAULT 1,   -- 1 = counts toward NOI
  active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO gl_accounts (code, name, type, is_operating) VALUES
  ('5120', 'Rent revenue', 'income', 1),
  ('5920', 'Tenant charges (late fees, damages)', 'income', 1),
  ('6210', 'Advertising and marketing', 'expense', 1),
  ('6320', 'Management fee', 'expense', 1),
  ('6340', 'Legal', 'expense', 1),
  ('6350', 'Accounting and audit', 'expense', 1),
  ('6390', 'Miscellaneous administrative (incl. HOA dues)', 'expense', 1),
  ('6450', 'Electricity', 'expense', 1),
  ('6451', 'Water', 'expense', 1),
  ('6452', 'Gas', 'expense', 1),
  ('6453', 'Sewer', 'expense', 1),
  ('6515', 'Supplies', 'expense', 1),
  ('6520', 'Contracts (vendor repairs and services)', 'expense', 1),
  ('6525', 'Garbage and trash removal', 'expense', 1),
  ('6573', 'Exterminating', 'expense', 1),
  ('6580', 'Vacant unit preparation (turnover)', 'expense', 1),
  ('6590', 'Miscellaneous operating and maintenance', 'expense', 1),
  ('6710', 'Real estate taxes', 'expense', 1),
  ('6720', 'Property and liability insurance', 'expense', 1),
  ('6820', 'Mortgage interest', 'expense', 0),
  ('1410', 'Land improvements', 'asset', 0),
  ('1420', 'Building improvements', 'asset', 0),
  ('1450', 'Appliances and furnishings', 'asset', 0);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
  bill_date TEXT NOT NULL,                     -- 'YYYY-MM-DD', property-local
  due_date TEXT,                               -- 'YYYY-MM-DD'
  reference TEXT,                              -- invoice number
  notes TEXT,
  complete INTEGER NOT NULL DEFAULT 0,         -- D8: 1 once all lines are written
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bills_property_date ON bills(property_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_due ON bills(due_date);

CREATE TABLE IF NOT EXISTS bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES gl_accounts(id),
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_account ON bill_lines(account_id);
-- One line per work order; NULLs are distinct, so manual lines never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_lines_work_order ON bill_lines(work_order_id);

CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
  paid_on TEXT NOT NULL,                       -- 'YYYY-MM-DD', property-local
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('check','ach','card','cash','other')),
  reference TEXT,                              -- check or confirmation number
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id);

-- Annual budget per property and account (income accounts allowed, D4).
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES gl_accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (property_id, year, account_id)
);
