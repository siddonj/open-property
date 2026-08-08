# Reports extensions: delinquency aging, CSV export, occupancy trend

**Status**: Design — not yet implemented
**Source**: Items #1, #2, #8 in the "Suggested build order" of
`docs/roadmap/2026-08-08-competitive-gap-analysis.md`

## Context

The Reports tab (`src/client/components/reports/`, shipped this session) has
three tabs: Rent roll, Income, Maintenance. Entrata/AppFolio/Yardi all treat
delinquency aging as a core report, and CSV export is expected on every list
and report view. Occupancy is currently only a point-in-time snapshot on the
Dashboard (`occupied`/`vacant`/`occupancy_rate` in `GET /api/dashboard/summary`,
`src/server/index.ts:740`) — there's no way to see how it changed over time.

All three are pure read/aggregation features over existing data. No schema
changes required for any of them.

## 1. Delinquency aging report

**New tab** in `ReportsPage` (`src/client/components/reports/reports-page.tsx`):
`Delinquency`, alongside Rent roll / Income / Maintenance.

**Server**: `GET /api/reports/delinquency` — no query params needed (it's a
point-in-time report, not a period range, matching how AppFolio/Yardi present
it). Bucket every unpaid/partial `rent_charges` row by days overdue, computed
from `due_date` to today:

```sql
SELECT
  rc.id, rc.lease_id, rc.due_date, rc.amount, rc.amount_paid,
  (rc.amount - rc.amount_paid) as balance,
  CAST(julianday('now') - julianday(rc.due_date) AS INTEGER) as days_overdue,
  l.unit_id, u.name as unit_name, p.id as property_id, p.name as property_name,
  t.first_name as tenant_first_name, t.last_name as tenant_last_name
FROM rent_charges rc
JOIN leases l ON l.id = rc.lease_id
LEFT JOIN units u ON u.id = l.unit_id
LEFT JOIN properties p ON p.id = u.property_id
LEFT JOIN tenants t ON t.id = l.primary_tenant_id
WHERE rc.status != 'waived' AND rc.amount_paid < rc.amount AND rc.due_date < date('now')
ORDER BY days_overdue DESC
```

This follows the existing `WO_SELECT`/`LEASE_SELECT` pattern (a shared SELECT
constant with LEFT JOINs) already used elsewhere in `src/server/index.ts` —
name it `DELINQUENCY_SELECT` if reused, but since this is a single endpoint
with no `/:id` variant, inlining is fine.

Response shape:
```ts
interface DelinquencyRow {
  id: number; lease_id: number; due_date: string;
  amount: number; amount_paid: number; balance: number; days_overdue: number;
  unit_id: number | null; unit_name: string | null;
  property_id: number | null; property_name: string | null;
  tenant_first_name: string | null; tenant_last_name: string | null;
}
```
`GET /api/reports/delinquency` returns `{ rows: DelinquencyRow[] }`.

**Client**: `getDelinquencyReport()` added to `use-app-state.ts` (no params,
following the pattern of `getIncomeReport`/`getMaintenanceReport`). New
`DelinquencyTab` component buckets `rows` client-side into four groups —
0–30, 31–60, 61–90, 90+ days — using the existing `daysBetween`-style logic
already in `src/client/lib/utils.ts` (bucket boundaries computed once with
`useMemo`, same shape as `RentRollTab`'s property grouping). Each bucket
renders as its own `Card` + `Table`, same visual pattern as `RentRollTab`,
with a bucket subtotal and a grand total row (matching `IncomeTab`'s totals
row). Type goes in `src/client/types.ts` as `DelinquencyRow`.

## 2. CSV export

**Client-only** — no new server endpoint. A `downloadCsv(filename, rows,
columns)` utility in `src/client/lib/utils.ts` (alongside `formatMoney`,
`formatDate`, etc.):

```ts
export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: { key: keyof T; label: string }[],
): void {
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Add an "Export CSV" `Button` (existing `src/client/components/ui/button.tsx`)
to each Reports tab's header row, next to existing controls (e.g. next to the
Maintenance tab's property/vendor `Select` filters). Each tab defines its own
`columns` array matching what's rendered in its `Table`. This is deliberately
NOT a generic "export everything" mechanism — each tab wires its own call so
column labels and formatting (money, dates) stay correct per-report.

Do not extend this to non-Reports list pages (Tenants, Properties, etc.) in
this pass — scope is Reports only, per the roadmap item. Extending it
elsewhere is a separate, later decision.

## 3. Occupancy trend report

**New tab**: `Occupancy`, in `ReportsPage`.

**Problem**: there's no historical occupancy data — `units.status` is
current-state-only, with no history table. Two ways to get a trend:

- **(a) Retroactive derivation from lease date ranges** — for each past
  month, compute occupancy as `units where a lease with start_date <= month
  AND end_date >= month AND status IN ('active','ended') existed`. This
  requires no new storage and works immediately for all historical data,
  but is an approximation (a unit occupied without ever having a lease
  record, e.g. mid-migration data, won't show correctly — acceptable given
  this app's schema always creates a lease to mark occupancy).
- **(b) A monthly snapshot table**, populated by a cron/scheduled job or
  computed lazily on first request per month. More "correct" but adds a new
  table and a background-job dependency this app doesn't have anywhere else
  (no cron/scheduled task infrastructure exists in `wrangler.toml` today).

**Recommendation: (a)**, retroactive derivation — no schema change, no new
infrastructure, consistent with how Income/Maintenance reports already work
(pure aggregation over existing tables).

**Server**: `GET /api/reports/occupancy?from=YYYY-MM&to=YYYY-MM`, reusing the
existing `periodRange()` helper (`src/server/index.ts:866`) for parameter
validation/defaulting (same as Income/Maintenance). For each month in range,
compute:

```sql
SELECT COUNT(DISTINCT u.id) as occupied_units
FROM units u
JOIN leases l ON l.unit_id = u.id
WHERE l.status IN ('active', 'ended')
  AND l.start_date <= date(:month || '-28')  -- last representative day of month
  AND l.end_date >= date(:month || '-01')
```
executed once per month in the range (12 iterations max, matching the
existing `from`/`to` default window), plus a fixed total-unit count
(`SELECT COUNT(*) FROM units`) to compute the rate. Response:
```ts
interface OccupancyReportMonth { period: string; occupied_units: number; total_units: number; occupancy_rate: number; }
```
`GET /api/reports/occupancy` returns `{ from, to, months: OccupancyReportMonth[] }`
— same envelope shape as `IncomeReport`/`MaintenanceReport` in
`src/client/types.ts`.

**Client**: `getOccupancyReport()` in `use-app-state.ts`, `OccupancyTab`
component following `IncomeTab`'s exact structure (Table with Month/Occupied/
Total/Rate columns, totals row optional since rate isn't summable — show
average instead).

## Testing

No test suite exists in this repo (confirmed in `CLAUDE.md`). Manual
verification for each: `npx tsc --noEmit`, `npx vite build`, then smoke-test
each new endpoint with `curl` against the running dev server (same approach
used to verify Income/Maintenance reports this session) — create enough
lease/charge/work-order data via the API to produce non-empty results, check
each bucket/month total sums correctly by hand against the raw data.
