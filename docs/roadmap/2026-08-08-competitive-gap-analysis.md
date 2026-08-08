# Competitive gap analysis: ResiQ Property vs. Entrata / AppFolio / Yardi

**Date**: 2026-08-08
**Method**: Compared this app's current 7 modules and 11-table schema against
the general capability set of Entrata, AppFolio, and Yardi (the three dominant
enterprise property management platforms), based on their publicly documented
feature sets. This is a template/self-hosted app, not a SaaS competitor to
these platforms — the goal is to identify which of their capabilities are
worth porting down to this scale, not to match them feature-for-feature.

**Scope-conflict flag**: The README explicitly excludes five categories to
keep this app self-hostable with no third-party SaaS dependency and no
public-facing endpoints: listing syndication, real screening, 2-way SMS/email
blasts, online payment processing, and public tenant/owner portals. Gaps that
fall into those categories are listed below and tagged `[SCOPE CONFLICT]` —
they are real gaps relative to Entrata/AppFolio/Yardi, but building them means
deliberately lifting a README constraint, not a default "yes." Every other gap
is compatible with the current self-hosted philosophy.

**Sizing**: S = a few hours to a day, M = several days, L = a multi-week
effort or a new subsystem (auth, GL, etc.).

**Priority**: P0 = core parity gap most self-hosted competitors would expect,
P1 = high-value differentiator, P2 = nice-to-have polish.

---

## 1. Leasing & renewals

- **Lease renewal workflow** — generate a renewal offer from an ending lease
  (carry forward tenant/unit, prompt for new rent/term), rather than manually
  creating a new lease record from scratch. P0, M.
- **Rent escalation schedules** — define a rent step-up schedule on a
  multi-year lease (e.g. 3% annual increase) instead of a single flat
  `monthly_rent`. P1, M — needs a schema change (`lease_rent_schedule` table
  or similar) plus rent-charge generation to read from it.
- **Lease document templates / clause library** — reusable lease templates
  with variable substitution (property, tenant, rent) rendered to a document.
  P1, L — no document generation exists today.
- **E-signature** — send a lease for signature and track signed status.
  P1, L — third-party e-sign API needed (DocuSign/HelloSign), but the
  *tracking* (signed/unsigned status field) is self-hostable without
  the API; only the actual signing flow is a scope question.
- **Month-to-month auto-conversion** — flag/convert leases past `end_date`
  with no renewal to `status: month_to_month` instead of leaving them
  `active` indefinitely. P2, S — small logic addition to lease status
  handling.

## 2. Tenant screening & applications `[SCOPE CONFLICT]`

- **Real credit / background / eviction checks** — the `applications` table
  today is a placeholder record only (manual entry, no verification). Real
  screening requires a third-party API (TransUnion SmartMove, Checkr, etc.).
  P0 relative to Entrata/AppFolio/Yardi, but explicitly excluded by the
  README. Building this means adding a real external dependency.
- **Applicant scoring/comparison view** — even without real screening data,
  a side-by-side comparison of multiple applicants for one unit (income
  ratio, move-in date, notes) is achievable with existing `applications`
  data. P2, S — no scope conflict, pure UI/aggregation on data already
  captured.

## 3. Online payments `[SCOPE CONFLICT]`

- **Tenant-initiated ACH/card payments** — today, all payments are
  manually recorded by the operator (`POST /api/payments`). Entrata/AppFolio/
  Yardi let tenants pay online and reconcile automatically. P0 relative to
  competitors, explicitly excluded — requires a payment processor (Stripe,
  PayNearMe) and a public-facing payment page.
- **Autopay** — scheduled recurring tenant payments. Same conflict, depends
  on the above.
- **Payment plans** — split an overdue balance into installments. This one
  is *not* inherently a scope conflict — it can be modeled as multiple
  `rent_charges` rows or a payment-plan schedule with manually recorded
  payments, no processor required. P2, M.

## 4. Accounting / General Ledger

This is the largest structural gap. The app currently has a single-purpose
rent ledger (`rent_charges` + `payments`); it has no chart of accounts, no
double-entry bookkeeping, and no owner-facing financials beyond the Reports
tab shipped this session.

- **Chart of accounts** — even a minimal one (income, expense categories
  beyond just "maintenance cost") would let income/expense reporting go
  beyond rent-only. P0, L — new `accounts`/`transactions` tables, and
  everywhere money moves today (`rent_charges`, `payments`, `work_orders.cost`)
  would need to post to it.
