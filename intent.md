# Intent: Grow Open Property into a more complete operations platform

## Purpose

Extend Open Property with practical workflows inspired by the breadth of
property-management products such as AppFolio, while keeping the project
self-hostable, approachable for small property operators, and consistent with
its existing architecture.

This is a product direction, not a goal to reproduce AppFolio feature-for-feature.
Prioritize complete, useful workflows over a large collection of disconnected
features.

## Current foundation

Open Property already supports:

- Properties and units
- Tenants and leases
- A rent-charge ledger and manual payment recording
- Maintenance work orders and a vendor directory
- Dashboard metrics and rent, income, maintenance, delinquency, and occupancy
  reports
- Basic application records and API endpoints

Applications currently lack a user-facing workflow. The rent ledger is not a
general-ledger accounting system.

## Product principles

- Build around the existing property, unit, tenant, lease, rent, and work-order
  data model.
- Deliver each feature as a coherent workflow, including its UI, API, data
  changes, and reporting where appropriate.
- Keep core workflows usable without third-party SaaS integrations.
- Make operational status and next actions easy to understand.
- Favor explicit, auditable actions over automatic financial or lease changes.
- Preserve the existing React, Hono, Cloudflare D1, and self-hosted deployment
  approach unless a requirement demonstrates a need to change it.

## Proposed phases

### Phase 1: Leasing workflow

Expose applications in the interface and make them usable as a basic leasing
pipeline.

Scope:

- Add an applications page with status filters and search.
- Create, edit, and review application records, including the selected unit,
  desired move-in date, contact details, and notes.
- Support clear status transitions through new, screening, approved, declined,
  and withdrawn.
- Provide follow-up visibility for active applications.
- Add move-in and move-out checklists associated with a lease or unit.
- Add lease-renewal visibility and reminders before active leases expire.

Acceptance criteria:

- An operator can create and update an application without using the API
  directly.
- Applications can be filtered by status and linked to a property and unit.
- Relevant lease expirations and application follow-ups are visible from the
  appropriate workflow or dashboard.
- Existing lease and tenant workflows continue to work.

### Phase 2: Maintenance workflow

Make maintenance work easier to schedule, assign, and track through completion.

Scope:

- Improve work-order assignment and scheduling, including clear status and
  responsibility.
- Show maintenance history by property and unit.
- Add recurring preventive-maintenance tasks.
- Support attaching photos or documents to a work order, subject to a suitable
  storage design.
- Add optional approval steps for work that exceeds an operator-defined
  threshold.

Acceptance criteria:

- Operators can see what work is due, scheduled, assigned, and overdue.
- Completed and open work orders are discoverable from the relevant property
  or unit.
- Recurring work can be generated without creating duplicate tasks.
- Approval requirements and status are visible before work is treated as
  approved.

### Phase 3: Financial operations

Extend rent tracking with basic property expenses and vendor bills. This phase
does not aim to provide a full accounting or banking platform.

Scope:

- Record expenses with property, optional unit and vendor, category, amount,
  date, due date, payment status, and notes.
- Track vendor bills and their payment status.
- Add property-level income and expense summaries.
- Add simple budgets and comparisons against recorded results.
- Allow relevant financial reports to be exported as CSV.

Acceptance criteria:

- Rent income and recorded expenses can be reviewed by property and period.
- Unpaid bills and expenses are distinguishable from paid items.
- Report totals are calculated from persisted records and have clear date and
  property filters.
- Exports match the filters and totals shown in the interface.

### Phase 4: Alerts and reporting

Make existing data more actionable for day-to-day property operations.

Scope:

- Add property and date-range filters to relevant reports.
- Highlight overdue rent, upcoming lease expirations, vacant units, and
  scheduled or overdue maintenance.
- Provide dashboard links from alerts to the records that need attention.
- Keep alert rules understandable and based on existing application data.

Acceptance criteria:

- Each alert has a clear reason and leads to the relevant detail view.
- Users can distinguish upcoming items from overdue items.
- Dashboard totals and report filters agree with the underlying records.

### Phase 5: Team and document foundations

Establish the foundations needed for safe collaboration before introducing
external resident or owner access.

Scope:

- Define user accounts and role-based permissions for operators and staff.
- Record important changes and actions in an activity history.
- Choose secure document storage and access rules for any uploaded files.
- Review authorization and data isolation before adding additional users.

Acceptance criteria:

- Permissions are enforced by the API, not only hidden in the interface.
- Important changes can be traced to a user and timestamp.
- Documents are accessible only to authorized users and related records.

## Out of scope for this roadmap

Unless separately approved, do not include:

- Listing syndication
- Real credit or background screening
- SMS or email blasts and automated texting
- Online card or ACH payment processing
- Public resident or owner portals
- Automated bank reconciliation or a full general ledger
- AI agents that make financial, leasing, screening, or maintenance decisions
  without operator review

These exclusions preserve the current self-hosted template's stated scope.
Potential integrations should be optional and evaluated separately, including
their costs, data handling, and operational requirements.

## Implementation constraints

- Follow the existing route union and page wiring patterns for new screens.
- Keep server endpoints in the existing Hono route module unless its size makes
  extraction necessary.
- Use the existing D1 schema and data-access helpers; add migrations or schema
  changes in the repository's established manner.
- Validate API input with the existing Zod conventions.
- Keep app state and refresh behavior consistent with the existing client
  patterns.
- Update directly related documentation when a phase is implemented.
- Run `pnpm typecheck` after code changes; the repository currently has no
  configured test suite or lint script.

## Delivery approach

Implement one phase at a time, beginning with Phase 1. Before starting each
phase, confirm its detailed user flows and data requirements. Do not begin
later-phase work that depends on a product decision or foundational security
work until that dependency is resolved.

## Product reference

This roadmap is informed by the public AppFolio product overview and accounting
and reporting pages, reviewed on 2026-10-29:

- [AppFolio property management software](https://www.appfolio.com/property-management-software)
- [AppFolio accounting and reporting](https://www.appfolio.com/property-manager/accounting-reporting)

The reference is used for broad product-category comparison, not as a
specification to copy.
