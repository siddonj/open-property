# Intent: Phase 4 — Alerts and reporting

Author: Josh (requester); drafted with Claude
Status: Approved 2026-10-30 (open-question defaults accepted; no one-time
`units.status` correction)
Date: 2026-10-30
Roadmap: [Phase 4 in `intent.md`](../../../../intent.md#phase-4-alerts-and-reporting)

## Problem

- **Dashboard and reports disagree.** The dashboard counts occupancy from
  `units.status`, while the occupancy report counts leases. On sample data the
  dashboard shows 80% and the report shows 40%. `units.status` is also editable
  by hand, and the seed data doesn't match any lease.
- **The overdue-rent date differs.** The delinquency report uses the server's
  UTC date (`date('now')`), but the dashboard uses the operator's local date.
  Around midnight their overdue totals can differ.
- **Alerts go to lists, not records.** Every dashboard alert links to a list
  page (`/rent`, `/leases`, `/maintenance`, `/applications`), so the operator
  has to find the item again. Leases, work orders, rent charges, and
  applications have no URL of their own; they open in dialogs.
- **Some alerts are missing.** The dashboard shows totals for overdue rent but
  doesn't list the charges, has no list of vacant units, and doesn't show
  maintenance scheduled in the next few days. Upcoming and overdue items are
  separated for leases but not for rent or maintenance.
- **Report filters are uneven.** Income, P&L, maintenance, and budget can be
  filtered by property. Rent roll, delinquency, and occupancy can't.
- **Some amounts lose cents.** The income and maintenance cards round to whole
  dollars, so $0.29 shows as "$0".

## Proposed outcome

1. **One occupancy rule.** A unit is occupied in a month when a lease that
   isn't cancelled covers any part of that month. The occupancy report and the
   dashboard both use this rule, and the dashboard shows the current month, so
   their figures match. `units.status` stays for turnover and unavailable,
   but no longer drives the occupancy figures. *(Decided 2026-10-30.)*
2. **A "Needs attention" area on the dashboard** with overdue and upcoming
   items shown separately:
   - rent: overdue charges and unpaid charges due soon
   - leases: expired but still active, and ending within the renewal window
     (this exists already)
   - vacant units with no current lease, and how long they've been empty
   - maintenance: overdue and scheduled soon
   - applications with a follow-up due (this exists already)

   Each item says why it's listed. *(Placement decided 2026-10-30.)*
3. **Links open the record.** Each alert links to `/<page>?id=N` (or similar),
   which opens that record's dialog on its list page. This follows the
   `/reports?tab=…` deep-link pattern already in use, with no new pages.
   *(Decided 2026-10-30.)*
4. **Report filters.** Add a property filter to rent roll, delinquency, and
   occupancy. Delinquency uses the operator's local date, as the dashboard
   does.
5. **Exact amounts.** The income and maintenance cards show cents.

## Affected users and systems

- Operators using the dashboard and reports day to day. The app is still
  single-user with no auth.
- Server: the Dashboard and Reports sections of `src/server/index.ts`
  (occupancy, delinquency, and a shared occupancy query). No schema change is
  expected.
- Client: `dashboard-page.tsx`, the rent roll, delinquency, and occupancy
  report tabs, `use-app-state.ts`, and the list pages that need to open a
  record from `?id=` (leases, rent, maintenance, applications).

## Constraints and non-goals

- No notifications (email, SMS, or push). Sending is out of scope for the
  template (README). Alerts appear in the app only.
- No configurable alert rules. Rules come from existing data and settings
  (for example `renewal_notice_days`). Any new window is a fixed default.
- No new tables or migrations unless the spec finds one unavoidable.
- No new detail pages or route types. Deep links are query parameters on the
  existing list routes.
- Keep the dashboard's single summary request. Add to `/api/dashboard/summary`
  rather than having the client make one call per alert.
- Follow existing patterns: Zod and `intParam` validation, the operator's
  local `today` passed as a query parameter (PR #7), `periodRange`'s 36-month
  cap, and `downloadCsv` for exports.

## Acceptance criteria

- [ ] Each alert gives a clear reason and opens the record it refers to.
- [ ] Upcoming items are visibly separate from overdue ones.
- [ ] The dashboard's occupied count and rate match the occupancy report for
      the current month (vacant units are a "now" list; see spec D5), and its
      overdue-rent total matches the delinquency report, on the same data and
      date.
- [ ] Rent roll, delinquency, and occupancy can be filtered by property, and
      their CSV exports follow the filter.
- [ ] The income and maintenance cards show exact amounts.
- [ ] Existing dashboard, rent, lease, maintenance, application, and report
      flows still work. `pnpm typecheck` and `pnpm build` pass.

## Open questions

Defaults the spec will use unless Josh says otherwise:

- **"Due soon" windows:** rent due within 7 days, and maintenance scheduled
  within 7 days (matching the maintenance page's "due in 7 days" filter).
  Leases keep the renewal window from Settings.
- **Vacant unit:** no lease covering today and status not `unavailable`.
  Units in `turnover` count as vacant and show their status. Days vacant are
  counted from the end of the last lease, or "never leased".
- **Stored `units.status`:** keep syncing it from leases as now, without
  changing existing rows. Should the spec also add a one-time correction of
  stale `occupied` and `vacant` values, or leave them alone?
- **Partly-paid and future charges:** rent alerts count any charge with a
  balance. Waived charges are excluded, as today.
