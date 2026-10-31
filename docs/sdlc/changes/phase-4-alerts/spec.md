# Spec: Phase 4 — Alerts and reporting

Intent: [`intent.md`](./intent.md)
Status: Approved 2026-10-30 (including D2 and D5)

## Requirements

### A. One occupancy rule (D1, D2)

- A unit is **occupied in a month** when a lease on it that isn't
  `cancelled` covers any day of that month: `start_date <=` the month's last
  day, and the lease's effective end `>=` the month's first day.
- **Effective end (D2):** for an `active` lease whose `end_date` has passed,
  the effective end is the operator's `today`. The tenant is still in place
  (holding over), and the lease already appears under "Expired, still active".
  For every other lease, the effective end is `end_date`.
- One SQL helper in `index.ts` builds this condition. Every occupancy figure
  uses it:
  - the occupancy report, for each month
  - the dashboard's occupied count and rate, for the current month
  - `occupied_count` on `/api/properties` and `/api/properties/:id` (new
    there), for the current month
- The property page's "Occupied" summary card uses the server's
  `occupied_count`, not a count of `units.status`.
- `units.status` is unchanged in storage and in the unit dialog. It keeps
  syncing from leases as it does now (`index.ts` ~line 344). The unit cards
  still show its badge. Its only new job is to exclude `unavailable` units from
  the vacant list (C3).

### B. Report fixes

- **Delinquency** takes `property_id` and `today`, both optional. A charge is
  overdue when `due_date < today`, its balance is above zero, and it isn't
  waived. That is the same condition the dashboard uses, now with the same
  date. `days_overdue` is counted from `today`. Without `today`, it falls back
  to the UTC date as it does now.
- **Occupancy** takes `property_id`, which filters both the total unit count
  and the occupied count, and `today`, for D2.
- **Rent roll** gets a property selector. It already loads every lease and
  groups by property in the client, so the filter is client-side. The CSV
  exports only the filtered rows.
- Delinquency and occupancy each get a property selector. Their CSVs follow
  the filter.
- **Exact amounts:** the income and maintenance tabs show cents in every row
  and total (`formatMoney(..., true)`). Dashboard money in the new attention
  lists shows cents too. The headline KPI tiles stay whole dollars.

### C. Dashboard "Needs attention" (D3)

The summary endpoint returns each list below with up to 6 items, plus the full
count. Rent lists also return the full total. Each item carries its link
target and the reason it's listed.

| Area | Overdue | Upcoming |
|---|---|---|
| Rent | Charges due before `today` with a balance, not waived. Oldest first. Reason: "N days overdue". | Charges due from `today` to `today + 7` with a balance. Soonest first. Reason: "Due in N days" or "Due today". |
| Leases (exists) | Active leases past `end_date`. | Active leases ending inside the renewal window. |
| Maintenance | Open work orders scheduled before `today`. | Open work orders scheduled from `today` to `today + 7`. |
| Applications (exists) | Follow-up date on or before `today` (new or screening). | — |
| Vacant units | Units not occupied today (A, evaluated for the single day `today`) and not `unavailable`. Reason: "Vacant N days" counted from the latest effective end of a past lease, or "Never leased". `turnover` units show that status. | — |

- The existing "Open work orders" card is replaced by the maintenance row
  above. Open, but neither overdue nor scheduled soon, stays visible as a
  count on the KPI tile.
- "View all" on each card goes to the list page as it does now.

### D. Links open the record (D4)

| Alert | Link | On arrival |
|---|---|---|
| Rent charge | `/rent?period=YYYY-MM&charge=ID` | Rent page opens on that period and opens the payment dialog for the charge |
| Lease | `/leases?id=ID` | Opens the lease dialog |
| Work order | `/maintenance?id=ID` | Opens the work-order dialog |
| Application | `/applications?id=ID` | Opens the application dialog |
| Vacant unit | `/properties/PID?unit=ID` | Opens the unit dialog on the property page |

- A page reads its parameter once, after its first load, then removes the
  parameter with `history.replaceState`. Closing the dialog or reloading the
  page doesn't reopen it.
- The record is opened whatever the page's filter is. The list's filter state
  doesn't change.
- If the ID isn't in the loaded list (deleted since the dashboard loaded), the
  page shows its existing error banner: "That <record> no longer exists." No
  dialog opens.
- One small helper in `lib/utils.ts` reads an integer query parameter and
  removes it. The four list pages and the property page use it.

## User experience

- **Dashboard:** KPI tiles at the top keep their place. Occupancy now uses
  rule A. Below them, a "Needs attention" area holds a card per area. Each
  card has an "Overdue" group in rose and an "Upcoming" group in amber, and
  either group is hidden when empty. A card with nothing in either group shows
  the existing "All caught up" empty state. Each row shows the record (tenant,
  unit, property, or title), the reason, and an amount where there is one, and
  the whole row is the link.
