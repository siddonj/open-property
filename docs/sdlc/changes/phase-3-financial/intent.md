# Intent: Phase 3 — Financial operations

Author: Josh (requester); drafted with Claude
Status: Approved 2026-10-29 (revised: general ledger brought into the roadmap
as Phase 6; see spec D5–D8)
Date: 2026-10-29
Roadmap: [Phase 3 in `intent.md`](../../../../intent.md#phase-3-financial-operations)

## Problem

- The app tracks rent income but no costs. Operators can't record a property
  tax bill, an insurance premium, or a plumber's invoice, so there is no view
  of what a property actually earns.
- Vendor invoices have nowhere to live, so there is no list of what is owed,
  when it is due, or what has been paid.
- The Income report covers the whole portfolio only. There is no per-property
  view of income, costs, and net.
- There are no budgets, so operators can't compare a year's spending against a
  plan.

## Proposed outcome

1. **Bills and expenses:** record a cost against a property as a bill
   (optionally from a vendor) with a date, optional due date, reference, and
   notes, and one or more lines. Each line is coded to an account and may name
   a unit or work order. A one-off expense is a one-line bill.
2. **Payables view:** a list of bills that separates unpaid, overdue, and paid
   items, filterable by property, vendor, account, and date. Payments are
   recorded with a date and method, and corrected by voiding.
3. **Property income and expense summaries:** income, operating expenses, and
   net by property and period, with capital spending shown separately, on a new
   report tab and on the property page.
4. **Simple budgets:** an annual amount per property and account, compared
   against recorded results for that year.
5. **CSV export** for the expense list and each new report, matching the
   filters and totals on screen.

## Affected users and systems

- Operators and owners reviewing a property's performance. The app is still
  single-user with no auth.
- Server: new Accounts, Bills, and Budgets sections, plus the Reports section
  of `src/server/index.ts`; migration `0003` (rewritten; see the plan's
  Deviations).
- Client: new Expenses page and route, Reports tabs, property page, and
  sidebar; the work-order dialog if completed work becomes an expense (see
  spec D2).

## Constraints and non-goals

- No journal entries, double entry, or period locks yet. Those arrive in the
  Phase 6 general ledger, which posts from the bill, line, and payment records
  built here. Every design choice below must hold up when that happens:
  integer cents, account-coded lines, payments as records, and no cascade
  deletes of financial history.
- No bank feeds, reconciliation, 1099 reporting, or tax filing. Payment method
  is recorded now because 1099 totals later exclude card payments.
- No online payment of bills. Payment processing is out of scope for the
  template (README). A payment is a record the operator enters.
- Rent tables stay `REAL` until Phase 6 migrates them. Reports convert rent to
  cents at query time.
- No receipt or invoice attachments. File storage needs the design the roadmap
  defers to Phase 5.
- No recurring expenses (mortgage, insurance) in this phase. This is a
  candidate follow-up that would reuse the Phase 2 recurrence helper.
- Follow existing patterns: Zod-validated routes in `index.ts`, the
  `migrations/` mechanism, `downloadCsv` (with its formula-injection guard) for
  exports, and the 36-month report range cap.

## Acceptance criteria

- [ ] Rent income and recorded expenses can be reviewed by property and
      period.
- [ ] Unpaid (including overdue) bills and expenses are clearly distinguished
      from paid ones.
- [ ] Report totals come from persisted records and have clear date and
      property filters.
- [ ] CSV exports match the filters and totals shown in the interface.
- [ ] Existing rent, maintenance, dashboard, and report flows still work.
      `pnpm typecheck` and `pnpm build` pass.

## Open questions

See [`spec.md` → Open questions](./spec.md#open-questions).
