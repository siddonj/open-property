# Plan: Phase 3 — Financial operations

Intent: [`intent.md`](./intent.md)
Spec: [`spec.md`](./spec.md)
Status: Approved 2026-10-29 (revised); Slices 0–D built; wrap-up done 2026-10-30

Delivered as five slices, in order. Each slice ends with typecheck, build,
curl, and browser checks before the next starts.

## Files and systems that change

- `migrations/0003_phase3_financial.sql`: rewritten with `gl_accounts` (plus
  seed), `bills`, `bill_lines`, `bill_payments`, and `budgets`
- `src/server/index.ts`:
  - Accounts: `GET /api/accounts`
  - Bills: new section with CRUD, the complete-flag write sequence (D8),
    payments, void, the lock-on-payment rule (D6), filters, and the
    unit/property check
  - Budgets: new section with GET and an upsert/delete PUT
  - Reports: a `property_id` filter on `income`, plus new `profit-loss` and
    `budget` endpoints
  - Properties and Vendors: delete returns 409 while bills exist (D7)
- `src/client/types.ts`: `Account`, `Bill`, `BillLine`, `BillPayment`,
  `BudgetLine`, `ProfitLossReport`, `BudgetReport`
- `src/client/lib/utils.ts`: `parseCents` and a cents-aware money formatter
  next to `formatMoney`
- `src/client/hooks/use-app-state.ts`: account, bill, payment, budget, and
  report methods
- `src/client/hooks/use-router.ts` and `src/client/app.tsx`: the `expenses`
  route
- Sidebar: an **Expenses** entry under Operations
- `src/client/components/expenses/expenses-page.tsx` and `bill-dialog.tsx`
- `src/client/components/reports/profit-loss-tab.tsx` and `budget-tab.tsx`
  (new); `income-tab.tsx` gets a property filter; `reports-page.tsx` gets two
  tabs
- `src/client/components/properties/property-page.tsx`: the Financials card
- `src/client/components/maintenance/work-order-dialog.tsx`: **Record as
  expense** (D2)
- `README.md` and `CLAUDE.md`: features, the new sections, and the
  integer-cents rule for new financial tables

## Order of work

**Slice 0: migration**
1. Rewrite `0003`. Reset local state (see Deviations), apply it twice, and
   check the schema, indexes, seed rows, and that a property delete with a
   bill fails on the foreign key.

**Slice A: bills and the payables view**
2. Server: accounts endpoint; bill CRUD with lines using the complete-flag
   sequence; payments with the balance check and void; 409 on editing or
   deleting a bill with payment records; filters (property, vendor, account,
   status, date range with the 36-month cap); the unit/property and account
   type checks; 409 on property and vendor delete while bills exist.
3. Client: types, `parseCents`, app-state methods, the route, sidebar entry,
   Expenses page (Unpaid / Overdue / Paid / All tabs with counts and totals,
   filters, Mark paid with method, CSV export with a totals row), and the bill
   dialog (lines, running total, payments list with Void, read-only when
   paid).

**Slice B: P&L and the income property filter**
4. Server: `property_id` on `/api/reports/income` (lease → unit → property)
   and `/api/reports/profit-loss` (months plus accounts, in cents, with
   operating, below-NOI, and capital groups).
5. Client: Income tab property filter, P&L tab with both exports, and the
   property-page Financials card linking to the P&L for that property.

**Slice C: budgets**
6. Server: `GET` and `PUT /api/budgets`, and `/api/reports/budget` (budget,
   actual, and variance per account, including unbudgeted actuals).
7. Client: Budget tab with a property and year picker, inline amount editing,
   variance and percent used, and CSV export.

**Slice D: work order to expense (D2)**
8. The work-order dialog shows **Record as expense** when a work order is
   completed with a cost and has no linked line. It opens the bill dialog
   prefilled (property, vendor, one line with unit, cost, account 6520, and
   the completion date). The server rejects a second line for the same work
   order with 409.

**Wrap-up**
9. Update the README and CLAUDE.md. Get an independent review against
   `REVIEW.md`, then fix its findings.

## Risks and alternatives

- **`index.ts` grows to about 1,900 lines.** Phase 2 flagged the size; this
  phase adds about 500 more. If it passes 1,800, propose extracting the
  financial sections into `src/server/finance.ts` as a separate step rather
  than doing it silently. Phase 6 will add more, so the extraction is likely.
- **P&L correctness** is the main logic risk. Check it with seeded data and
  hand-computed totals for one property over a 3-month range that includes a
  partial rent payment, an unpaid bill, a multi-line bill mixing operating and
  capital lines, a voided bill payment, and a bill in another property.
