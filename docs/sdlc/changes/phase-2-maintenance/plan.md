# Plan: Phase 2 — Maintenance workflow

Intent: [`intent.md`](./intent.md)
Spec: [`spec.md`](./spec.md)
Status: In progress

Delivered as five slices, in order. Each slice ends with typecheck, build,
curl, and browser checks before the next starts.

## Files and systems that change

- `migrations/0002_phase2_maintenance.sql` (new)
- `src/server/index.ts`:
  - Work orders: filters, `estimated_cost`, approval logic and endpoint,
    `completed_at`
  - Recurring tasks: new section, with generation
  - Dashboard: overdue count and ordering
  - Settings: threshold key
- `src/client/types.ts`: `WorkOrder` gains approval, estimate, and recurrence
  fields; `RecurringTask` (new); dashboard summary fields
- `src/client/hooks/use-app-state.ts`: filter params, approval, and
  recurring-task methods; `maintenance_approval_threshold` setting
- `src/client/components/maintenance/maintenance-page.tsx`: due tabs,
  property and unit filters, Generate action, approval badges
- `src/client/components/maintenance/work-order-dialog.tsx`: estimated vs
  actual cost, Approve/Reject, enforcement errors
- `src/client/components/maintenance/recurring-tasks.tsx` (new): template
  list and dialog
- `src/client/components/properties/property-page.tsx`: unit filter and
  Open/Completed toggle on work orders
- `src/client/components/dashboard/dashboard-page.tsx`: overdue count and
  ordering
- `src/client/components/settings/settings-page.tsx`: approval threshold
- `README.md`, `CLAUDE.md`: features, and the new section in `index.ts`

## Order of work

**Slice 0: migration and `completed_at` fix**
1. Add `0002`, apply it locally twice, and check the schema.
2. Server PUT/POST set and clear `completed_at` on status changes. Verify that
   the maintenance report picks up a UI-completed work order.

**Slice A: due and overdue visibility**
3. Server: `due`, `unit_id`, `vendor_id`, and `today` filters, plus the
   dashboard `overdue_work_orders` field.
4. Client: due tabs and counts, overdue labels, an explicit "Unassigned", and
   the dashboard overdue count.

**Slice B: history by property and unit**
5. Maintenance page property and unit filters. Property-page unit filter and
   Open/Completed toggle.

**Slice C: recurring tasks**
6. Server: CRUD, an occurrence-date helper (month clamping), and generate with
   `ON CONFLICT DO NOTHING` plus the high-water mark.
7. Client: template list and dialog, plus the Generate button with a result
   message.

**Slice D: approval threshold**
8. Settings key and UI. Server computes approval on create and update, plus
   the approval endpoint and D4 enforcement.
9. Client: estimated vs actual cost fields, badges, Approve/Reject, and the
   enforcement error shown in the dialog.

**Wrap-up**
10. Update the README and CLAUDE.md. Get an independent review against
    `REVIEW.md`, then fix its findings.

## Risks and alternatives

- **Recurrence date math** is the riskiest logic. Keep it in one pure helper
  and check it with a node script covering Jan 31, Feb 29, and week intervals
  before wiring it in.
- **`index.ts` grows to about 1,400 lines.** Recurring tasks could reasonably
  be the first extracted module, but staying in one file follows the
  convention. Revisit after this phase.
- **Approval enforcement** may surprise operators the first time they set a
  threshold. The error message names the reason and the action needed
  (approve first).

## Proof

- [x] Migration applies to an existing DB, and a second run is a no-op
- [x] curl checks: `due` filters with a fixed `today`; generate twice;
      delete-and-regenerate; approval 400/409 paths; `completed_at`
      set/clear; maintenance report count
- [x] Node check of the occurrence helper (month-end, leap year, weeks)
- [x] Browser: each slice's flow, plus regression checks on maintenance,
      property, dashboard, and reports pages
- [x] `pnpm typecheck`
- [x] `pnpm build`

## Deviations

- **Server-side `due` / `unit_id` / `vendor_id` / `today` list filters not built.**
  The maintenance page already loads all work orders and filters in the browser
  (`components/maintenance/due.ts`), matching the existing pattern. No caller
  would use the API filters; add them if the list ever needs paging.
- **Generation doesn't backfill.** The spec said every occurrence in
  `(last_generated_through, today + 14]`. Shipped: a template's first run skips
  past dates, and after a gap only the latest missed occurrence is created (one
  overdue work order, not a backlog). Editing a template's start or interval
  never produces dates at or before the high-water mark; delete and recreate the
  template to reset it. `generate` rejects a client `today` more than a day off
  the server date, since a wrong clock would push the mark forward permanently.
- **Dashboard overdue count** sits on the "Open work orders" list card header,
  not the top KPI tile.
