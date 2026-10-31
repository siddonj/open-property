# Plan: Phase 4 — Alerts and reporting

Intent: [`intent.md`](./intent.md)
Spec: [`spec.md`](./spec.md)
Status: Approved 2026-10-30

Delivered as three slices, in order. Each slice ends with typecheck, build,
curl, and browser checks before the next starts. No schema change.

## Files and systems that change

- `src/server/index.ts`:
  - Two small helpers near `periodRange`:
    - `requestToday(c)`: the `today` query parameter when it matches
      `DATE_RE`, otherwise the UTC date. This is the dashboard's existing
      logic, pulled out so the dashboard, properties, and reports share it.
    - `leaseCoversSql(alias)`: the rule A condition, as SQL plus the order
      of its parameters (`from`, `to`, `today`). A holdover lease (D2)
      reduces to
      `start_date <= to AND (end_date >= from OR (status = 'active' AND today >= from))`.
      This needs no `CASE` expression: a lease whose end date is past and
      before `from` only counts if it is still active.
  - Properties: `occupied_count` on `GET /api/properties` and the new
    `unit_count` and `occupied_count` on `GET /api/properties/:id` use the
    helper for the current month.
  - Dashboard:
    - The occupied count and rate use the helper.
    - `vacant` becomes the vacant-now count.
    - New lists: overdue and due-soon charges, overdue and scheduled work
      orders, and vacant units, each limited to 6 rows with a separate count
      and, for rent, a total.
    - `recent_work_orders` is removed.
  - Reports:
    - Delinquency takes `property_id` and `today`; `days_overdue` and the
      overdue cutoff use `today`.
    - Occupancy takes `property_id` (which filters both the total and the
      occupied count) and `today`, and uses the helper.
- `src/client/types.ts`: `DashboardSummary` additions and removal, plus
  `unit_count` and `occupied_count` on the property detail type.
- `src/client/hooks/use-app-state.ts`:
  - The delinquency, occupancy, and property fetchers pass `today` and
    `property_id`.
  - The dashboard already passes `today`.
- `src/client/lib/utils.ts`: `takeIdParam(name)`. It reads an integer query
  parameter with `intParam`-style validation, removes it with
  `history.replaceState`, and returns the number or `null`.
- `src/client/components/dashboard/dashboard-page.tsx`:
  - The Portfolio rows are relabeled, with tooltips.
  - The "Needs attention" cards replace "Open work orders".
  - Rows link to the five deep-link forms.
- `src/client/components/properties/property-page.tsx`: the Occupied card
  uses the server count, and `?unit=` opens the unit dialog.
- `src/client/components/{leases,maintenance,applications,rent}/*-page.tsx`:
  read `?id=` (or `?charge=` and `?period=` on rent) once after the first
  load, then open the dialog or show "That <record> no longer exists."
- `src/client/components/reports/`:
  - `rent-roll-tab.tsx`: a client-side property select, and the CSV uses the
    filtered rows.
  - `delinquency-tab.tsx` and `occupancy-tab.tsx`: a property select passed
    to the server.
  - `income-tab.tsx` and `maintenance-tab.tsx`: `formatMoney(..., true)`.
- `README.md`: the dashboard feature list and a note that occupancy now comes
  from leases. `CLAUDE.md`: one line on `leaseCoversSql` as the single
  occupancy rule.

## Order of work

**Slice A: one occupancy rule and report fixes** (spec A and B)

1. Server: add `requestToday` and `leaseCoversSql`. Switch the occupancy
   report, the dashboard occupied count and rate, and both properties
   endpoints to the helper. Add `property_id` and `today` to occupancy and
   delinquency.
2. Client:
   - Use the property page's server count.
   - Relabel the Portfolio rows; "Vacant now" still uses the old count until
     slice B.
   - Pass `today` and `property_id` from the fetchers.
   - Add property selects and filtered CSVs on rent roll, delinquency, and
     occupancy.
   - Show cents on the income and maintenance tabs.

**Slice B: "Needs attention"** (spec C)

3. Server: add the new dashboard lists and counts and the vacant-now count
   and list (`NOT EXISTS` covering lease for `today` to `today`, status not
   `unavailable`, days since the latest past `end_date`). Remove
   `recent_work_orders`.
4. Client:
   - The attention cards, with Overdue and Upcoming groups.
   - "All caught up" when a card is empty.
   - Rows link to the deep-link targets. These open the list page only
     until slice C.

**Slice C: deep links** (spec D)

5. Add `takeIdParam`. Wire the leases, maintenance, and applications pages
   (`?id=`), the rent page (`?period=` sets the period before loading,
   `?charge=` opens payment), and the property page (`?unit=`).
6. Wrap up: README and CLAUDE.md, an independent review against
   `REVIEW.md`, and fixes for any findings.

## Risks and alternatives

