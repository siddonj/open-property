# Intent: Complete rental application

Author: Josh (requester); drafted with Claude
Status: Built and committed 2026-11-05, not yet deployed ([`spec.md`](./spec.md#decisions-needed))
Date: 2026-11-05
Research: [`reports/Rental application research.md`](../../../../reports/Rental%20application%20research.md)

## Problem

An application today stores one person's name, email, phone, employer, monthly
income, unit, desired move-in, follow-up date, status and notes. That isn't
enough to evaluate an applicant or to meet Texas application rules:

- **No household.** Co-applicants and other occupants can't be recorded, but
  Texas treats co-applicants as one decision (§92.352) and occupancy limits need
  a head count.
- **No history.** No prior residences or landlord contacts, no employment
  detail, no other income, no references.
- **No pets, vehicles, emergency contact or disclosure answers** (eviction,
  broken lease, bankruptcy, criminal conviction), all standard on TAR-2003 and
  mainstream application forms.
- **No record of Texas obligations.** Nothing records the application fee and
  deposit, whether the selection-criteria notice was given and acknowledged
  (§92.3515), when the application became complete (the 7-day deemed-rejection
  clock, §92.352), or whether a refund is owed.
- **No decision record.** No reason, conditions, decider, or when and how the
  applicant was told.
- **No place for income verification.** A later phase will add it; today there
  is nowhere to show or record it.

## Proposed outcome

Staff can record a complete application for a household, see at a glance
whether it is complete, whether income meets the property's criteria, and when
a decision is due, and record the decision and how the applicant was told. An
income-verification section is visible on every application as a placeholder
for the later phase.

## Affected users and systems

- Admins and managers (the roles that can see applications today).
- `applications` table (new migration), `/api/applications*`, the application
  dialog and list, the "Create tenant" prefill, `scripts/seed-demo.mjs`.

## Constraints and non-goals

- Staff enter applications; no public applicant portal, no e-signature
  (roadmap out of scope).
- No real credit or background screening and no third-party income
  verification (roadmap out of scope / later phase).
- Collect only what's needed to decide. Never collect protected-class data
  (race, religion, national origin, sex, familial status beyond an occupant
  count, disability), citizenship or marital status. No full SSN, date of
  birth, or ID numbers while screening is out of scope.
- New money columns are integer cents.
- Every change is logged to activity history, as today.

## Acceptance criteria

- [ ] An operator can record every section listed in the spec for a household
      application and edit it later.
- [ ] The list shows each open application's decision deadline and flags ones
      past it.
- [ ] Income-to-rent is computed and compared with a configurable multiple.
- [ ] Every application shows an income-verification section for the later phase.
- [ ] No field collects data on the do-not-collect list.
- [ ] Existing applications keep working, with their current fields unchanged.

## Open questions

None. The four design decisions are recorded in the
[spec](./spec.md#decisions-needed).
