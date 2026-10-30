# Intent: Phase 1 — Leasing workflow

Author: Josh (requester); drafted with Claude
Status: Approved
Date: 2026-10-29
Roadmap: [Phase 1 in `intent.md`](../../../../intent.md#phase-1-leasing-workflow)

## Problem

- Applications exist in the schema and API (`/api/applications`) but have no
  UI. Operators can only manage them by calling the API directly.
- Applications have no follow-up date or last-updated timestamp, so nobody can
  tell which active applications are stalled.
- Lease expirations are shown on the dashboard (60 days) and highlighted on the
  leases page (30 days), but the two windows are hardcoded and differ. A lease
  past its `end_date` that is still `active` looks the same as one that is
  about to expire, and there is no shortcut to start a renewal.
- There are no move-in or move-out checklists.

## Proposed outcome

1. **Applications pipeline**: an Applications page with status filters and
   search, a create/edit dialog linked to a property and unit, guided status
   changes (new → screening → approved / declined / withdrawn), and a
   follow-up date. Applications that need follow-up appear on the dashboard.
2. **Renewal visibility**: one configurable renewal window. "Expired but still
   active" is shown separately from "expiring soon". A **Renew** action opens
   a new-lease dialog with the current lease's values filled in. Nothing
   changes automatically.
3. **Move-in / move-out checklists**: each lease can have a move-in checklist
   and a move-out checklist. Both start from a default item list and can be
   edited. Completion is visible from the lease.

## Affected users and systems

- Operators and staff (single-user app today; no auth).
- Server: `src/server/index.ts` (Applications, Leases, Dashboard, Settings
  sections) and the D1 schema/migrations.
- Client: router, sidebar, app state, dashboard, leases, settings, and a new
  `applications/` component directory.

## Constraints and non-goals

- No public application submission, screening integrations, or credit or
  background checks (roadmap out of scope).
- No email or SMS reminders. "Reminders" means in-app visibility only.
- No automatic lease, tenant, or unit-status changes. Every change is an
  explicit operator action.
- Follow existing patterns: one route union, a Hono section per entity, Zod
  `parseJson`, `buildUpdate`, and `use-app-state.ts` for data access.
- Keep existing lease and tenant workflows working.

## Acceptance criteria

- [ ] An operator can create, edit, change the status of, and delete an
      application from the UI.
- [ ] Applications can be filtered by status, searched by name, email, or
      phone, and show their linked property and unit.
- [ ] Active applications (new or screening) with a follow-up date today or
      earlier appear on the dashboard and link to the Applications page.
- [ ] Leases inside the renewal window, and leases past `end_date` that are
      still active, are visible and labeled differently on both the dashboard
      and the leases page.
- [ ] **Renew** opens a lease dialog filled in from the existing lease. Saving
      it creates a new lease and does not change the old one.
- [ ] A move-in or move-out checklist can be created for a lease, items can be
      checked off, added, or removed, and checklist progress is visible.
- [ ] Existing lease, tenant, rent, and dashboard flows still work.
      `pnpm typecheck` and `pnpm build` pass.

## Open questions

See [`spec.md` → Open questions](./spec.md#open-questions). Decisions D1–D4
must be made before the build starts.