- **The income property join** goes through `rent_charges → leases → units`.
  A lease whose unit was deleted would drop out of the property view. Check
  how many such rows exist locally and note the result.
- **Money rounding:** new tables are integer cents. Rent stays `REAL` until
  Phase 6, so reports round each rent row to cents before summing. Test with
  amounts like 0.29 and 1234.565.
- **Complete flag (D8):** every bill read must filter on it. Put the filter in
  one shared query helper so a new endpoint can't forget it.
- **Foreign keys:** D7 relies on D1 enforcing `ON DELETE RESTRICT`. The server
  also checks for bills before deleting, so the 409 message doesn't depend on
  the database error. Slice 0 confirms the FK behavior locally.

## Proof

- [x] Migration applies to a fresh DB, and a second run is a no-op
- [ ] curl checks: bill CRUD with lines; edit and delete return 409 once a
      payment exists; payment for the balance, overpayment 400, void returns
      the bill to unpaid; unit/property mismatch and non-expense account 400;
      date-range cap 400; an interrupted bill write stays invisible; P&L and
      income totals against hand-computed seeds; budget variance including
      unbudgeted accounts; duplicate work-order line 409; property and vendor
      delete with bills 409
- [ ] Browser: each slice's flow, plus regression checks on rent, maintenance,
      property, dashboard, and the existing report tabs
- [x] Each CSV export's rows and totals match the screen and the API
- [x] `pnpm typecheck`
- [x] `pnpm build`

## Deviations

- **2026-10-29 — work started against the earlier spec.** Slice 0 and most of
  Slice A were built from the D1 single-table design before this revision:
  - The `REAL` `expenses` and `budgets` migration, applied to the local D1
  - Expense CRUD in `src/server/index.ts`
  - `components/expenses/`, plus types, state, route, and sidebar changes

  None of it is committed. Since `0003` never shipped, rewrite it in place
  rather than adding a `0004` to drop the draft tables. Local databases that
  applied the draft must reset by deleting `.wrangler/state` and running
  `pnpm db:migrate`, which also discards local test data. The expense server
  and client code is reworked to bills and lines, not kept alongside them.

- **2026-10-29 — Slices 0 and A rebuilt to the revised spec.** The draft was
  replaced, local D1 was reset, and the new `0003` was applied (a second run is a
  no-op). D1 enforces `ON DELETE RESTRICT`: deleting a property with a bill
  fails on the foreign key, and the server returns 409 before reaching it.
  Clarifications made while building:
  - **Incomplete bills are listed, not hidden.** The spec hid an interrupted
    create but showed an interrupted edit, and the two can't be told apart
    without another column. Both now appear under All with an "Incomplete ·
    re-save" badge, and are left out of every tab count, total, status filter,
    and payment. This avoids invisible orphan rows. Reports in Slice B must
    still filter `complete = 1`.
  - **Edit lock vs delete lock.** Edits are blocked by live (non-voided)
    payments, so voiding unlocks the bill. Deletes are blocked by any payment
    record, voided or not, so payment history is never removed.
  - **Work-order lines** must belong to the bill's property, as unit lines do.
  - The client type is `BillPaymentMethod`, because rent already has a
    `PaymentMethod` with different values.
  - Not atomic: checking the balance and inserting a payment, and checking for
    payments and rewriting lines, are separate statements. This is acceptable
    for a single-user app and is marked with `ponytail:` comments.