- **Holdover SQL.** The simplified condition above is equivalent to the
  spec's effective-end rule only if `today` is passed the same way
  everywhere. `requestToday` is the single source. I will check it with a
  seeded holdover lease in each endpoint.
- **Rent page `?period=`.** The rent page loads charges for its `period`
  state. Setting the period from the URL before the first load avoids
  loading the wrong month and then reloading.
- **Hand-edited `units.status`.** The vacant list still uses it to exclude
  `unavailable`. A unit set to `occupied` by hand with no lease shows as
  vacant. That is the intended behavior (D1).
- **Not changed.** The rent ledger's own overdue status
  (`index.ts` ~635 and ~686) still uses `date('now')`. It isn't a report or
  dashboard figure, and the spec doesn't cover it; it is a candidate for a
  later pass.
- **Alternative considered:** a SQL view for occupancy. D1 views would work,
  but a view can't take `today` as a parameter, so a TypeScript helper is
  simpler.

## Proof

Checks run in a throwaway worktree with its own D1 state (Wrangler on 8812,
Vite on 5199), seeded with:

- a holdover lease (active, end date last month)
- a lease that ended on the 10th of this month
- a hand-set `occupied` unit with no lease
- an `unavailable` unit
- overdue, due-in-3-days, and partly paid charges, plus a waived charge
- a $0.29 bill line
- work orders that are overdue, due in 5 days, and unscheduled

Checks:

- [x] curl:
  - Dashboard occupied count and rate equal the occupancy report's current
    month, for all properties and for each property.
  - `/api/properties` and `/api/properties/:id` give the same counts.
- [x] curl: the dashboard overdue count and total equal the delinquency
      report's, for the same `today` and an evening `today` one day past the
      UTC date.
- [x] The holdover unit counts as occupied and isn't in the vacant list. The
      unit whose lease ended on the 10th is occupied this month and vacant
      now. The `unavailable` unit is excluded.
- [x] Browser: each of the five link types opens the right dialog. Closing
      the dialog or reloading doesn't reopen it. A deleted ID shows the
      message.
- [x] Browser: Overdue and Upcoming groups are labeled, and an empty card
      shows "All caught up".
- [x] Browser: rent roll, delinquency, and occupancy filter by property, and
      each CSV matches the screen.
- [x] Browser: income and maintenance show "$0.29".
- [x] Regression:
  - Rent payment from the rent page.
  - The lease, work-order, and application dialogs from their lists.
  - The P&L, budget, and income tabs.
- [x] `pnpm typecheck`
- [x] `pnpm build`

Results, 2026-10-30 (scratch copy, `today=2026-10-30` while the UTC date was 10-31):

- October occupancy is 2 of 5 (40%) on the dashboard, the report, and both properties
  endpoints. Per property: 1/1, 0/1, and 1/3. November is 1 of 5: the holdover drops out
  and the upcoming lease counts.
- Overdue is 2 charges, $2,499.71, on both the dashboard and delinquency. With
  `today=2026-10-31` both show 3 charges and $3,699.71, and the charge due 10-30 moves to
  overdue.
- Vacant now is 3: the unit whose lease ended on the 10th, shown as "Vacant 20 days", plus
  two "Never leased" units. The `unavailable` unit and the holdover unit are excluded.
- Independent review (Opus) found 0 critical and 0 high issues. Its three findings are fixed:
  1. Attention rows have a visible focus ring.
  2. The report tabs ignore stale responses.
  3. The Portfolio hints are visible text rather than hover-only.

## Deviations

- The vacant-now count moved from slice B to slice A, so the relabeled "Vacant now"
  row was never showing the old `units.status` count.
- The dashboard also returns `expired_leases_count` and `upcoming_expirations_count`, so the
  lease card's group counts are complete and not capped at 6 rows (spec C asks for full counts).
- The attention card is its own component, `dashboard/attention-card.tsx`, to keep
  `dashboard-page.tsx` under 400 lines.
- The rent page reads `?period=` in its `useState` initializer (read only) and strips it in the
  load effect, so React StrictMode's double render can't drop the period.

## Follow-up fixes (2026-10-31)

Found during Phase 4 and fixed after merge:

- The rent ledger's own overdue status (`/api/rent-charges/generate` and
  `recomputeCharge` after a payment) now uses `requestToday` instead of UTC
  `date('now')`. The client sends `?today=` on those calls.
- The "Ending in 30 days" count on the Active leases card no longer counts
  holdover leases (`end_date >= today`).
- `requestToday` rejects impossible dates like 2026-02-31 (`isCalendarDate`) and
  falls back to the UTC date. `DATE_RE` is removed.

Checked in the scratch copy:

- Charge due 10-30: stays `open` with `today=2026-10-30` and turns `overdue` with
  `today=2026-10-31`. This holds for both generate and payment.
- Move-out count: 0 with only a holdover lease, 1 once a lease ends on 11-15.
- `today=2026-02-31` falls back to the UTC date.
