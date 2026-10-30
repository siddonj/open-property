# Spec: Phase 3 — Financial operations

Intent: [`intent.md`](./intent.md)
Status: Approved 2026-10-29 (revised). D2–D4 stand; D1 is superseded by D5;
D5–D8 approved.

Background: [`reports/Multifamily accounting and compliance.md`](../../../../reports/Multifamily%20accounting%20and%20compliance.md).
This phase builds the payables subledger and chart of accounts that the Phase 6
general ledger posts from. It posts no journal entries itself.

## Requirements

### A. Accounts

- A seeded chart of accounts (`gl_accounts`) replaces the fixed category list.
  Codes follow the HUD multifamily chart as published by MHDC, so affordable
  and lender mapping later is a lookup.
- Each account has a code, name, type (`income` | `expense` | `asset`), and
  `is_operating` (counts toward NOI). Phase 6 adds liability and equity
  accounts.
- Seed (operating unless noted):

  | Code | Name | Type |
  |---|---|---|
  | 5120 | Rent revenue | income |
  | 5920 | Tenant charges (late fees, damages) | income |
  | 6210 | Advertising and marketing | expense |
  | 6320 | Management fee | expense |
  | 6340 | Legal | expense |
  | 6350 | Accounting and audit | expense |
  | 6390 | Miscellaneous administrative (incl. HOA dues) | expense |
  | 6450 | Electricity | expense |
  | 6451 | Water | expense |
  | 6452 | Gas | expense |
  | 6453 | Sewer | expense |
  | 6515 | Supplies | expense |
  | 6520 | Contracts (vendor repairs and services) | expense |
  | 6525 | Garbage and trash removal | expense |
  | 6573 | Exterminating | expense |
  | 6580 | Vacant unit preparation (turnover) | expense |
  | 6590 | Miscellaneous operating and maintenance | expense |
  | 6710 | Real estate taxes | expense |
  | 6720 | Property and liability insurance | expense |
  | 6820 | Mortgage interest (below NOI) | expense |
  | 1410 | Land improvements (capital) | asset |
  | 1420 | Building improvements (capital) | asset |
  | 1450 | Appliances and furnishings (capital) | asset |

- Accounts are read-only in this phase (`GET /api/accounts`). Adding or
  renaming accounts waits for Phase 6.

### B. Bills and payments

- A **bill** has: property (required), vendor (optional), bill date
  (`bill_date`), optional due date, optional reference (invoice number), and
  notes. A one-off expense is a bill without a vendor or due date (D5).
