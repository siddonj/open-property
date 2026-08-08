# Reports Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three extensions to the existing Reports tab — a Delinquency
aging report, CSV export on every report tab, and an Occupancy trend
report — matching capability gaps identified against Entrata/AppFolio/Yardi.

**Architecture:** Two new read-only Hono GET endpoints
(`/api/reports/delinquency`, `/api/reports/occupancy`) following the exact
pattern of the existing `/api/reports/income` and `/api/reports/maintenance`
endpoints (`src/server/index.ts`). Two new React tab components plus one new
CSV utility function, wired into the existing `ReportsPage` tab shell
(`src/client/components/reports/reports-page.tsx`). No schema changes, no
new dependencies.

**Tech Stack:** Hono (server routes), Zod (not needed here — GET-only, no
body validation), React 19 + TypeScript (client), Tailwind (styling via
existing `Card`/`Table`/`Button` components), Cloudflare D1 (SQLite) via the
`query`/`get`/`run` helpers from `@clawnify/db`.

## Global Constraints

- No test framework exists in this repo — verification is `npx tsc --noEmit`,
  `npx vite build`, and manual `curl`/browser checks against the running dev
  server (`pnpm dev`, Vite on :5173 proxying `/api/*` to Wrangler on :8787).
- Follow the exact code style already in the touched files: no comments
  explaining *what* code does, tight TypeScript, Tailwind utility classes
  matching neighboring components exactly (e.g. `text-emerald-700` for
  "good," `text-amber-700` for "warning," `text-rose-700` for "bad" — this
  convention is already established in `income-tab.tsx` and `rent-page.tsx`).
- Every new report endpoint returns JSON via `c.json(...)`; every error
  path returns `c.json({ error: "..." }, 400)` — never throw uncaught.
- The `periodRange()` helper (`src/server/index.ts:866-872`) and
  `PERIOD_RE`/`addMonthsSql` (lines 864, 874-878) already exist — reuse them
  for the Occupancy endpoint; do not duplicate.

---

### Task 1: Delinquency aging report — server endpoint

**Files:**
- Modify: `src/server/index.ts` (add new route in the `// ── Reports
  ──` section, after the existing `/api/reports/maintenance` handler, which
  ends at line 916 with `return c.json({ from: range.from, to: range.to,
  months: rows });` followed by `});`)

**Interfaces:**
- Consumes: nothing new — uses `query()` from `./db` (already imported at
  line 3: `import { initDB, query, get, run } from "./db";`)
- Produces: `GET /api/reports/delinquency` → `{ rows: DelinquencyRow[] }`
  where each row has shape `{ id, lease_id, due_date, amount, amount_paid,
  balance, days_overdue, unit_id, unit_name, property_id, property_name,
  tenant_first_name, tenant_last_name }`. Task 3 (client) consumes this
  exact shape.

- [ ] **Step 1: Add the route**

