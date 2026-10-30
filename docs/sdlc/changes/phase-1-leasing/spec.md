# Spec: Phase 1 — Leasing workflow

Intent: [`intent.md`](./intent.md)
Status: Approved (recommended defaults for D1–D4)

## Requirements

### A. Applications pipeline

- New route `/applications` (route union member `{ name: "applications" }`),
  with a sidebar entry between Tenants and Leases.
- List: status tabs (All, New, Screening, Approved, Declined, Withdrawn), a
  search box (name, email, phone), and columns for applicant, property / unit,
  desired move-in, status, follow-up, and income.
- Create/edit dialog: first and last name (required), email, phone, employer,
  monthly income, property → unit select (only `unit_id` is stored; the
  property comes from the unit), desired move-in, follow-up date, and notes.
- Status actions in the dialog and row menu:
  - new → screening
  - screening → approved or declined
  - new or screening → withdrawn
  - approved, declined, or withdrawn → **Reopen** (back to screening)
  - The server keeps validating only the status enum (D3).
- Follow-up: a nullable `follow_up_date`. A record **needs follow-up** when
  its status is new or screening and `follow_up_date <= today`. Active records
  with no date show "No follow-up set".
- `updated_at` is set on every PUT so the list can show when each record was
  last touched.
- Approved applications show a **Create tenant** action that opens the existing
  tenant dialog filled in with name, email, phone, employer, and income (D2).
  It does not create a lease or change the unit status.

### B. Renewal visibility

- A new setting, `renewal_notice_days` (default `60`), on the Settings page.
- Dashboard "Lease expirations" uses the setting and splits leases into two
  groups:
  - **Expired**: `status = 'active' AND end_date < today`
  - **Expiring**: `today <= end_date <= today + N`
  - Each row links to `/leases`.
- Leases page: a new **Expiring** filter tab covering both groups, with
  distinct badges. The existing 30-day highlight switches to the setting.
- **Renew** row action: opens `LeaseDialog` in create mode with unit, tenant,
  rent, deposit, due day, and late fee copied over, `start_date = old end_date
  + 1 day`, and `end_date` one year after the new start. The operator saves
  explicitly. The old lease is not changed; the operator ends it manually as
  today.

### C. Move-in / move-out checklists

- A checklist belongs to a lease (D4) and has a kind (`move_in` or
  `move_out`). Each lease has at most one checklist per kind.
- New checklists are seeded from a hardcoded default item list in the server:
  - Move-in: keys handed over, meter readings recorded, condition photos taken,
    deposit received, utilities transferred.
  - Move-out: keys returned, forwarding address recorded, final inspection
    completed, meter readings recorded, deposit disposition recorded.
- Items: label, done (bool), done_at, and sort order. Items can be checked or
  unchecked, added, renamed, and deleted.
- UI: a **Checklists** row action on the leases page opens a dialog with
  Move-in and Move-out tabs. The lease row shows progress (for example,
  "Move-in 3/5").

## User experience

- All list pages follow the existing loading, empty, and error patterns
  (`app.setError` and the error banner).
- The dialog requires first and last name. Invalid dates are blocked by
  `<input type="date">`. Server 400 errors appear in the error banner.
- Deleting an application or checklist item asks for confirmation using the
  existing in-app pattern, not `window.confirm`, if one exists. Otherwise,
  follow whatever the leases or tenants pages do.
- Status and follow-up badges use text labels, not color alone.

## Data and API changes

**Migration (D1):** recommended: adopt Wrangler's built-in D1 migrations
(`migrations/0001_phase1_leasing.sql`, tracked in `d1_migrations`) and leave
`schema.sql` as the unchanged baseline. Altering `schema.sql` cannot add
columns to existing databases, and `ALTER TABLE ... ADD COLUMN` fails if run
twice.

`0001_phase1_leasing.sql`:

```sql
ALTER TABLE applications ADD COLUMN follow_up_date TEXT;
ALTER TABLE applications ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_applications_follow_up ON applications(follow_up_date);

CREATE TABLE IF NOT EXISTS lease_checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                       -- 'move_in' | 'move_out'
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
```

**API (all in `src/server/index.ts`):**