- A bill has one or more **lines**. Each line has an account (expense or asset),
  description, amount in cents (> 0), and an optional unit (must belong to the
  bill's property) and work order (D2).
- A line on an `asset` account is **capital spending**; a line on an operating
  `expense` account is an **operating expense**. Reports keep them apart.
- A **bill payment** has a date, amount in cents, method (`check` | `ach` |
  `card` | `cash` | `other`), and optional reference. Its amount cannot exceed
  the bill's unpaid balance.
- A bill's total is the sum of its lines; its paid amount is the sum of its
  non-voided payments. Status is derived: `paid` when paid = total, otherwise
  `unpaid`. **Overdue** means `unpaid` with `due_date` before the operator's
  local date (the Phase 2 pattern).
- Corrections (D6):
  - A bill with no payment records can be edited or deleted.
  - Once a bill has any payment record, its lines and amounts are locked. Void
    the payments first.
  - Payments are never deleted. Voiding sets `voided_at` and drops the payment
    from the paid amount.
- Retention (D7): deleting a property or vendor that has bills is rejected
  with 409 and a message to keep the records. Deleting a unit or work order
  clears the link on the line.

### C. Payables view

- A new **Expenses** page under Operations (`/expenses`) with Unpaid, Overdue,
  Paid, and All tabs, each showing a count and a total.
- Filters: property, vendor, account, and date range (by `bill_date`).
- Each row shows date, property, vendor, accounts (or "N lines"), total,
  paid, status, and due date. Overdue rows show "Overdue · N days".
- **Mark paid** on unpaid rows records one payment for the remaining balance,
  with a date (default today) and method. Partial payments are possible in the
  API; the UI only pays in full.
- A payments list on the bill dialog, with **Void** per payment.
- **Export CSV** of the filtered list, with a totals row.

### D. Property income and expense summaries

- A new **Profit & loss** report tab with from/to month and a property filter
  ("All properties" or one). For each month it shows:
  - rent charged and rent collected, using the existing Income report rules
    (by charge period, D3)
  - operating expenses by `bill_date` month, split into paid and unpaid
  - net operating = rent collected − operating expenses
  - below the line: mortgage interest and capital spending, each shown
    separately and excluded from net operating
- An account breakdown for the range sits below the monthly table, grouped
  into operating, below NOI, and capital.
- The existing **Income** tab gains the same property filter, so its numbers
  match the P&L tab for the same filters.
- The property page gets a **Financials** card for the current year to date:
  collected, operating expenses, net operating, capital spending, and unpaid
  bills, linking to the P&L tab filtered to that property.

### E. Budgets

- One budget line per property, year, and account, holding an annual amount in
  cents. Income accounts (5120) can be budgeted too (D4).
- A **Budget** report tab: pick a property and a year, edit the amounts inline,
  and see for each account the budget, the actual, the variance, and the
  percent used. Actuals use the same rules as the P&L.
- Accounts with actuals but no budget still show, so unbudgeted spending stays
  visible.

### F. CSV export

- Expenses list, P&L monthly table, P&L account breakdown, and Budget table.
- Exports contain the rows and totals on screen for the current filters, and
  reuse `downloadCsv`.

## User experience

- The sidebar gets **Expenses** under Operations, after Maintenance.
- The bill dialog opens with one line. **Add line** adds more; the dialog
  shows the running total. Line unit pickers list only units of the selected
  property, as the work-order dialog does.
- Accounts are picked from a grouped list (operating, below NOI, capital), with
  the code shown beside the name.
- A bill with payments opens read-only with a note: "Void payments to edit."
- Empty states: "No expenses yet. Record bills and costs for your properties."
  A filter with no matches gets its own message.
- Money is entered as text, parsed to cents without floating-point math, and
  shown with the existing `formatMoney` and currency setting.
- Validation errors from the server appear inline in the dialog (the Phase 2
  pattern).

## Data and API changes

Migration `migrations/0003_phase3_financial.sql` (replaces the earlier draft;
see the plan's Deviations):

```sql
CREATE TABLE IF NOT EXISTS gl_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','asset')),
  is_operating INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);
-- INSERT OR IGNORE the seed rows from requirement A.

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
  bill_date TEXT NOT NULL,            -- 'YYYY-MM-DD', property-local
  due_date TEXT,
  reference TEXT,
  notes TEXT,
  complete INTEGER NOT NULL DEFAULT 0,  -- D8: 1 once all lines are written
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
  paid_on TEXT NOT NULL,              -- 'YYYY-MM-DD', property-local
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('check','ach','card','cash','other')),
  reference TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES gl_accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (property_id, year, account_id)
);
```

`bill_lines` cascades from `bills` only so that deleting a payment-free bill
removes its lines. `bill_payments` restricts, so a bill with payment records
cannot be deleted even by mistake.

API (all in `src/server/index.ts`, following existing sections):

- `GET /api/accounts`.
- `GET /api/bills?property_id&vendor_id&account_id&status&from&to` returns
  complete bills with `lines[]`, `total_cents`, `paid_cents`, and derived
  `status`. `from`/`to` are dates (`YYYY-MM-DD`), validated and capped at 36
  months.
- `POST /api/bills` and `PUT /api/bills/:id` take the header plus `lines[]`.
  The server checks that units belong to the property and that accounts are
  `expense` or `asset`, and returns 409 if the bill has payment records.
- `DELETE /api/bills/:id` returns 409 if the bill has payment records.
- `POST /api/bills/:id/payments` with `{ paid_on, amount_cents?, method,
  reference? }`. `amount_cents` defaults to the unpaid balance; more than the
  balance returns 400.
- `POST /api/bill-payments/:id/void`.
- `GET /api/budgets?property_id&year` and `PUT /api/budgets` with
  `{ property_id, year, lines: [{ account_id, amount_cents | null }] }`. A null
  amount deletes the line; otherwise the line is upserted.
- `GET /api/reports/profit-loss?from&to&property_id` returns `months[]` and
  `accounts[]`, all in cents.
- `GET /api/reports/budget?property_id&year` returns
  `lines[] { account_id, code, name, budget_cents, actual_cents, variance_cents }`.
- `GET /api/reports/income` gains an optional `property_id`, joined through
  lease → unit → property.
- `DELETE /api/properties/:id` and `DELETE /api/vendors/:id` return 409 when
  bills exist (D7).

Client: `Account`, `Bill`, `BillLine`, `BillPayment`, `BudgetLine`, and report
types in `types.ts`; a `parseCents` helper in `lib/utils.ts`; methods in
`use-app-state.ts`; route `expenses` in `use-router.ts` and `app.tsx`;
`components/expenses/` (page plus bill dialog); `reports/profit-loss-tab.tsx`
and `reports/budget-tab.tsx`.

## Risks and safeguards

- **Partial writes (D8).** `@clawnify/db` runs one statement per call, so a
  bill and its lines cannot be inserted atomically. The server inserts the
  bill with `complete = 0`, inserts the lines, then sets `complete = 1`. Every
  read and report filters `complete = 1`, so a failed write leaves an invisible
  draft, never a bill with missing lines. An edit marks the bill incomplete,
  replaces its lines, and marks it complete again; a failed edit leaves the bill
  listed under All with an "Incomplete" badge so the operator can re-save it.
  Phase 6 replaces this with an atomic posting path.
- **Double counting maintenance (D2).** Work orders already carry an actual
  `cost`. The P&L reads only bill lines. Completed work can be turned into one
  linked line (unique `work_order_id`).
- **Two income figures.** Charge-period income (accrual-like) and payment-date
  income (cash) differ. Using the existing Income report's rule keeps the tabs
  consistent (D3), and the tab says which basis it uses.
- **Mixed money types.** New tables are integer cents; rent tables stay `REAL`
  until Phase 6. Reports convert rent with `CAST(ROUND(x * 100) AS INTEGER)`
  per row before summing, and return cents. The client parses typed amounts
  with `parseCents` (string split, no `* 100` on a float).
- **Deleting a property or vendor.** Rejected while bills exist (D7), so
  financial history survives. Units and leases still cascade from properties
  as before; Phase 6 removes those cascades.
- **Unit and property mismatch.** Validated on create and update so per-unit
  numbers can't drift outside their property.
- **CSV injection.** Covered by the existing `downloadCsv` guard. Descriptions,
  references, and notes are user text, so they must go through it.

## Out of scope

- Journal entries, accounts payable control balances, period locks, and
  operator-defined accounts (Phase 6).
- Vendor W-9 and TIN capture, 1099 totals (Phase 6). The payment method is
  stored now so card payments can be excluded later.
- Recurring bills; receipt attachments; partial payments in the UI; bank
  import; owner statements and portals; depreciation; multi-currency.
- Budget periods other than a calendar year; budgets by unit.
- Dashboard financial widgets. Phase 4 (alerts) covers "bills due soon".

## Open questions

None open. Decisions by Josh on 2026-10-29:

- **D1 — One table.** _Superseded by D5 when the general ledger entered the
  roadmap._
- **D2 — Record as expense.** The P&L counts only bill lines. Completed work
  orders with a cost offer **Record as expense**, which opens a prefilled
  one-line bill linked to the work order (unique `work_order_id`).
- **D3 — Charge-period income.** Rent charged and collected by charge period,
  matching the existing Income report.
- **D4 — Annual budgets.** One amount per property, year, and account,
  including rent income (5120).

Added with the revision (approved by Josh, 2026-10-29):

- **D5 — Bills with lines.** `bills`, `bill_lines`, and `bill_payments` in
  integer cents, with lines coded to a seeded HUD-numbered chart of accounts.
  This is the shape the Phase 6 ledger posts from.
- **D6 — Lock on payment, void not delete.** Bills are editable until a
  payment is recorded; payments are voided, never deleted.
- **D7 — Keep financial history.** Property and vendor deletes are rejected
  while bills exist.
- **D8 — Complete flag for multi-row writes.** Reads ignore bills until all
  their lines are written.

## Acceptance criteria

- [ ] A bill with one or more lines can be created, edited, and deleted while
      it has no payments; once paid it is locked until the payment is voided
      (curl and browser).
- [ ] Mark paid records a payment for the balance; voiding it returns the bill
      to unpaid; overpaying returns 400 (curl).
- [ ] The Unpaid, Overdue, and Paid tabs and their totals match the database
      for a fixed `today` (curl and browser).
- [ ] A bill whose line inserts fail never appears as complete (simulate by
      stopping after the header insert).
- [ ] P&L totals for a property and range match hand-computed sums from seeded
      charges, payments, and bills, with capital lines and mortgage interest
      excluded from net operating. The Income tab and the P&L agree for the
      same filters (curl).
- [ ] Budget vs actual shows the right variance, including unbudgeted accounts
      (curl and browser).
- [ ] Each CSV export's rows and totals match the screen for the same filters
      (browser download compared to the API).
- [ ] Deleting a property or vendor with bills returns 409 and deletes nothing.
- [ ] The migration applies to a fresh database, and a second run is a no-op.
- [ ] Rent, maintenance, dashboard, and the existing reports still work.
      `pnpm typecheck` and `pnpm build` pass.

## Approval

- Product/requester: Josh, 2026-10-29 (D1–D4); revision D5–D8 approved 2026-10-29
- Technical review, if needed: _pending_
