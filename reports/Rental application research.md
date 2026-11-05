# Rental application research

Researched 2026-11-05 for [`docs/sdlc/changes/rental-application`](../docs/sdlc/changes/rental-application/intent.md).
Scope: what a US residential rental application captures, what it must not
capture, and what an income-verification record tracks. Texas first. Not legal
advice: have counsel review decline codes and the adverse-action flow before a
screening phase ships.

## Corrections found during research

- Texas source-of-income preemption is **SB 267 (2015)**, Local Gov't Code
  §250.007, not HB 3101. HB 3101 (2007) created the §92.3515 selection-criteria
  notice. §250.007 bars cities from forcing acceptance of federal housing
  assistance; veteran protections are exempt.
- HUD's 2016 criminal-history guidance was withdrawn effective 2025-09-25
  (Federal Register, 2026-07-17, which also withdraws 2024 source-of-income
  guidance). The Fair Housing Act itself still applies.

## Fields a complete application captures

R = required, C = common, O = optional, for a small-landlord app.

| Section | Fields | Notes |
|---|---|---|
| Header | R: property/unit, desired move-in, quoted rent. C: lease term, quoted deposit. O: referral source | TAR-2003 |
| Applicants (each adult) | R: legal name, phone, email. C: former names. O: DOB, ID type + last 4 + "ID sighted" | TAR-2003: every occupant 18+ applies |
| Co-applicants and occupants | R: co-applicants grouped on one application; other occupants as name + adult/minor. O: relationship | §92.352: rejecting one co-applicant rejects all |
| Emergency contact | C: name, phone, relationship | TurboTenant, Zillow, TAR-2003 |
| Residence history (list) | R: address, from/to, rent paid, landlord name + phone. C: reason for leaving, landlord email, own vs rent | Zillow/TurboTenant ask for 3 years |
| Employment and income (list) | R: employer, position, start date, gross monthly income. C: supervisor contact, end date, pay frequency; other income by type | TAR-2003 asks gross monthly |
| Pets (list) | C: type, breed, weight, age, neutered, vaccinations current | Assistance animals are not pets |
| Vehicles (list) | C: type, year, make, model, plate/state | Parking control |
| Other | C: active military. O: smoker, renter's insurance | |
| Disclosures | C: eviction, asked to move out, broke a lease, bankruptcy, criminal conviction, registered sex offender, pending charges — yes/no + explanation | TAR-2003, TurboTenant |
| Guarantor | O: name, contact, income | Requiring a co-signer can trigger FCRA notice |
| References (list) | O: name, phone, relationship | |
| Consents | R: criteria notice made available (date) and acknowledged (date); screening/verification authorization (date); information certified true (date) | §92.3515; staff record dates, no e-signature |
| Money | R: application fee + paid date (non-refundable, §92.351); application deposit + paid date + outcome (applied / refunded / forfeited) + refund date. C: refund-by-mail address | §92.3515(f), §92.353 |

## Do not collect, or handle carefully

| Item | Rule | Why |
|---|---|---|
| Race, color, religion, national origin, sex | Never | 42 U.S.C. §3604(a)–(c); asking can itself be a discriminatory statement |
| Citizenship, country of origin, height/weight/eye/hair, marital status | Drop | Present on the 2007 TAR-2003; national-origin, sex and familial-status risk, no screening purpose |
| Disability, health | Never ask | 24 CFR §100.202(c) |
| Assistance-animal documentation | Not in the pet section; separate restricted accommodation record | §3604(f)(3)(B); no pet fees |
| Children | Count occupants; no minors' DOB | Familial status, §3604(a) |
| Full SSN, full ID numbers, ID images | Don't collect while screening is out of scope; later pass straight to the vendor and keep at most last 4 | Tex. Bus. & Com. Code §521.052–.053 safeguards, destruction and breach notice |
| Criminal history | Record the applicant's answer only; uniform written criteria; no blanket bans or arrest-only denials | FHA disparate impact (statute); FTC warning |
| Voucher / Section 8 status | No dedicated field; generic income type | §250.007; uniform criteria still matter under the FHA |

