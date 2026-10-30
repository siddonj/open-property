# Spec: Phase 2 — Maintenance workflow

Intent: [`intent.md`](./intent.md)
Status: Approved (recommended defaults for D1–D4)

## Requirements

### A. Due, scheduled, and overdue visibility

- **Definitions** (D3; recommended). These use the client's local date, as in
  Phase 1:
  - **Overdue:** status not completed or cancelled, and `scheduled_at < today`.
  - **Due soon:** scheduled within the next 7 days.
  - **Unscheduled:** open with no `scheduled_at`.
  - **Unassigned:** no vendor.
- The maintenance page adds **Overdue**, **Due soon**, and **Unscheduled**
  tabs alongside the existing status tabs, each with a count. Overdue rows are
  labeled "Overdue · N days" in a distinct color.
- The dashboard adds an **Overdue** count to the open-work-orders card and
  lists overdue work first. Rows link to `/maintenance`.
- Responsibility means the vendor. Rows show the vendor, or an explicit
  "Unassigned".

### B. History by property and unit

- The maintenance page gets property and unit filters (unit options depend on
  the selected property).
- The property page's work-order section gets a unit filter and an
  Open / Completed / All toggle. Work orders that already have a unit show it.
- There is no new unit detail page.

### C. Recurring preventive tasks

- New **recurring task** templates, each with:
  - title, description, property (required), unit (optional), vendor
    (optional), priority, estimated cost (optional)
  - interval: every N weeks or every N months (D2)
  - start date and an active flag
- Settings (or a Maintenance tab) lists the templates with create, edit,
  pause, and delete.
- **Generate due tasks** (maintenance page): for each active template, create a
  work order for every occurrence date in
  `(last_generated_through, today + 14 days]`. Each new work order gets
  `scheduled_at` = the occurrence date, `recurring_task_id`, and
  `occurrence_date`. The template's `last_generated_through` then advances.
- **No duplicates:** a unique index on
  `work_orders(recurring_task_id, occurrence_date)`, combined with the
  `last_generated_through` high-water mark. Rescheduling a generated work order
  changes `scheduled_at` but not `occurrence_date`. Deleting one doesn't cause
  it to be generated again.
- Month stepping clamps to the end of the month (Jan 31 → Feb 28/29 → Mar 31,
  measured from the start date, not chained).

### D. Approval threshold

- **D1 (recommended):** add `estimated_cost`; the existing `cost` field becomes
  "actual cost". The approval rule uses the estimate.
- New setting `maintenance_approval_threshold`. If it is empty or 0, approval
  is disabled.
- When `estimated_cost > threshold`, the server sets `approval_status =
  'pending'`. This happens on create, or when the estimate rises above the
  threshold. Otherwise `approval_status` stays null (not required).
- The dialog has explicit **Approve** and **Reject** actions, which set
  `approval_status` and `approved_at`.
- **D4 (recommended):** while approval is pending or rejected, the server
  refuses to move the work order to `in_progress` or `completed` (400 with a
  clear message). Assigning a vendor and scheduling are still allowed.
- Rows and the dialog show "Approval required", "Approved", or "Rejected"
  badges with text, not color alone.

### E. Fix `completed_at`

- When a PUT moves the status to `completed` and `completed_at` is not
  provided, the server sets `completed_at = date('now')`. Moving away from
  completed clears it.
- Existing completed rows with a null `completed_at` are left null. Their real
  completion dates are unknown, so they stay out of the report.

## User experience

- Follows the existing list, tab, and dialog patterns, loading and empty
  states, and error banner.
- The Generate action reports "Created N work orders" (or "Nothing due").
- Deleting a recurring template asks for confirmation. Work orders already
  generated from it are kept, and their `recurring_task_id` is set to null.

## Data and API changes

`migrations/0002_phase2_maintenance.sql`:

```sql
ALTER TABLE work_orders ADD COLUMN estimated_cost REAL;
ALTER TABLE work_orders ADD COLUMN approval_status TEXT;      -- NULL | 'pending' | 'approved' | 'rejected'
ALTER TABLE work_orders ADD COLUMN approved_at TEXT;
ALTER TABLE work_orders ADD COLUMN recurring_task_id INTEGER REFERENCES recurring_tasks(id) ON DELETE SET NULL;
ALTER TABLE work_orders ADD COLUMN occurrence_date TEXT;      -- immutable dedupe key for generated work
CREATE UNIQUE INDEX IF NOT EXISTS idx_wo_recurrence ON work_orders(recurring_task_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_wo_scheduled ON work_orders(scheduled_at);

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  estimated_cost REAL,
  interval_unit TEXT NOT NULL,                 -- 'week' | 'month'
  interval_count INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL,
  last_generated_through TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance_approval_threshold', '');
```

SQLite allows `ADD COLUMN ... REFERENCES` only with a NULL default, which this
is. The `recurring_tasks` table must be created before the `ALTER` statements
that reference it.

**API** (all in `src/server/index.ts`):

- `GET /api/work-orders` adds `unit_id`, `vendor_id`, and `due=overdue|soon|unscheduled`
  filters, plus `today=` (validated) for date grouping.
- `WorkOrderInput` gains `estimated_cost`. `approval_status` and `approved_at`
  can't be set directly through create or update.
- POST and PUT compute `approval_status` from the estimate and the threshold,
  enforce D4, and set or clear `completed_at`.
- `POST /api/work-orders/:id/approval` with
  `{ decision: "approved" | "rejected" }`. Returns 409 if approval isn't
  required.
- Recurring tasks: `GET`, `POST`, `PUT`, `DELETE /api/recurring-tasks`, and
  `POST /api/recurring-tasks/generate` with `{ today }`, which returns
  `{ created }`.
- `GET /api/dashboard/summary` adds `overdue_work_orders` and orders overdue
  work first.

## Risks and safeguards

- **Generation correctness:** month-end clamping, the high-water mark, and the
  unique index each guard against duplicates independently. Inserts use
  `ON CONFLICT DO NOTHING`. Verify by running Generate twice and by deleting
  and then regenerating.
- **Concurrent Generate clicks:** the unique index makes this safe. The
  high-water mark only moves forward (`MAX`).
- **Approval enforcement** changes existing behavior: a work order with a high
  estimate can no longer be completed until it is approved. When the threshold
  is unset (the default), there is no change.
- The `completed_at` fix changes report totals from now on. This is correct
  behavior, but numbers will move.
- **Required migration:** the remote database must run `migrations apply`, as
  in Phase 1.

## Out of scope

- Attachments and photos, vendor portals or notifications, cron or automatic
  generation, staff assignees and user identity on approvals (Phase 5),
  approval chains or multiple approvers, backfilling historical `completed_at`.

## Open questions

- **D1 — What the approval threshold applies to.** Recommended: a new
  estimated cost, with the existing `cost` kept as the actual cost.
  Alternatively, apply it to the existing `cost` field.
- **D2 — Recurrence model.** Recommended: every N weeks or every N months from
  a start date. Alternatives: fixed calendar rules (for example, "1st Monday")
  or day-interval only.
- **D3 — What counts as overdue.** Recommended: past `scheduled_at` and still
  open. Alternatively, open for more than N days since creation (would also
  catch unscheduled work).
- **D4 — Approval enforcement.** Recommended: the server blocks moving to
  in progress or completed until the work order is approved. Alternatively, a
  badge only, with no enforcement.

## Acceptance criteria

- [ ] Overdue, due-soon, and unscheduled views and counts match the
      definitions, checked against seeded work orders with past, near, and no
      dates.
- [ ] The property and unit filters return the right open and completed work
      orders.
- [ ] Generate run twice creates each occurrence once. Deleting a generated
      work order and regenerating doesn't recreate it. Month-end clamping is
      correct for Jan 31 starts.
- [ ] Above-threshold work shows as pending. Moving it to in progress or
      completed returns 400 until it is approved (if D4). The threshold unset
      gives no change.
- [ ] Completing a work order sets `completed_at`, and it appears in the
      maintenance report.
- [ ] The migration applies to an existing local DB, and a second run is a
      no-op.
- [ ] `pnpm typecheck` and `pnpm build` pass. Browser checks for each flow,
      and regression checks for existing pages.

## Approval

- Product/requester: Josh, 2026-10-29 — D1 estimated cost, D2 every N weeks/months, D3 past scheduled date, D4 block until approved
- Technical review, if needed: _pending_