Insert immediately after the `/api/reports/maintenance` handler (after line
916's closing `});`), before the `// ── Health ──` section:

```ts
app.get("/api/reports/delinquency", async (c) => {
  const rows = await query(
    `SELECT
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
     ORDER BY days_overdue DESC`,
  );
  return c.json({ rows });
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this is a pure addition using existing imports).

- [ ] **Step 3: Manual verification against the running dev server**

Prerequisite: dev server running (`pnpm dev` in a separate terminal, or
confirm it's already running — Vite on :5173, Wrangler API on :8787).

Create test data if none exists (an overdue charge):
```bash
curl -s -X POST "http://localhost:8787/api/rent-charges/generate" \
  -H "Content-Type: application/json" -d '{"period":"2026-06"}'
```
(Requires at least one active lease to exist — if `{"created":0,...}` comes
back, first create a tenant, unit-attached lease, per the pattern used to
verify the original Income/Maintenance reports this session.)

Then:
```bash
curl -s "http://localhost:8787/api/reports/delinquency" | python3 -m json.tool
```
Expected: `{"rows": [...]}` with at least one row where `due_date` is in the
past, `days_overdue` is a positive integer, and `balance` equals `amount -
amount_paid`.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: add delinquency aging report endpoint"
```

---

### Task 2: Occupancy trend report — server endpoint

**Files:**
- Modify: `src/server/index.ts` (add new route, same section as Task 1 —
  add after the delinquency route added in Task 1)

**Interfaces:**
- Consumes: `periodRange(c)` (existing helper, `src/server/index.ts:866`,
  returns `{ from: string; to: string } | null`, both `'YYYY-MM'`), `query()`
  and `get()` from `./db`
- Produces: `GET /api/reports/occupancy?from=YYYY-MM&to=YYYY-MM` →
  `{ from: string; to: string; months: OccupancyReportMonth[] }` where each
  month has shape `{ period, occupied_units, total_units, occupancy_rate }`.
  Task 4 (client) consumes this exact shape.

- [ ] **Step 1: Add the route**

Insert after the delinquency route from Task 1:

```ts
app.get("/api/reports/occupancy", async (c) => {
  const range = periodRange(c);
  if (!range) return c.json({ error: "from/to must be 'YYYY-MM'" }, 400);
  const totalRow = await get<{ n: number }>("SELECT COUNT(*) as n FROM units");
  const totalUnits = totalRow?.n ?? 0;
  const months: { period: string; occupied_units: number; total_units: number; occupancy_rate: number }[] = [];
  let period = range.from;
  while (period <= range.to) {
    const row = await get<{ n: number }>(
      `SELECT COUNT(DISTINCT u.id) as n
       FROM units u
       JOIN leases l ON l.unit_id = u.id
       WHERE l.status IN ('active', 'ended')
         AND l.start_date <= date(? || '-28')
         AND l.end_date >= date(? || '-01')`,
      [period, period],
    );
    const occupied = row?.n ?? 0;
    months.push({
      period,
      occupied_units: occupied,
      total_units: totalUnits,
      occupancy_rate: totalUnits ? Math.round((occupied / totalUnits) * 100) : 0,
    });
    period = addMonthsSql(period, 1);
  }
  return c.json({ from: range.from, to: range.to, months });
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

```bash
curl -s "http://localhost:8787/api/reports/occupancy" | python3 -m json.tool
```
Expected: `{"from": "...", "to": "...", "months": [...]}` with exactly 12
entries (default range), each with `occupancy_rate` between 0 and 100.
Cross-check one month by hand: pick the current month's entry, confirm
`occupied_units` matches `SELECT COUNT(*) FROM units WHERE status =
'occupied'` from `GET /api/units` for units with an active lease overlapping
that month.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: add occupancy trend report endpoint"
```

---

### Task 3: Delinquency aging report — client

**Files:**
- Modify: `src/client/types.ts` (add `DelinquencyRow` interface, placed
  alongside the existing `IncomeReportMonth`/`MaintenanceReportMonth`
  interfaces)
- Modify: `src/client/hooks/use-app-state.ts` (add `getDelinquencyReport`,
  following the `getIncomeReport`/`getMaintenanceReport` pattern at lines
  257-273; add to the return object's `// reports` section, line 297)
- Create: `src/client/components/reports/delinquency-tab.tsx`
- Modify: `src/client/components/reports/reports-page.tsx` (add
  `Delinquency` tab)

**Interfaces:**
- Consumes: `GET /api/reports/delinquency` from Task 1, exact shape
  `{ rows: DelinquencyRow[] }`; `useApp()` from `@/context`; `formatMoney`,
  `formatDate` from `@/lib/utils`; `Card`, `Table`/`TableBody`/`TableCell`/
  `TableHead`/`TableHeader`/`TableRow` from their respective `@/components/ui/*`
  files (all pre-existing, used identically in `rent-roll-tab.tsx`)
- Produces: `DelinquencyTab` component, imported and rendered by
  `ReportsPage` (Task 3's own reports-page.tsx edit) and by Task 5 (CSV
  export button added to this same file)

- [ ] **Step 1: Add the `DelinquencyRow` type**

In `src/client/types.ts`, immediately after the existing
`MaintenanceReportMonth` interface (in the same block that defines
`IncomeReportMonth`/`IncomeReport`/`MaintenanceReport`), add:

```ts
export interface DelinquencyRow {
  id: number;
  lease_id: number;
  due_date: string;
  amount: number;
  amount_paid: number;
  balance: number;
  days_overdue: number;
  unit_id: number | null;
  unit_name: string | null;
  property_id: number | null;
  property_name: string | null;
  tenant_first_name: string | null;
  tenant_last_name: string | null;
}
```

- [ ] **Step 2: Add the hook method**

In `src/client/hooks/use-app-state.ts`, import `DelinquencyRow` in the
existing type-only import block (alongside `IncomeReport`, `MaintenanceReport`).
After the `getMaintenanceReport` callback (ends at line 273), add:

```ts
const getDelinquencyReport = useCallback(async (): Promise<{ rows: DelinquencyRow[] }> => {
  return api<{ rows: DelinquencyRow[] }>("GET", "/api/reports/delinquency");
}, []);
```

In the returned object (the `// reports` section, currently
`getIncomeReport, getMaintenanceReport,` at line 297), change to:
```ts
getIncomeReport, getMaintenanceReport, getDelinquencyReport,
```

- [ ] **Step 3: Typecheck (confirms Steps 1-2 compile)**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Create `DelinquencyTab`**

Create `src/client/components/reports/delinquency-tab.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DelinquencyRow } from "@/types";

const BUCKETS = [
  { label: "0–30 days", min: 0, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

export function DelinquencyTab() {
  const app = useApp();
  const [rows, setRows] = useState<DelinquencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const report = await app.getDelinquencyReport();
        setRows(report.rows);
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buckets = useMemo(() => {
    return BUCKETS.map((b) => ({
      ...b,
      rows: rows.filter((r) => r.days_overdue >= b.min && r.days_overdue <= b.max),
    })).filter((b) => b.rows.length > 0);
  }, [rows]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.balance, 0), [rows]);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">No overdue charges.</div>;

  return (
    <div className="space-y-6">
      {buckets.map((b) => (
        <Card key={b.label}>
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-sm font-semibold">{b.label}</h2>
            <span className="text-sm font-semibold tabular-nums text-rose-700">
              {formatMoney(b.rows.reduce((s, r) => s + r.balance, 0), app.settings.currency)}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Property · Unit</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Days overdue</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{[r.tenant_first_name, r.tenant_last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{r.property_name}</span>
                    <span className="px-1 text-muted-foreground/40">·</span>
                    <span className="font-medium">{r.unit_name}</span>
                  </TableCell>
                  <TableCell>{formatDate(r.due_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.days_overdue}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-700">{formatMoney(r.balance, app.settings.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}

      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
        <span className="text-sm font-semibold">Total overdue</span>
        <span className="text-sm font-semibold tabular-nums text-rose-700">{formatMoney(total, app.settings.currency)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire into `ReportsPage`**

In `src/client/components/reports/reports-page.tsx`, add the import:
```ts
import { DelinquencyTab } from "./delinquency-tab";
```
Add a new `TabsTrigger` after the existing `maintenance` one:
```tsx
<TabsTrigger value="delinquency">Delinquency</TabsTrigger>
```
Add a new `TabsContent` after the existing `maintenance` one:
```tsx
<TabsContent value="delinquency" className="mt-4">
  <DelinquencyTab />
</TabsContent>
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build`
Expected: both succeed with no errors.

- [ ] **Step 7: Manual browser verification**

With the dev server running, navigate to `http://localhost:5173/reports`,
click the "Delinquency" tab, confirm it loads the overdue charge created in
Task 1 Step 3, grouped into the correct day bucket.

- [ ] **Step 8: Commit**

```bash
git add src/client/types.ts src/client/hooks/use-app-state.ts \
  src/client/components/reports/delinquency-tab.tsx \
  src/client/components/reports/reports-page.tsx
git commit -m "feat: add delinquency aging report tab"
```

---

### Task 4: Occupancy trend report — client

**Files:**
- Modify: `src/client/types.ts` (add `OccupancyReportMonth` and
  `OccupancyReport` interfaces)
- Modify: `src/client/hooks/use-app-state.ts` (add `getOccupancyReport`)
- Create: `src/client/components/reports/occupancy-tab.tsx`
- Modify: `src/client/components/reports/reports-page.tsx` (add
  `Occupancy` tab)

**Interfaces:**
- Consumes: `GET /api/reports/occupancy` from Task 2, exact shape
  `{ from, to, months: OccupancyReportMonth[] }`
- Produces: `OccupancyTab` component, rendered by `ReportsPage`

- [ ] **Step 1: Add types**

In `src/client/types.ts`, alongside `IncomeReportMonth`/`IncomeReport`, add:

```ts
export interface OccupancyReportMonth {
  period: string;
  occupied_units: number;
  total_units: number;
  occupancy_rate: number;
}

export interface OccupancyReport {
  from: string;
  to: string;
  months: OccupancyReportMonth[];
}
```

- [ ] **Step 2: Add the hook method**

In `src/client/hooks/use-app-state.ts`, import `OccupancyReport` in the
type-only import block. After `getDelinquencyReport` (added in Task 3
Step 2), add:

```ts
const getOccupancyReport = useCallback(async (params?: { from?: string; to?: string }): Promise<OccupancyReport> => {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const path = qs.toString() ? `/api/reports/occupancy?${qs.toString()}` : "/api/reports/occupancy";
  return api<OccupancyReport>("GET", path);
}, []);
```

Update the returned object's reports line to:
```ts
getIncomeReport, getMaintenanceReport, getDelinquencyReport, getOccupancyReport,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Create `OccupancyTab`**

Create `src/client/components/reports/occupancy-tab.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { formatPeriod } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OccupancyReportMonth } from "@/types";

export function OccupancyTab() {
  const app = useApp();
  const [months, setMonths] = useState<OccupancyReportMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const report = await app.getOccupancyReport();
        setMonths(report.months);
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const averageRate = useMemo(() => {
    if (months.length === 0) return 0;
    return Math.round(months.reduce((s, m) => s + m.occupancy_rate, 0) / months.length);
  }, [months]);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (months.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">No unit data.</div>;

  return (
    <Card>
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Last 12 months</h2>
        <p className="text-xs text-muted-foreground">Occupied units and occupancy rate per month</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Occupied</TableHead>
            <TableHead className="text-right">Total units</TableHead>
            <TableHead className="text-right">Occupancy rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((m) => (
            <TableRow key={m.period}>
              <TableCell className="font-medium">{formatPeriod(m.period)}</TableCell>
              <TableCell className="text-right tabular-nums">{m.occupied_units}</TableCell>
              <TableCell className="text-right tabular-nums">{m.total_units}</TableCell>
              <TableCell className="text-right tabular-nums">{m.occupancy_rate}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-end gap-6 border-t bg-muted/40 px-3 py-3 text-sm font-semibold">
        <span>Average</span>
        <span className="tabular-nums">{averageRate}%</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Wire into `ReportsPage`**

Add import: `import { OccupancyTab } from "./occupancy-tab";`
Add `TabsTrigger`: `<TabsTrigger value="occupancy">Occupancy</TabsTrigger>`
Add `TabsContent`:
```tsx
<TabsContent value="occupancy" className="mt-4">
  <OccupancyTab />
</TabsContent>
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build`
Expected: both succeed.

- [ ] **Step 7: Manual browser verification**

Navigate to `http://localhost:5173/reports`, click "Occupancy", confirm 12
months render with a plausible rate (matches the 3 seeded properties/5
seeded units unless test data was added).

- [ ] **Step 8: Commit**

```bash
git add src/client/types.ts src/client/hooks/use-app-state.ts \
  src/client/components/reports/occupancy-tab.tsx \
  src/client/components/reports/reports-page.tsx
git commit -m "feat: add occupancy trend report tab"
```

---

### Task 5: CSV export utility + wiring into all five report tabs

**Files:**
- Modify: `src/client/lib/utils.ts` (add `downloadCsv` function)
- Modify: `src/client/components/reports/rent-roll-tab.tsx` (add export button)
- Modify: `src/client/components/reports/income-tab.tsx` (add export button)
- Modify: `src/client/components/reports/maintenance-tab.tsx` (add export button)
- Modify: `src/client/components/reports/delinquency-tab.tsx` (add export button — created in Task 3)
- Modify: `src/client/components/reports/occupancy-tab.tsx` (add export button — created in Task 4)

**Interfaces:**
- Consumes: nothing new
- Produces: `downloadCsv<T>(filename: string, rows: T[], columns: { key:
  keyof T; label: string }[]): void`, exported from `src/client/lib/utils.ts`,
  used by all five tab components in this task

- [ ] **Step 1: Add `downloadCsv` to `utils.ts`**

In `src/client/lib/utils.ts`, add after the existing `daysBetween` function
(the last function in the file):

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
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Wire into `IncomeTab`**

In `src/client/components/reports/income-tab.tsx`:
- Add imports: `import { Button } from "@/components/ui/button";`,
  `import { Download } from "lucide-react";`, and add `downloadCsv` to the
  existing `@/lib/utils` import (currently `import { formatMoney,
  formatPeriod } from "@/lib/utils";` → becomes `import { downloadCsv,
  formatMoney, formatPeriod } from "@/lib/utils";`)
- Change the header `<div className="border-b p-4">` block to a flex row
  with the export button:

```tsx
<div className="flex items-center justify-between border-b p-4">
  <div>
    <h2 className="text-sm font-semibold">Last 12 months</h2>
    <p className="text-xs text-muted-foreground">Rent charged, collected, and outstanding per month</p>
  </div>
  <Button
    variant="outline"
    size="sm"
    onClick={() => downloadCsv("income-report.csv", months, [
      { key: "period", label: "Month" },
      { key: "charged", label: "Charged" },
      { key: "collected", label: "Collected" },
      { key: "outstanding", label: "Outstanding" },
    ])}
  >
    <Download className="mr-1 h-4 w-4" /> Export CSV
  </Button>
</div>
```

- [ ] **Step 4: Wire into `RentRollTab`**

In `src/client/components/reports/rent-roll-tab.tsx`, add the same imports
(`Button`, `Download`, `downloadCsv` added to the `@/lib/utils` import).
Since `RentRollTab` renders one `Card` per property (no single header row),
add one export button at the top of the component, above the `groups.map`,
exporting the flattened `leases` array:

```tsx
<div className="flex justify-end">
  <Button
    variant="outline"
    size="sm"
    onClick={() => downloadCsv("rent-roll.csv", leases, [
      { key: "property_name", label: "Property" },
      { key: "unit_name", label: "Unit" },
      { key: "tenant_first_name", label: "Tenant first name" },
      { key: "tenant_last_name", label: "Tenant last name" },
      { key: "start_date", label: "Start" },
      { key: "end_date", label: "End" },
      { key: "monthly_rent", label: "Monthly rent" },
    ])}
  >
    <Download className="mr-1 h-4 w-4" /> Export CSV
  </Button>
</div>
```
Place this immediately inside the outer `<div className="space-y-6">`,
before `{groups.map(...)}`.

- [ ] **Step 5: Wire into `MaintenanceTab`**

In `src/client/components/reports/maintenance-tab.tsx`, add the same
imports. The existing header already has a flex row with filters
(`<div className="flex flex-col gap-3 border-b p-4 md:flex-row
md:items-center md:justify-between">` containing the title block and the
two `Select` filters) — add the export button inside the existing filters
`<div className="flex gap-2">`, after the vendor `Select`:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => downloadCsv("maintenance-report.csv", months, [
    { key: "period", label: "Month" },
    { key: "work_order_count", label: "Work orders" },
    { key: "total_cost", label: "Total cost" },
  ])}
>
  <Download className="mr-1 h-4 w-4" /> Export CSV
</Button>
```

- [ ] **Step 6: Wire into `DelinquencyTab`**

In `src/client/components/reports/delinquency-tab.tsx` (created in Task 3),
add the same imports. Add one export button at the top of the component
(same placement pattern as `RentRollTab` in Step 4 of this task), exporting
the flat `rows` array, placed inside the outer `<div className="space-y-6">`
before `{buckets.map(...)}`:

```tsx
<div className="flex justify-end">
  <Button
    variant="outline"
    size="sm"
    onClick={() => downloadCsv("delinquency-report.csv", rows, [
      { key: "tenant_first_name", label: "Tenant first name" },
      { key: "tenant_last_name", label: "Tenant last name" },
      { key: "property_name", label: "Property" },
      { key: "unit_name", label: "Unit" },
      { key: "due_date", label: "Due date" },
      { key: "days_overdue", label: "Days overdue" },
      { key: "balance", label: "Balance" },
    ])}
  >
    <Download className="mr-1 h-4 w-4" /> Export CSV
  </Button>
</div>
```

- [ ] **Step 7: Wire into `OccupancyTab`**

In `src/client/components/reports/occupancy-tab.tsx` (created in Task 4),
add the same imports and the same header-row treatment as `IncomeTab`
(Step 3 of this task) — change the header `<div className="border-b p-4">`
to a flex row:

```tsx
<div className="flex items-center justify-between border-b p-4">
  <div>
    <h2 className="text-sm font-semibold">Last 12 months</h2>
    <p className="text-xs text-muted-foreground">Occupied units and occupancy rate per month</p>
  </div>
  <Button
    variant="outline"
    size="sm"
    onClick={() => downloadCsv("occupancy-report.csv", months, [
      { key: "period", label: "Month" },
      { key: "occupied_units", label: "Occupied" },
      { key: "total_units", label: "Total units" },
      { key: "occupancy_rate", label: "Occupancy rate" },
    ])}
  >
    <Download className="mr-1 h-4 w-4" /> Export CSV
  </Button>
</div>
```

- [ ] **Step 8: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build`
Expected: both succeed with no errors across all five modified tab files.

- [ ] **Step 9: Manual browser verification**

With the dev server running, visit each of the five Reports tabs
(Rent roll, Income, Maintenance, Delinquency, Occupancy) and click "Export
CSV" on each. Confirm a file downloads in each case, and open at least one
(e.g. `income-report.csv`) to confirm the header row and data rows are
correctly comma-separated with proper values (not `[object Object]` or
`undefined`).

- [ ] **Step 10: Commit**

```bash
git add src/client/lib/utils.ts \
  src/client/components/reports/rent-roll-tab.tsx \
  src/client/components/reports/income-tab.tsx \
  src/client/components/reports/maintenance-tab.tsx \
  src/client/components/reports/delinquency-tab.tsx \
  src/client/components/reports/occupancy-tab.tsx
git commit -m "feat: add CSV export to all report tabs"
```

---

## Self-Review Notes

**Spec coverage**: All three spec sections (Delinquency, CSV export,
Occupancy) map to tasks — Delinquency → Tasks 1 & 3, Occupancy → Tasks 2 &
4, CSV export → Task 5 (covering all five tabs, including the two new ones
from this same plan, not just the three pre-existing tabs — this extends
slightly beyond the spec's literal wording but is required for consistency,
since shipping CSV export on 3 of 5 tabs and leaving the 2 newest without it
would be an inconsistent v1).

**Placeholder scan**: no TBD/TODO; every step has literal code, not a
description of code.

**Type consistency**: `DelinquencyRow` (Task 3) matches the server response
shape from Task 1 exactly, field-for-field. `OccupancyReportMonth`/
`OccupancyReport` (Task 4) match Task 2's response shape exactly.
`downloadCsv`'s generic signature (Task 5) is used identically across all
five call sites, with each call site's `columns` array keys type-checked
against that tab's actual row type by TypeScript at compile time (`keyof T`
constraint) — this is why Task 5's Step 8 typecheck is a meaningful
verification, not just a formality.
