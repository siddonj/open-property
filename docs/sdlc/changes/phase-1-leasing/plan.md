# Plan: Phase 1 — Leasing workflow

Intent: [`intent.md`](./intent.md)
Spec: [`spec.md`](./spec.md)
Status: Implemented — pending review

Delivered as three independently shippable slices, in order. Each slice ends
with typecheck, build, and a browser check before the next begins.

## Files and systems that change

- `migrations/0001_phase1_leasing.sql` (new): applications columns, checklist
  tables, `renewal_notice_days` seed
- `wrangler.toml`: `migrations_dir` if the default isn't picked up
- `package.json`: `db:migrate` runs `schema.sql`, then
  `wrangler d1 migrations apply open-property-db --local`
- `src/server/index.ts`: Applications filters and follow-up fields; Lease
  checklist endpoints and progress aggregates; Dashboard follow-ups, expired,
  and renewal window; Settings key
- `src/client/types.ts`: `Application.follow_up_date` and `updated_at`;
  `LeaseChecklist` and `ChecklistItem`; new `Lease` and `DashboardSummary`
  fields
- `src/client/hooks/use-app-state.ts`: application, checklist, and
  `renewal_notice_days` setting methods
- `src/client/hooks/use-router.ts`, `src/client/app.tsx`,
  `src/client/components/sidebar.tsx`: `/applications` route
- `src/client/components/applications/applications-page.tsx`,
  `application-dialog.tsx` (new)
- `src/client/components/leases/leases-page.tsx`: Expiring tab, Renew and
  Checklists actions, progress display
- `src/client/components/leases/lease-dialog.tsx`: accept prefill values for
  create mode
- `src/client/components/leases/checklist-dialog.tsx` (new)
- `src/client/components/tenants/tenant-dialog.tsx`: accept prefill values
  (D2)
- `src/client/components/dashboard/dashboard-page.tsx`: follow-ups card and
  split expirations with links
- `src/client/components/settings/settings-page.tsx`: renewal window input
- `README.md`, `CLAUDE.md`: Applications feature and migration workflow

## Order of work

**Slice 0 — Migration plumbing (D1)**
1. Add `migrations/0001_phase1_leasing.sql` and wire `db:migrate`.
2. Run it against the existing local DB, run it again (expect a no-op), and
   confirm the columns with `PRAGMA table_info(applications)`.

**Slice A — Applications pipeline**
3. Server: `status` and `q` filters on GET, `follow_up_date` in the Zod
   schema, and `updated_at` on PUT.
4. Client: types, app-state methods, route, sidebar, page, and dialog with
   status actions.
5. Dashboard: `followups_due` in the summary and a "Follow-ups due" card
   linking to `/applications`.
6. If D2 is approved: **Create tenant** fills in `TenantDialog`.

**Slice B — Renewal visibility**
7. Settings: `renewal_notice_days` (server allowlist, if any, and the UI
   field).
8. Dashboard summary: `expired_leases` and the window-driven
   `upcoming_expirations`. Split the UI into two groups.
9. Leases page: Expiring tab and badges, and the Renew action with
   `LeaseDialog` filled in.

**Slice C — Move-in / move-out checklists**
10. Server: checklist endpoints, default-item seeding, and progress
    subqueries on `GET /api/leases`.
11. Client: `checklist-dialog.tsx`, the leases row action, and the progress
    display.

**Wrap-up**
12. Update README and CLAUDE.md. Review the diff against intent, spec, plan,
    and `REVIEW.md`.

## Risks and alternatives

- **Migration tool change** (slice 0) touches dev and deploy flow. Mitigation:
  keep `schema.sql` untouched as the baseline, and document the
  `wrangler d1 migrations apply --remote` deploy step. Alternative: a schema-only
  edit with a DB reset (loses data; not recommended).
- **Silent dashboard failures** from `safeGet`: verify the summary JSON
  directly with `curl`, not only the rendered UI.
- **Lease dialog prefill** could regress edit mode. Keep prefill as a separate
  optional prop and leave the `editing` path unchanged.
- **`index.ts` size** grows by about 150 lines to about 1,120. That is still
  one file per convention. Revisit extraction at Phase 2.

## Proof

- [x] Migration applies once on an existing local DB, and a second run is a
      no-op
- [x] `curl` checks: `/api/applications?status=screening&q=...`, the
      checklist create/seed/409/toggle/delete flow, and the dashboard summary
      fields
- [x] Browser: create, edit, change status, and delete an application; the
      follow-up card appears when due; the Expiring tab and badges; Renew
      creates a second lease and leaves the original unchanged; checklist
      progress updates
- [x] Regression: existing leases, tenants, rent, and reports pages still load
      and save
- [x] `pnpm typecheck`
- [x] `pnpm build`

## Deviations

- **Unit picker:** the application dialog uses a single "Property · Unit"
  select, matching `LeaseDialog`, rather than separate property and unit
  selects. Only `unit_id` is stored, as specified.
- **Applications list filtering** happens on the client, matching the leases
  and tenants pages. The `status` and `q` API filters exist as specified but
  the page doesn't use them yet.
- **Renewal term** ends one year minus one day after the new start (Oct 16 →
  Oct 15), matching how existing leases are recorded. The spec said "one year
  after the new start".
- **Dashboard follow-up and expiration rows** link to `/applications` and
  `/leases` list pages. There are no per-record detail routes for either.
- **`wrangler.toml`** needed no change: Wrangler 4.86 defaults to
  `migrations/`.
- **Applications tabs** add a default **Active** tab (new + screening) ahead
  of the specified status tabs.
- **Dashboard expirations** use one list with distinct "Expired · still
  active" and "Expiring in N days" labels, with expired rows first, rather
  than two separate groups. The summary API returns them as separate fields
  (`expired_leases`, `upcoming_expirations`).
- **Summary fields:** `followups_due_count` and `followups_due` (top 6),
  rather than a single combined field.
- **Review fixes (2026-10-29):** the dashboard takes the client's local date;
  renewal end is derived from the new start (leap-year safe); removing a
  checklist item asks for confirmation; concurrent checklist creates return
  409 via `ON CONFLICT DO NOTHING`. Still open: if the checklist-item insert
  fails after the checklist row is created, an empty checklist is left behind.
  D1 helpers expose no transaction, and this is low likelihood.
- **Docs:** CLAUDE.md's existing claim that re-running `db:migrate` resets
  local data was wrong and has been corrected.