- `GET /api/applications?status=&q=` adds optional filters. `ApplicationInput`
  gains `follow_up_date`. PUT sets `updated_at = datetime('now')`.
- `GET /api/leases/:id/checklists` returns both checklists with their items.
- `POST /api/leases/:id/checklists` with `{ kind }` creates and seeds a
  checklist. Returns 409 if one already exists.
- `POST /api/checklists/:id/items` with `{ label }`,
  `PUT /api/checklist-items/:id` with `{ label?, done? }` (sets or clears
  `done_at`), and `DELETE /api/checklist-items/:id`.
- `GET /api/leases` adds `move_in_done`, `move_in_total`, `move_out_done`, and
  `move_out_total` through correlated subqueries, matching the existing
  aggregate convention.
- `GET /api/dashboard/summary` adds `followups_due` (count plus top 6) and
  `expired_leases`. `upcoming_expirations` uses `renewal_notice_days`.
- The Settings PUT accepts `renewal_notice_days`, if it allowlists keys.

## Risks and safeguards

- **Migration rollout (required, not optional)**: existing local and deployed
  databases need `migrations apply` once. `pnpm dev` / `db:migrate` runs it
  after `schema.sql`. Without it, core endpoints fail. `GET/POST/PUT
  /api/leases` and application create/update return 500 because
  `LEASE_SELECT` references the checklist tables, and lease create/update
  commit before the failing read-back. Deploys must run
  `wrangler d1 migrations apply open-property-db --remote`. (`clawnify
  deploy` is out of scope per the requester, 2026-10-29.)
- **Shared PII**: applications hold applicant PII. There is no auth today
  (Phase 5). No new exposure beyond the existing open API, but don't log
  request bodies.
- **Renew** creates a second lease on the same unit. Overlapping-date
  validation does not exist today and stays out of scope. The old lease
  remains manual to end.
- The dashboard's `safeGet` / `safeQuery` swallow errors, so on the dashboard
  alone a missing migration shows zeros, not errors. The proof step checks
  real values.
- **Dates**: the dashboard's follow-up and expiration grouping uses the
  client's local date (`?today=YYYY-MM-DD`), not the server's UTC date, so it
  agrees with the labels in the UI. The existing rent "overdue" figures still
  use UTC `date('now')` and are unchanged.

## Out of scope

- Public or online application forms, screening, or e-signature.
- Automatic lease creation from an approved application.
- Email, SMS, or push reminders.
- Configurable checklist templates (hardcoded defaults only), photo or
  document attachments (Phase 2/5 storage design).
- Lease overlap validation, or automatic changes to unit or lease status.

## Open questions

- **D1 — Migration mechanism.** Recommended: Wrangler D1 migrations in
  `migrations/`. Alternative: edit the `CREATE TABLE` in `schema.sql` and
  require a local DB reset. That breaks existing data. Resolved: Wrangler
  migrations; `clawnify deploy` disregarded.
- **D2 — Approved → tenant.** Recommended: an explicit **Create tenant**
  action that fills in the tenant dialog. No automatic lease. Alternatively,
  defer conversion entirely.
- **D3 — Status-transition enforcement.** Recommended: the UI guides the next
  steps and the server stays permissive (enum only), so corrections remain
  possible. Alternatively, enforce allowed transitions server-side.
- **D4 — Checklist owner.** Recommended: lease-owned only. Unit-level
  turnover checklists with no lease would wait for Phase 2.
- Minor: should renewal tracking states (offered, accepted, declined) be
  stored on the lease? Recommended: defer, since it needs a lease column and a
  decision on lifecycle semantics.

## Acceptance criteria

- [ ] All intent acceptance criteria are verified in the browser against a
      `pnpm dev` database migrated from the existing baseline (not only a fresh
      one).
- [ ] The migration applies cleanly once and is a no-op when applied again.
- [ ] The `/api/applications` filters, checklist endpoints, and dashboard
      fields respond as specified, checked with `curl` against local Wrangler.
- [ ] `pnpm typecheck` and `pnpm build` pass.

## Approval

- Product/requester: Josh, 2026-10-29 (recommended D1–D4)
- Technical review, if needed: _pending_