## Income verification

One row per attempt, linked to the application (and an income entry when one exists):

- method: pay stubs, offer letter, bank statements, tax return, W-2/1099, benefits letter, employer contact, third-party service, other
- provider (later): Plaid, Argyle, Truework, The Work Number
- status: not started, requested, received, verified, unable to verify, waived
- stated and verified monthly income (cents), period covered, requested/verified dates, verified by, document link, external reference, notes

Don't store the income-to-rent ratio; compute it. 3× gross monthly rent is the
common posted Texas criterion (2.5× also seen). That is landlord practice, not
law, so make it a setting. A service that verifies income or checks references
for a landlord is likely a consumer reporting agency, so FCRA adverse-action
duties apply once a vendor is added.

## Workflow and decisions

- Statuses seen in practice: received, screening, approved, conditionally
  approved, declined, withdrawn.
- §92.352: an applicant is deemed rejected if not told of acceptance within 7
  days of a completed application (deadlines roll past weekends and holidays,
  §92.353).
- Decision record: decided at/by, conditions (cosigner, higher deposit),
  decline reason code + text, applicant notified at + method.
- FCRA (when a consumer report is used): report used, adverse-action notice
  sent at, agency name/address/phone, credit score disclosed. Required for a
  denial, a cosigner requirement, or a higher deposit or rent based even partly
  on a report.
- §92.3515(e): if rejected and the criteria notice was never made available,
  refund both fee and deposit. Bad-faith failure: $100 + 3× amount + fees (§92.354).

## Sources

- Tex. Prop. Code [§92.351](https://texas.public.law/statutes/tex._prop._code_section_92.351), [§92.352](https://texas.public.law/statutes/tex._prop._code_section_92.352), [§92.353](https://texas.public.law/statutes/tex._prop._code_section_92.353), [§92.3515](https://texas.public.law/statutes/tex._prop._code_section_92.3515), [§92.354](https://texas.public.law/statutes/tex._prop._code_section_92.354)
- [HB 3101 (2007) analysis](https://capitol.texas.gov/tlodocs/80R/analysis/html/HB03101H.htm); [SB 267 (2015) analysis](https://capitol.texas.gov/tlodocs/84R/analysis/html/SB00267F.htm)
- [Tex. Bus. & Com. Code ch. 521](https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm)
- [42 U.S.C. §3604](https://www.law.cornell.edu/uscode/text/42/3604); [24 CFR §100.202](https://www.law.cornell.edu/cfr/text/24/100.202)
- [Federal Register 2026-07-17, HUD guidance withdrawals](https://www.govinfo.gov/content/pkg/FR-2026-07-17/html/2026-14432.htm)
- [FTC: Using Consumer Reports — What Landlords Need to Know](https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-landlords-need-know)
- TAR-2003 Residential Lease Application (2007 edition); [TXR 2026 forms changes](https://www.texasrealestate.com/wp-content/uploads/2026-forms-changes.pdf); [TAA: Applying for rental housing](https://www.taa.org/renters/applying-for-rental-housing/)
- [TurboTenant application](https://support.turbotenant.com/en/articles/4004061-what-does-the-online-rental-application-look-like); [Zillow rental application](https://www.zillow.com/rentals-network/rental-application-form); [Buildium](https://www.buildium.com/features/customizable-rental-applications/); [TenantCloud](https://support.tenantcloud.com/en/articles/11908741-how-do-i-make-fields-in-the-application-form-required-or-optional)
- [Argyle](https://argyle.com/tenant/); [Plaid income verification](https://plaid.com/en-eu/resources/fintech/how-to-verify-income/)

## Not verified

- The current 2026 TXR-2003 and the members-only TAA application (2007 TAR-2003 text used instead).
- AppFolio, RentRedi, Avail and Rentec Direct field lists.
- A statutory day count for refunding a rejected applicant's deposit.
- Current status of the 2023 HUD discriminatory-effects rule and 2020 assistance-animal notice; the *Inclusive Communities* (2015) citation; Texas Fair Housing Act (Prop. Code ch. 301) class list; §521.053 individual-notice timing.