- The Portfolio card's rows are relabeled "Occupied this month" (rule A) and
  "Vacant now" (the C vacant list count). The two can differ by design: a unit
  whose lease ended on the 10th is occupied this month but vacant now. A
  tooltip on each row says which rule it uses.
- Rows are buttons or links that can be reached and activated with the
  keyboard. Overdue and upcoming are told apart by group heading text, not
  color alone.
- **Reports:** the property selector uses the same "All properties" select as
  the income and P&L tabs, placed in the same spot.

## Data and API changes

- **No schema change and no migration.**
- `GET /api/dashboard/summary?today=`:
  - `occupied` and `occupancy_rate` now follow rule A for the current month.
  - `vacant` becomes the vacant-now count.
  - New fields: `overdue_charges[]`, `due_soon_charges[]` and
    `due_soon_count/total`, `overdue_work_orders_list[]`,
    `scheduled_work_orders[]` and `scheduled_count`, `vacant_units[]`.
  - Existing fields keep their names. `recent_work_orders` is removed once the
    client stops using it.
- `GET /api/reports/delinquency?property_id=&today=`: both new and optional.
- `GET /api/reports/occupancy?from=&to=&property_id=&today=`: `property_id`
  and `today` are new and optional.
- `GET /api/properties`: `occupied_count` now follows rule A for the current
  month. It accepts `today`.
- `GET /api/properties/:id`: gains `unit_count` and `occupied_count` (rule A)
  so the property page doesn't count `units.status`. It accepts `today`.
- Client: `DashboardSummary` type additions, plus `use-app-state` fetchers
  passing `property_id` and `today`.

## Risks and safeguards

- **Figures change on upgrade.** Dashboard and property occupancy will drop
  wherever `units.status` says occupied without a matching lease (on the seed
  data, 80% → 40%). This is the intended fix. Release notes and the README
  should say occupancy now comes from leases.
- **Ended-early leases:** a lease marked `ended` keeps its recorded
  `end_date`. If the operator ended it early without changing the date, the
  unit counts as occupied until that date. This is accepted; the lease dialog
  is where to correct the date.
- **Query cost:** vacant-now and the property counts add correlated
  subqueries. Portfolios are small, D1 handles this, and the occupancy report
  already does one query per month.
- **Silent dashboard errors:** the summary endpoint wraps each query in
  `safeGet` and `safeQuery`, which turn errors into zeros. New queries follow
  the same pattern for consistency. Hiding errors is a separate cleanup and is
  not changed here.
- **Deep links are untrusted input:** IDs are parsed with the integer helper
  and looked up in data already loaded, so no new request is built from them.

## Out of scope

- Email, SMS, or push notifications, plus snoozing or dismissing alerts.
- Configurable alert windows. 7 days is fixed (D3).
- New detail pages or route types.
- Correcting stored `units.status` values.
- Making the maintenance and rent pages honor filter parameters such as
  `?schedule=overdue` for "View all".
- Changing the dashboard's error handling (`safeGet`).

## Open questions

None. Decisions:

- **D1 — Leases decide occupancy.** Rule A everywhere a count of occupied units
  appears. (Josh, 2026-10-30.)
- **D2 — Holdover counts as occupied.** An active lease past its end date
  covers through `today`. Without this, units with an expired-but-active lease
  would count as vacant while the tenant is still there.
- **D3 — Alerts on the dashboard with fixed windows.** 7 days for rent and
  maintenance, and the Settings renewal window for leases. (Josh, 2026-10-30.)
- **D4 — Query-parameter deep links** open existing dialogs. (Josh,
  2026-10-30.)
- **D5 — "Occupied this month" vs "Vacant now."** The rate matches the
  occupancy report, while the vacant list is about today. Both are labeled.
  This refines the intent criterion "occupancy and vacancy figures match the
  report": the occupied count and rate match the report, and the vacant count
  matches the vacant list.

## Acceptance criteria

- [ ] On a seeded test database, the dashboard's occupied count and rate equal
      the occupancy report's current month, for all properties and for each
      property. The properties list and property page show the same counts.
      Checked by hand in the browser and with curl.
- [ ] The dashboard's overdue rent total and count equal the delinquency
      report's totals for the same `today`.
- [ ] A holdover lease (active, past end date) counts as occupied and its unit
      isn't listed as vacant.
- [ ] Every attention row opens the right dialog, through each of the five
      link types. Closing the dialog or reloading doesn't reopen it. A deleted
      ID shows the "no longer exists" message.
- [ ] Overdue and upcoming groups are separate and labeled. Empty cards show
      "All caught up".
- [ ] Rent roll, delinquency, and occupancy filter by property, and their CSVs
      match the filtered screen.
- [ ] The income and maintenance tabs show cents. A $0.29 amount shows as
      "$0.29".
- [ ] Regression: rent payments, the lease, work-order, and application
      dialogs from their list pages, and the other report tabs. `pnpm
      typecheck` and `pnpm build` pass.

## Approval

- Product / requester: Josh — approved 2026-10-30
- Technical review, if needed: independent review against `REVIEW.md` after
  the build