- **2026-10-29 — Slice B built.** P&L and Income checked against seeded
  charges, payments, and bills for one property over July–September 2026, and
  all totals matched. The seed covered a partial rent payment, a 1234.565 rent
  amount, an unpaid bill, a mixed operating and capital bill, mortgage
  interest, a voided payment, an interrupted bill, and a bill on another
  property. Notes:
  - Rent rounds half-up per row: SQLite's `ROUND(1234.565 * 100)` gives 123457
    ($1,234.57).
  - In the P&L, a bill counts as **paid** only when fully paid; a partially
    paid bill stays under unpaid. Partial payments exist only through the API.
  - `billLineActuals()` is the one query for bill actuals and filters
    `complete = 1`. The Slice C budget report reuses it.
  - The router now matches the path only, so links can carry a query string
    (`/reports?tab=profit-loss&property_id=3&from=…&to=…` from the property
    page's Financials card).
  - Orphaned leases: none exist locally (fresh database), so the
    lease → unit → property join drops no rows here.
  - Local test data: tenant "Pat Seed", leases 901–903, and their July–September
    2026 rent charges were inserted directly for the P&L check.

- **2026-10-29 — Slice C built.** Budget vs actual was checked with curl
  (upsert, delete via null, income and expense variance signs, unbudgeted
  actuals, other properties excluded) and in the browser (inline edit,
  invalid-amount guard, CSV). Notes:
  - **No `GET /api/budgets`.** The budget report already returns every
    account's budget beside its actual, so a separate GET would duplicate it.
  - **Variance is signed so positive is favorable:** under budget for costs,
    over budget for income. Group totals sum variance over budgeted lines only.
  - **Rent revenue (5120) actual is rent collected**, the same as the P&L's net
    operating basis. Tenant charges (5920) has no data source until Phase 6, so
    its actual is always 0.
  - **The tab lists every active account**, so a budget can be added to any of
    them; there's no add-account step.

- **2026-10-30 — Slice D built.** The duplicate-line 409 already existed from
  Slice A (`validateLines`); this slice adds `bill_id` to work-order reads, the
  **Record as expense** button, and the bill-dialog prefill. Checked with curl
  (bill_id appears once linked, a second bill for the same work order returns
  409, the P&L shows the line under 6520) and in the browser (prefill of
  property, vendor, unit, cost, 6520, and completion date; a $0.29 cost saves
  as 29 cents; the button is replaced by "Recorded as an expense on bill #N").
  Notes:
  - The button reads the **saved** work order. Completing it and entering the
    cost need a save first, and clicking the button discards unsaved edits.
  - A work order with no property can't become a bill, so the button is hidden.
  - The maintenance and property pages now pass `onSaved` to the work-order
    dialog. They previously reloaded only when it closed, which happens before
    the bill saves, so the list kept offering a duplicate.

- **2026-10-30 — Wrap-up.** README (Expenses, Reports, Financials card,
  Record as expense, upgrade migration order) and CLAUDE.md (section list,
  money rules) updated. An independent review against `REVIEW.md` found no
  critical, high, or medium issues. Its low findings:
  - **Fixed:** the work-order → bill prefill converted the `REAL` cost with
    `cost * 100`, so a cost like 1.005 became 100 cents. It now shifts the
    decimal in the string (101 cents).
  - **Fixed (label):** the Financials card's unpaid figure covers bills of any
    date, while the other figures are year to date. That's intended (it's what
    is owed now), so the label now reads "Unpaid bills, all dates".
  - **Documented:** work-order reads now join `bill_lines`, so an upgraded
    deployment must apply `0003` before the new Worker goes live. README's
    deploy section says so.
  - **Deferred by Josh:** `index.ts` is about 1,900 lines, past the 1,800 mark
    in Risks. Extracting the financial sections to `src/server/finance.ts` was
    proposed on 2026-10-30 and deferred to a separate change.
  - **Proof status:** typecheck, build, the migration, and CSV are ticked
    above. Per-slice curl and browser checks are recorded in these Deviations.
    The curl box stays open because Slice A's individual checks (overpayment,
    date-range cap, interrupted write, and so on) weren't recorded.

- **2026-10-30 — Regression and CSV checks.** Run on a fresh local database in
  a throwaway worktree, seeded with two leases (rent 2,300 and 1,234.565) over
  August–October 2026, partial rent payments, and five bills: paid and
  multi-line with a capital line, overdue, paid then voided, partly paid, and
  unpaid but not yet due.
  - **Matched hand totals:** Oakwood P&L (collected 3,800, operating 2,037.33,
    NOI 1,762.67, below NOI 900, capital 1,200); income filtered to Oakwood;
    Expenses tab counts (4 unpaid including the voided and partly paid bills,
    1 overdue, 1 paid).
  - **CSV vs screen:** the bills (All, with totals row), income (filtered),
    and both P&L exports match the screen row for row. Budget CSV was checked
    in Slice C.
  - **Regression:** the dashboard's October figures; rent ledger payment
    through the dialog (charge goes to Paid, totals update); new work order
    through the dialog; rent roll, maintenance, delinquency, occupancy, and
    budget tabs all load with correct data. No console errors on load.
  - **Not covered this run:** the property page (its Financials card was
    checked in Slice B), so the browser box stays open.
  - **Seen, not Phase 3:** the dashboard counts occupancy from `units.status`
    (seeded occupied, 80%), while the occupancy report counts leases (40%).
    Income and maintenance cards show whole dollars, so $0.29 reads "$0".