- **Owner draws / distributions** — track money paid out to property owners,
  separate from operating funds. P1, L — depends on chart of accounts
  existing first.
- **Trust accounting** — segregating tenant security deposits and owner
  funds into separate ledgers (often a legal requirement for licensed PMs).
  P1, L — same dependency.
- **Bank reconciliation** — match recorded payments against a bank statement
  import (CSV/OFX). P2, M — could be built independently of full GL, as a
  reconciliation pass over `payments`.
- **1099 generation for vendors** — year-end tax form summary of payments
  to each vendor. P2, M — needs a `vendor_payments` concept, which doesn't
  exist yet (`work_orders.cost` is not the same as "we paid this vendor $X").

## 5. Owner portal `[SCOPE CONFLICT — public-facing]`

- **Owner statements** — monthly/annual income & expense statement per
  property, exportable, for the property owner (not the PM operator). P0
  relative to competitors. The *report* itself (an owner-facing version of
  the Income report) is not a scope conflict — building it as an
  operator-viewed report (like Reports today) is fine. Only a
  *self-service, owner-login* portal is the scope conflict. P1 for an
  operator-facing "Owner statement" report, M.
- **Document access for owners** — shared folder of leases/statements per
  owner. Same split: internal document *organization* is fine; owner
  self-service *access* is the conflict.

## 6. Tenant portal `[SCOPE CONFLICT — public-facing]`

- **Self-service payments** — covered above (payments conflict).
- **Self-service maintenance requests** — tenant submits a work order
  directly instead of the operator entering it on their behalf. The
  `work_orders.tenant_id` field already models "who reported it," so the
  data model supports this; only the *public-facing submission form* is the
  scope conflict.
- **Document access** — lease copies, notices, for tenants to view. Same
  split as owner portal.

## 7. Maintenance operations

- **Recurring / preventive maintenance schedules** — e.g. "HVAC filter
  change every 3 months per unit," auto-generating work orders on a
  schedule. P1, M — new `maintenance_schedules` table plus a generation job
  analogous to `rent-charges/generate`.
- **Move-in / move-out inspections with photos** — structured
  checklist + photo attachments tied to a lease start/end. P1, L — needs
  file storage (currently `clawnify.json` declares `"storage": false"`, so
  this requires enabling storage, not a third-party SaaS dependency — worth
  flagging as a config change, not a scope conflict).
- **Vendor insurance / license tracking** — expiration dates on vendor
  certificates, with a dashboard warning when expired. P2, S — small
  addition to the `vendors` table (`insurance_expires_at`, `license_number`)
  plus a dashboard/report flag, no external dependency.
- **Vendor bidding** — request quotes from multiple vendors for a work
  order before assigning. P2, M.

## 8. Listing & marketing `[SCOPE CONFLICT]`

- **Syndication to Zillow/Apartments.com/etc.** — explicitly excluded,
  requires third-party listing APIs.
- **Vacancy marketing page** — a shareable, public page for a vacant unit
  (photos, description, apply-now link). P2 relative to competitors,
  `[SCOPE CONFLICT — public-facing]`.

## 9. Communication

- **SMS / automated texting** `[SCOPE CONFLICT]` — 2-way SMS explicitly
  excluded (requires Twilio or similar).
- **Email blast campaigns** `[SCOPE CONFLICT]` — same reasoning.
- **In-app notification center** — this is *not* excluded. A simple
  in-app list of "lease expiring in 30 days," "rent overdue," "work order
  assigned" — surfaced in the UI rather than sent externally — has zero
  third-party dependency and directly extends data already computed for
  the Dashboard (`upcoming_expirations`, `overdue_count`, etc.). P1, M.
- **Printable/downloadable notice templates** (late rent notice, lease
  violation notice) — generate a formatted document to print/hand-deliver,
  no sending required. P2, M — no scope conflict since nothing is
  transmitted electronically to the tenant by the app itself.

## 10. Reporting / BI

The Reports tab shipped this session (rent roll, income, maintenance cost)
is the starting point. Gaps beyond it:

- **Delinquency aging report** — 0-30/31-60/61-90/90+ days overdue buckets
  per tenant. P0, S — pure aggregation over existing `rent_charges`, no
  schema change, natural next Reports tab.
- **Occupancy trend over time** — historical occupancy rate by month
  (current Dashboard only shows a point-in-time snapshot). P1, M — requires
  either a snapshot table populated over time, or deriving from
  lease start/end date ranges retroactively (the latter is possible without
  new storage).
- **Budget vs. actual** — compare planned vs. actual income/expense per
  property. P2, L — needs a "budget" concept that doesn't exist yet.
