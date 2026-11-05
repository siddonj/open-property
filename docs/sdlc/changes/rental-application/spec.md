# Spec: Complete rental application

Intent: [`intent.md`](./intent.md)
Status: Decisions made 2026-11-05 (all four recommendations accepted)

## Decisions needed

Decided 2026-11-05 by Josh: 1B, one application per household, approved +
conditions field, no DOB or ID details until screening.

1. **Income verification placeholder.**
   - A. A visible section only: "Income verification arrives in a later
     phase." No data.
   - **B (recommended).** The section plus a manual status the staff set
     today (not started / requested / verified / unable to verify / waived),
     verified monthly income, verified date and by whom. The later phase adds
     methods, documents and providers on top of these columns.
   - C. The full `income_verifications` table from the research now (one row
     per attempt, methods, documents, providers).
2. **Co-applicants.**
   - **Recommended:** one application per household. The primary applicant uses
     today's columns; co-applicants are a list on the same application, each
     with name, email, phone. One decision covers everyone, matching §92.352.
   - Alternative: one application per adult, linked by a group id.
3. **Conditional approval.**
   - **Recommended:** keep `approved` and add a "conditions" field (cosigner,
     higher deposit). No new status.
   - Alternative: a new `conditionally_approved` status.
4. **Date of birth and ID.**
   - **Recommended:** don't collect them now; add with screening.
   - Alternative: ID type + last 4 + "ID sighted" now.

## Requirements

Sections an application records (R = required to mark complete):

| Section | Fields |
|---|---|
| Applicant (existing) | first and last name (R), email, phone (one of them R), former names |
| Co-applicants | list of name (R), email, phone |
| Other occupants | list of name, adult or minor |
| Emergency contact | name, phone, relationship |
| Lease terms | unit (R), desired move-in (R), lease term months, quoted rent (R), quoted deposit |
| Residence history | list of address, from, to, rent paid, landlord name, landlord phone, reason for leaving |
| Income | list of earner (applicant or co-applicant name), type (employment, self-employment, benefits, child support, other), employer, position, start date, gross monthly amount, supervisor name and phone |
| Pets | list of type, breed, weight lbs, age, neutered, vaccinated |
| Vehicles | list of year, make, model, plate, state |
| References | list of name, phone, relationship |
| Disclosures | yes/no + explanation each: evicted, asked to move out, broke a lease, bankruptcy, criminal conviction, registered sex offender, pending criminal charges |
| Other | active military, smoker, referral source |
| Guarantor | name, phone, email, gross monthly income |
| Fees | application fee and paid date; deposit, paid date, outcome (held, applied to security deposit, refunded, forfeited), refund date, refund mailing address |
| Consents | dates: criteria notice given (R), criteria acknowledged, screening/verification authorized (R), information certified true (R) |
| Completeness | date the application was complete (sets the decision deadline) |
| Decision | decided at, decided by (current user, set by the server), conditions, decline reason code + notes, applicant notified at and method (phone, mail, email, in person) |
| Income verification | per decision 1 |

Behavior:

- **Decision deadline:** complete date + 7 days, moved to the next weekday when
  it lands on a weekend (§92.352–.353; holidays not modeled). Shown for
  `new` and `screening` applications; past-due ones are flagged on the list.
- **Income to rent:** total gross monthly income (applicant + co-applicants;
  guarantor shown separately) ÷ quoted rent. Compared with a new setting,
  `application_income_multiple` (default 3). Not stored.
- **Decline reasons** are a fixed list: income, rental history, credit,
  criminal history (uniform criteria only), incomplete application, false
  information, unit no longer available, other. Notes required for "other".
- **Refund reminder:** a declined or withdrawn application with a deposit
  outcome of "held" shows "Deposit to refund". If the criteria notice date is
  empty, the fee is flagged too (§92.3515(e)).
- **Decided at/by** are set by the server when status moves to `approved` or
  `declined`, not by the client.
- **Create tenant** additionally prefills emergency contact.
- Lists are capped (20 entries each) and validated with Zod; dates must be
  calendar dates; money is non-negative.

## User experience

- The dialog becomes a wider, tabbed form: Applicant, Household, History,
  Income, Pets & vehicles, Disclosures, Fees & consents, Decision. Lists use
  add/remove rows. The footer and status buttons stay as they are.
- The list adds a "Decide by" column (red when past) and an income-to-rent
  badge (meets / below criteria / no income or rent yet).
- The income-verification section sits on the Income tab with a "coming in a
  later phase" note.
- A short line at the top of the form says what not to ask (protected classes,
  SSN), so staff don't put it in notes.
- Settings → Rent policy gains "Income must be at least N × rent".

## Data and API changes

Migration `0005_rental_application.sql` adds nullable columns to
`applications`; nothing existing changes, so old applications load as before.

- Scalars: `former_names`, `lease_term_months`, `quoted_rent_cents`,
  `quoted_deposit_cents`, `referral_source`, `active_military`, `smoker`,
  `fee_cents`, `fee_paid_on`, `deposit_cents`, `deposit_paid_on`,
  `deposit_outcome`, `deposit_refunded_on`, `refund_address`,
  `criteria_notice_on`, `criteria_ack_on`, `authorized_on`, `certified_on`,
  `completed_on`, `decided_at`, `decided_by`, `conditions`, `decline_reason`,
  `decline_notes`, `notified_at`, `notified_method`.
- Lists and groups as JSON text, one column per section so activity history
  shows which section changed: `co_applicants`, `occupants`,
  `emergency_contact`, `residences`, `incomes`, `pets`, `vehicles`,
  `references`, `disclosures`, `guarantor`.
- Decision 1B: `income_verification_status` (default `not_started`),
  `verified_income_cents`, `verified_on`, `verified_by`.
- `ApplicationInput` grows to match; the server parses JSON columns on read.
- Settings: `application_income_multiple` = `3`.
- `monthly_income` stays as-is for existing rows and the tenant prefill; new
  forms fill it with the applicant's total from the income list.

## Risks and safeguards

- **More PII in one table.** Access stays admin + manager only (unchanged
  `ACCESS` rule). No SSN, DOB or ID numbers are stored.
- **Discriminatory data in free text.** Notes and explanations can hold
  anything. Mitigation: the on-form reminder; no structured field for any
  protected class.
- **JSON columns can't be queried.** Nothing needs to query inside them today;
  income totals are computed on read.
- **Legal accuracy.** Deadlines and refund rules come from the research, not
  counsel; the UI labels them as reminders, not legal determinations.

## Out of scope

- Public or emailed application forms, e-signature, applicant uploads.
- Credit, criminal or eviction screening; FCRA adverse-action notices (needed
  once a consumer report is used — the later screening phase).
- Third-party income verification and documents on applications (the
  `documents` table's entity list would need a rebuild; do it with the
  verification phase).
- Holiday calendar for deadlines; per-property selection criteria text.

## Acceptance criteria

- [ ] Migration applies to a copy of production data without touching existing rows.
- [ ] Every section above can be entered, saved, reopened and edited.
- [ ] Decide-by date and past-due flag are correct for a complete date on a
      weekday and on a Friday.
- [ ] Income-to-rent badge reflects the setting.
- [ ] Moving to approved or declined records decided at/by from the signed-in user.
- [ ] Activity history shows which section changed.
- [ ] `pnpm typecheck` and `pnpm build` pass; `scripts/check-auth.mjs` still passes.

## Approval

- Product/requester: Josh, 2026-11-05 (decisions and go-ahead)
- Technical review: pending