- **Custom/saved report builder** — let the user pick columns/filters and
  save a view. P2, L — significant UI investment, low priority for a
  self-hosted template.
- **CSV export** — every report/list should be exportable as CSV. P0, S —
  small, high-value, applies uniformly across Reports/Rent/Tenants/etc.

## 11. Documents

- **Per-lease document storage** — attach signed lease PDF, addenda, etc.
  to a lease record. P1, M — requires enabling file storage (see maintenance
  inspections above; same underlying capability, `clawnify.json`
  `"storage": false"` today).
- **Compliance document tracking** — insurance certs, inspection reports,
  with expiration reminders. P2, M — depends on document storage existing.

## 12. Insurance

- **Renters insurance tracking** — record whether a tenant has proof of
  renters insurance, policy number, expiration. Not excluded — this is
  tracking only, no third-party verification integration required. P2, S —
  a few fields on `leases` or a small `renters_insurance` table plus a
  Dashboard/report flag for lapsed coverage.

## 13. Multi-user / permissions

This is a structural gap outside the "feature" frame: the app currently has
**no authentication or user model at all** — anyone with network access to
the Worker has full read/write access to everything. Entrata/AppFolio/Yardi
are all built around role-based access (owner, property manager, leasing
agent, maintenance tech, accountant), each scoped to different data/actions.

- **Basic auth + single admin user** — even a minimal login gate (not
  full RBAC) is a meaningful gap for anything beyond a single-operator local
  install. P0 if this app is ever exposed beyond localhost/trusted network,
  L — touches every route (`src/server/index.ts` has no auth middleware
  today), needs session/credential storage.
- **Role-based access control** — owner/PM/leasing/maintenance roles with
  scoped permissions (e.g. maintenance tech sees only assigned work orders).
  P1, L — depends on auth existing first.
- **Audit log** — who changed what, when. P2, M — depends on auth existing
  (need a `user_id` to attribute changes to).

## 14. Bulk operations & saved views

Smaller UX gaps, not full sections on their own:

- **Bulk actions** — select multiple leases/work orders/tenants and apply
  a status change at once. P2, S per list page.
- **Saved filters / views** — e.g. "my overdue rent this quarter" as a
  reusable filter preset. P2, M.
- **Global search** — search across properties/tenants/leases from one box
  instead of per-page search (`listTenants(q)` exists but is tenant-only
  today). P1, M.

---

# Suggested build order

Ordered by (priority, then effort — cheapest high-value wins first), and
respecting the scope boundary by default (nothing marked
`[SCOPE CONFLICT]` is included unless you decide to lift that constraint):

1. **Delinquency aging report** (§10, P0, S) — pure aggregation, extends the
   Reports tab just shipped, no schema change.
2. **CSV export across list/report views** (§10, P0, S) — small, broadly
   useful, no schema change.
3. **Renters insurance tracking** (§12, P2, S) — small schema addition,
   self-contained, no dependency on anything else in this list.
4. **Vendor insurance/license tracking** (§7, P2, S) — same shape as #3,
   could be batched together as one "compliance fields" pass.
5. **In-app notification center** (§9, P1, M) — reuses Dashboard's existing
   overdue/expiration computations, no third-party dependency, meaningfully
   closes a real gap vs. competitors within the self-hosted constraint.
6. **Lease renewal workflow** (§1, P0, M) — the single highest-value
   leasing gap that's fully in-scope.
7. **Month-to-month auto-conversion** (§1, P2, S) — small logic add,
   natural pairing with #6 since both touch lease status transitions.
8. **Occupancy trend report** (§10, P1, M) — next logical Reports
   extension after #1.
9. **Global search** (§14, P1, M) — meaningful UX gap once the app has
   enough data volume to matter.

**Structural decision needed before going further**: multi-user auth (§13)
is not a "feature" in the same sense as the above — it's a foundational
change that touches every route and blocks role-based access, audit
logging, and (if ever wanted) tenant/owner portals. Recommend deciding
explicitly whether this template stays single-operator/trusted-network-only
(in which case §13 stays permanently out of scope, matching the "self-hosted"
philosophy) or whether basic auth becomes a priority — that decision should
happen before investing further in the roadmap above, since it changes the
shape of everything downstream (portals, RBAC, audit log).

**Items requiring an explicit scope-lift decision** (not included in the
build order above; revisit only if you decide to override the README):
online payments, tenant screening, SMS/email, listing syndication, and any
of the public-facing portal work.
