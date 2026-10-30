# Accounts Payable, CapEx vs. OpEx, and Federal Tax Compliance for US Multifamily (as of tax year 2026)

Scope note: US federal only. Researched 2026-10-29. Primary sources (IRS pages, IRC text via Cornell LII) are preferred; vendor/practitioner blogs are flagged as such. The 2026 Form 1099-MISC/NEC instructions (Rev. 12/2026) and the 2025 editions of Pub 527 / Pub 946 / Schedule E instructions were the latest IRS texts reached. Nothing here is tax advice; app defaults should be overridable per owner/CPA.

---

## 1. AP workflow in multifamily (bill entry, approvals, coding, payment runs, work orders, accruals, credits, retainage)

### Takeaway
Market-leading PM platforms model AP as: bill intake -> code to property + GL account (often defaulted from vendor) -> rule-based approval routing (amount / property / vendor / GL) -> optional PO / work-order match -> payment run from the owner's (trust) bank account -> owner statement. Retainage on capital projects is a separate liability ("retainage payable") released on completion. Month-end accruals, vendor credits and payment rails (check/ACH) were not documented by primary sources found and are listed as gaps.

### Cited Findings
- AppFolio "Bill Approval Flows" route bills by bill amount, property, vendor name, vendor type, and GL account; the underlying workflow engine (Realm-X Flows) is on Plus/Max plans (third-party summary of AppFolio, not AppFolio docs) — [Wrk.com](https://www.wrk.com/blog/how-to-automate-vendor-invoice-processing-and-approvals-in-appfolio)
- When a bill is tied to a purchase order, AppFolio validates the bill against PO scope before routing; Smart Bill Entry gives each account an email intake address, and reviewers verify vendor, amount, property assignment, GL account and reference number before approval (third-party summary) — [Wrk.com](https://www.wrk.com/blog/how-to-automate-vendor-invoice-processing-and-approvals-in-appfolio)
- Buildium compares a bill against documents attached to the bill, work order and vendor and flags conflicts before payment; guidance is to confirm allocation against the work order before approving (Buildium marketing blog) — [Buildium blog](https://www.buildium.com/blog/property-management-bill-payment-strategies/)
- Work-order-to-bill flow example: Property Meld (maintenance platform) pushes bills into AppFolio and can reassign them with a "Bill Back to Property" task — [Property Meld internal guide](https://rpmp-internal.helpscoutdocs.com/article/213-meld-billing-how-to-guide)
- GL routing pitfall: if a "Default GL Account" is set on the AppFolio vendor profile, Property Meld's GL rules will not override it, i.e., vendor-level defaults silently beat rule-based coding — [Property Meld help](https://help.propertymeld.com/hc/en-us/articles/45793892336147-How-to-Set-GL-General-Ledger-Rules-AppFolio)
- Control recommendations: time-stamp every approval / rejection / clarification request; documented approval limits per property and per bank account (practitioner guide) — [ManageCasa](https://managecasa.com/articles/accounts-payable-process)
- Retainage entry at billing (10% example on $100): Dr Work-in-progress/Construction 100; Cr Accounts Payable 90; Cr "Retained Percentages, Contracts Payable" 10 — retained amount is a liability until due — [NY State Comptroller](https://www.osc.ny.gov/files/local-government/publications/pdf/accounting-for-retained-percentages.pdf)
- Retainage release: Dr Retainage Payable / Cr Accounts Payable when work is complete (MYOB), or Dr Retainage Payable / Cr Cash on payment (Ramp) — [MYOB Advanced docs](https://help.myob.com.au/advanced/Docs/Published/UserGuide/AP__CON_Understanding_Bills_with_Retainage_Processing.html); [Ramp](https://ramp.com/blog/retainage-payable)
- Retainage is booked as a current liability until released — [Corpay](https://www.corpay.com/resources/blog/construction-retainage)

### Inferences
- Minimum viable data model for this app (which already has `vendors` and maintenance work orders): `bills` (vendor_id, property_id, invoice_no, invoice_date, due_date, status: draft/pending_approval/approved/scheduled/paid/void, total, retainage_pct, retainage_amount), `bill_lines` (bill_id, gl_account_id, unit_id nullable, work_order_id nullable, amount, description, capex_flag), `bill_approvals` (bill_id, approver, action, timestamp, note), `payments` (method: check/ACH/card/other, bank_account_id, date, reference) and `payment_applications` (payment_id, bill_id, amount) to support partial payments and one payment covering many bills.
- Code at the **line** level, not the bill level: one vendor invoice frequently mixes repair (OpEx) and replacement (CapEx) items, and the de minimis safe harbor is applied per invoice *or per item* (see Q2). Linking `bill_lines.work_order_id` lets work-order cost roll up from AP rather than a duplicate cost field.
- Approval rules: start with a single "amount threshold per property" rule plus "capex lines always require owner approval"; matches the dimensions AppFolio exposes (amount, property, vendor, GL) without a rules engine.
- Retainage: add a `retainage_payable` liability GL account; on bill approval post Dr expense/CIP (gross), Cr AP (net), Cr Retainage Payable (held); a "release retainage" action creates a payable for the held amount. Track per-contract cumulative retainage so the release equals the sum held.
- Card/TPSO payment method must be captured on each payment because card payments drop out of 1099-NEC/MISC totals (see Q4).
- Vendor default GL should be a suggestion that a line-level choice overrides — the Property Meld/AppFolio conflict shows the failure mode when vendor defaults win silently.

### Gaps
- No primary (vendor help-center) source retrieved for month-end AP accrual practice (e.g., accrue received-not-invoiced work orders), vendor credit memo application, or positive-pay/check printing; these are standard accounting practice but uncited here.
- Whether AppFolio/Buildium enforce 3-way match (PO / work order completion / invoice) natively was not confirmed.
- Standard retainage percentages and release triggers (e.g., substantial completion, lien waivers) are contract- and state-law-driven; no authoritative federal source found.

---

## 2. Capitalize vs. expense (Treas. Reg. 1.263(a)-1/-3, safe harbors, BAR test, UOP, GAAP policies, turnover costs)

### Takeaway
Three IRS safe harbors drive day-to-day coding: de minimis ($2,500 per invoice/item without an AFS; $5,000 with), routine maintenance (recurring work expected more than once in 10 years for building structure/systems), and small-taxpayer building safe harbor (gross receipts <= $10M, building unadjusted basis <= $1M, total spend <= lesser of $10,000 or 2% of basis). Anything outside them goes through the BAR test (betterment / adaptation / restoration) applied separately to the building structure and each of 8 building systems. Turnover items: replacing carpet / built-in appliances is treated by IRS Pub 527 as an improvement; routine cleaning/painting/repairs are expense.

### Cited Findings
**De minimis safe harbor (Reg. 1.263(a)-1(f))**
- Up to $5,000 per invoice or item with an applicable financial statement (AFS); otherwise up to $2,500 per invoice or item ($500 before 2016); must be substantiated by invoice — [IRS Tangible Property Regs FAQ](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- Limits determine safe-harbor eligibility only; amounts above them fall back to normal rules (not a hard capitalization ceiling) — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- Excludes inventory, land, and certain rotable/temporary/standby emergency spare parts — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- Elected annually by statement titled "Section 1.263(a)-1(f) de minimis safe harbor election" attached to the timely filed original return; not an accounting method change (no Form 3115) — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- Taxpayers with an AFS need *written* accounting procedures; without an AFS a consistent procedure/policy must be in place at the start of the year — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- $2,500 threshold set by Notice 2015-82 — [IRS Notice 2015-82](https://www.irs.gov/pub/irs-drop/n-15-82.pdf) (linked from IRS FAQ page)

**Routine maintenance safe harbor**
- Recurring activities expected as a result of use that keep property in ordinarily efficient operating condition; for building structures and building systems, the work must be reasonably expected more than once in the 10 years after placed in service (other property: more than once during class life) — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- Does not cover betterments; can cover certain restorations including replacement of a major component — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)

**Small taxpayer safe harbor (buildings)**
- Average annual gross receipts <= $10 million; building unadjusted basis <= $1 million; total repairs + maintenance + improvements for the building for the year <= lesser of 2% of unadjusted basis or $10,000; annual election by statement; not a method change (IRS notes page wording on the $1M threshold renders oddly — confirm in Reg. 1.263(a)-3(h)) — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)

**BAR test**
- Betterment: fixes a material pre-existing defect, is a material addition/enlargement/capacity increase, or materially increases productivity, efficiency, strength, quality or output ("material" undefined — reasonable judgment) — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- Restoration: replaces a major component or substantial structural part; restores casualty damage requiring basis adjustment; returns property from disrepair to working condition; rebuilds to like-new after class life — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- Adaptation: converts property to a new or different use inconsistent with its ordinary use when first placed in service — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)

**Unit of property for buildings**
- The building is generally the UOP, but improvement analysis is applied separately to the building structure and each building system: plumbing, electrical, HVAC, elevators, escalators, fire protection & alarm, gas distribution, security — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)
- A component in a different MACRS class or depreciation method (including after a cost segregation reclassification) can be a separate UOP — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)

**Turnover / make-ready items**
- Pub 527 lists as improvements (capitalize): new roof, flooring, wall-to-wall carpeting, built-in appliances, kitchen modernization; repairs and maintenance are deductible when paid — [IRS Pub 527 (2025)](https://www.irs.gov/publications/p527)
- HUD MAP Guide: where carpet is not listed among capital components, carpet repair and replacement must be budgeted as an operating expense (HUD-program-specific budgeting rule, not tax law) — [HUD MAP Guide A.5.7.4.1 via gocodebook](https://gocodebook.com/library/us/federal/us-hud-map-guide-4430-g-2020-rev2021-03-19/appendix-2-quality-control-plans-and-identity-of-interest/a.5.7.4.1-capital-costs-vs.-operating-expense)
- Massachusetts bond-financed housing guidance lists painting, carpet cleaning, replacement of failed/failing individual appliances and cabinet refinishing/repair as operating items (program-specific) — [Mass.gov allowable bond expenses](https://www.mass.gov/doc/allowable-bond-expenses/download)
- Practitioner note: treating repainting and carpet replacement as maintenance inflates the maintenance ratio when underwriting deals — [Real Estate Financial Planner](https://refp.substack.com/p/capital-expenses-for-real-estate)

### Inferences
- Tax vs. book divergence is real: an individual carpet replacement under $2,500 per invoice can be expensed for tax under de minimis (if elected), while Pub 527 treats carpet as an improvement absent the safe harbor, and lender/HUD budgets may classify it as OpEx. The app should therefore store a **book classification** (opex / capex) per bill line plus an optional **tax treatment** tag (de_minimis / routine_maintenance / small_taxpayer / capitalize / repair) rather than one boolean.
- Suggested capex-suggestion logic per bill line: (1) line amount (or invoice total) <= owner's configured de minimis threshold (default $2,500) and owner has de minimis election on -> suggest expense; (2) GL account flagged "replacement" (roof, HVAC unit, water heater, flooring, appliances) and amount > threshold -> suggest capitalize to the matching building system / asset class; (3) otherwise default to repair expense. Always user-overridable.
- Small-taxpayer safe harbor is a per-building, per-year test; the app can compute it cheaply: sum of all repair + maintenance + improvement lines for the property in the year vs. min($10,000, 2% x building basis) — requires storing building unadjusted basis per property.
- Tag capitalized lines with one of the 9 UOP buckets (structure + 8 systems) plus "personal property (5-yr)" and "land improvement (15-yr)" so a later depreciation module and BAR analysis have the data.
- Common GAAP book policy (no authoritative source found): owners set a book capitalization threshold (often aligned to de minimis) and capitalize unit-turn replacements. Treat as configurable per owner.

### Gaps
- No authoritative GAAP source (ASC 360) or NCREIF/NAREIT definition of "recurring capital expenditures" for multifamily was retrieved; typical institutional capitalization thresholds are uncited.
- Whether the routine maintenance safe harbor requires an election was not stated on the fetched IRS page (believed to require none — unverified here).
- Painting treatment is not explicitly addressed in the fetched Pub 527 text; generally a repair unless part of a larger improvement — unverified.

---

## 3. Depreciation (27.5-yr, 15-yr, 5/7-yr, cost segregation, bonus depreciation 2026, Section 179)

### Takeaway
Residential rental buildings and structural components: 27.5 years SL, mid-month (30-yr ADS). Appliances/carpet/furniture in rentals: 5 years. Land improvements: 15 years. OBBBA (P.L. 119-21, signed July 4, 2025) permanently restored 100% bonus depreciation for qualified property acquired *and* placed in service after January 19, 2025 (Notice 2026-11 interim guidance). Section 179 limit is $2,500,000 / $4,000,000 phase-out for 2025 and $2,560,000 / $4,090,000 for 2026; personal property used to furnish lodging is no longer excluded, but 179 still requires use in the active conduct of a trade or business and "qualified real property" is limited to nonresidential.

### Cited Findings
**Recovery periods**
- Residential rental buildings and structural components (furnaces, water pipes): 27.5 years GDS, 30 years ADS; straight-line, mid-month convention; land not depreciable — [IRS Pub 527 (2025)](https://www.irs.gov/publications/p527)
- Appliances, carpeting and furniture used in rentals: 5 years GDS (9 ADS); roads, fences, shrubbery: 15 years GDS — [IRS Pub 527 (2025)](https://www.irs.gov/publications/p527)

**Bonus depreciation (IRC 168(k)) after OBBBA**
- P.L. 119-21 reinstated the 100% special depreciation allowance for qualified property acquired and placed in service after January 19, 2025 — [IRS Pub 946 (2025)](https://www.irs.gov/publications/p946); [IRS Pub 527 (2025)](https://www.irs.gov/publications/p527)
- Taxpayers may instead elect 40% (60% for long production period property / certain aircraft) for the first tax year ending after January 19, 2025 — [IRS Pub 946](https://www.irs.gov/publications/p946)
- Property acquired after Sept 27, 2017 and before Jan 20, 2025 is limited to 40% if placed in service in 2025 (phase-down rules) — [IRS Pub 946](https://www.irs.gov/publications/p946); [IRS Pub 527](https://www.irs.gov/publications/p527)
- Notice 2026-11 (issued Jan 14, 2026) gives interim guidance; removes the prior requirement that property be placed in service before Jan 1, 2027, consistent with 100% being permanent; taxpayers may rely on it pending proposed regs expected to track Reg. 1.168(k)-2 — [BDO](https://www.bdo.com/insights/tax/irs-issues-interim-guidance-on-bonus-depreciation-rules); [EY Tax News](https://taxnews.ey.com/news/2026-0250-irs-issues-interim-guidance-on-bonus-depreciation); [PwC](https://www.pwc.com/us/en/tax-services/publications/insights/assets/pwc-bonus-depreciation-guidance-provides-familiar-rules.pdf)
- Some states (e.g., Wisconsin) do not conform to federal bonus depreciation — [search summary of BDO/others](https://www.bdo.com/insights/tax/one-big-beautiful-bill-act-expands-100-depreciation-expensing-opportunities)
- Conflict noted: one secondary source described 100% bonus as limited to property placed in service before Jan 1, 2030; IRS Pub 946/527 and Notice 2026-11 coverage describe it as permanent — treat the 2030 claim as unreliable — [BDO](https://www.bdo.com/insights/tax/one-big-beautiful-bill-act-expands-100-depreciation-expensing-opportunities) vs. [IRS Pub 946](https://www.irs.gov/publications/p946)

**Section 179**
- IRC 179(b)(1)/(b)(2): $2,500,000 limit, reduced dollar-for-dollar above $4,000,000 of 179 property placed in service, for tax years beginning after Dec 31, 2024; inflation-indexed — [26 U.S.C. 179 (LII)](https://www.law.cornell.edu/uscode/text/26/179)
- 2025: $2,500,000 / $4,000,000 phase-out; 2026: $2,560,000 / $4,090,000 phase-out (SUV limit $31,300 / $32,000) — [IRS Pub 946 (2025)](https://www.irs.gov/publications/p946)
- 179(d)(1): section 179 property must be acquired by purchase "for use in the active conduct of a trade or business" and excludes property described in 50(b) "other than paragraph (2) thereof" — i.e., the 50(b)(2) lodging exclusion no longer applies — [26 U.S.C. 179 (LII)](https://www.law.cornell.edu/uscode/text/26/179)
- Since TCJA, landlords can use 179 for personal property in rental units (appliances, carpets, drapes, blinds); buildings and structural improvements remain ineligible; trade-or-business status matters (secondary sources, some outdated/conflicting) — [Nolo](https://nolo.com/legal-encyclopedia/section-179-expensing-rental-property-owners-deduct-long-term-asset.html); [Intuit ProConnect community](https://accountants.intuit.com/community/tax-talk/discussion/section-179-depreciation/00/48060)
- 179(e) "qualified real property" = qualified improvement property under 168(e)(6) plus roofs, HVAC, fire protection/alarm, and security systems on **nonresidential** real property placed in service after the building — [26 U.S.C. 179 (LII)](https://www.law.cornell.edu/uscode/text/26/179)

**Cost segregation**
- Reclassifying building components into shorter MACRS classes (e.g., via cost segregation study) can make them separate units of property for repair/improvement analysis — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations)

### Inferences
- Because 27.5-year residential property itself is not bonus-eligible (168(k) generally requires a recovery period of 20 years or less — statutory rule, not re-fetched this session), the post-OBBBA value for multifamily comes from cost segregation that carves out 5-, 7- and 15-year components (appliances, carpet, cabinetry, site work, parking, landscaping), which then get 100% bonus if acquired after Jan 19, 2025. The app should record **acquisition date** and **placed-in-service date** separately on every fixed asset, because the bonus rate depends on both.
- Fixed-asset register fields: property_id, asset_class (27.5 / 15 / 7 / 5 / land / non-depreciable), UOP bucket, cost, acquisition_date, placed_in_service_date, source bill_line_ids, bonus_elected / 179_elected flags, disposal_date. Depreciation calculation can be deferred (export to CPA) — store data first.
- Section 179 for multifamily owners is narrower than headlines suggest: qualified real property (roofs/HVAC) only covers nonresidential property, and the active-trade-or-business requirement may exclude many passive owners. Bonus depreciation is the more broadly applicable tool for unit personal property.

### Gaps
- Pub 946 recovery-period tables (7-year examples, qualified improvement property detail) were beyond the fetched portion; 7-year property examples for multifamily (e.g., office furniture) are uncited.
- Exact bonus eligibility text (168(k)(2) 20-year limit) and Notice 2026-11 primary text were not fetched; relied on Big 4 summaries.
- Section 179 taxable-income limitation (179(b)(3)) and whether rental activities qualify as active trade or business for 179 were not verified from primary sources.

---

## 4. 1099 reporting (NEC vs. MISC, W-9, 2026 thresholds, TIN matching, backup withholding, PM-to-owner 1099-MISC, 1099-K)

### Takeaway
For payments made in calendar 2026 (filed early 2027), OBBBA sec. 70433 raised the 1099-NEC and most 1099-MISC thresholds (incl. rents, box 1) from $600 to $2,000, indexed from 2027; attorney gross proceeds stays $600 and royalties $10. Property managers report rents they pass to owners on 1099-MISC box 1. Card and third-party-network payments are excluded from 1099-NEC/MISC (reported by the processor on 1099-K, whose threshold reverted to >$20,000 and >200 transactions). Backup withholding is 24% when a payee fails to provide a correct TIN.

### Cited Findings
- 2026 instructions (Rev. 12/2026) apply to 2026 information returns; $2,000 threshold for 1099-MISC rents (box 1), other income (box 3), medical/health care (box 6), crop insurance (box 9) and 1099-NEC nonemployee compensation (box 1a); "may be adjusted for inflation beginning in calendar year 2027" — [IRS Instructions for Forms 1099-MISC and 1099-NEC](https://www.irs.gov/instructions/i1099mec)
- $600 still applies to gross proceeds paid to an attorney (1099-MISC box 10) and cash fish purchases; $10 for royalties (box 2) and substitute payments (box 8) — [IRS i1099mec](https://www.irs.gov/instructions/i1099mec)
- Statutory basis: OBBBA sec. 70433 (P.L. 119-21) amended IRC 6041 for payments made after Dec 31, 2025; tax year 2025 still uses $600 — [CPA Practice Advisor](https://cpapracticeadvisor.com/2025/07/30/one-big-beautiful-bill-act-changes-1099-thresholds/165863/); [Patriot Software](https://www.patriotsoftware.com/blog/accounting/1099-reporting-threshold/)
- Payments to corporations generally exempt, except attorneys' fees/legal services, medical and health care payments, substitute payments, attorney gross proceeds, cash fish purchases, and federal executive agency payments for services — [IRS i1099mec](https://www.irs.gov/instructions/i1099mec)
- Rent paid to a real estate agent or property manager is generally not reported by the payer (tenant); the agent/manager reports rent paid to the owner on Form 1099-MISC box 1 — [IRS i1099mec](https://www.irs.gov/instructions/i1099mec)
- Payments made by credit card or through third-party payment networks are reported on Form 1099-K by the payment settlement entity, not on 1099-MISC/NEC — [IRS i1099mec](https://www.irs.gov/instructions/i1099mec)
- Deadlines: 1099-NEC furnish and file by January 31; 1099-MISC furnish by January 31, file by Feb 28 (paper) / March 31 (electronic); weekend/holiday rolls to next business day — [IRS i1099mec](https://www.irs.gov/instructions/i1099mec)
- 1099-K: OBBBA retroactively reinstated the pre-ARPA threshold — TPSOs report only when gross payments exceed $20,000 **and** transactions exceed 200; threshold is per TPSO; states may set lower thresholds; absence of a 1099-K does not make income non-taxable — [IRS newsroom IR-2025-107](https://irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000)
- Payment-card transactions (merchant acquirers) have no de minimis federal threshold (secondary source) — [Millan CPA](https://millancpa.com/insights/form-1099-k-changes-for-2025-what-businesses-and-sellers-must-know)
- Backup withholding rate is 24%; applies (BWH-B) when payee did not give the payer a correct TIN; covered payments include nonemployee compensation (1099-NEC), attorney fees, rents (1099-MISC), attorney gross proceeds, and 1099-K payment card/TPSO transactions; real estate transactions are excluded — [IRS Backup Withholding](https://www.irs.gov/businesses/small-businesses-self-employed/backup-withholding)
- B-notice process: CP2100/CP2100A notices flag name/TIN mismatches; first B-notice typically cured by a new signed W-9; second B-notice requires IRS validation (e.g., SSA card or Letter 147C) per secondary sources; sources disagree on exact response windows — [1099fire](https://www.1099fire.com/blog/key-components-of-a-b-notice/); [Resourceful Finance Pro](https://www.resourcefulfinancepro.com/articles/spring-b-notice-season/)
- TIN Matching returns per name/TIN pair codes (0 = match; 3 = name and/or TIN mismatch) (secondary) — [Resourceful Finance Pro](https://www.resourcefulfinancepro.com/articles/spring-b-notice-season/)
- Conflict: an OnPay article updated Jan 27, 2026 still said $600 applies; it appears to describe tax year 2025 — superseded by IRS 2026 instructions — [OnPay](https://onpay.com/insights/1099-reporting-threshold-updates/) vs. [IRS i1099mec](https://www.irs.gov/instructions/i1099mec)

### Inferences
- Vendor table needs: legal_name, dba, tin_type (SSN/EIN), tin (encrypted), entity_type (individual/sole prop/LLC-disregarded/partnership/C corp/S corp — corps exempt except attorney/medical), is_attorney, w9_received_date, w9_file, tin_match_status, backup_withholding_flag, default_1099_box (NEC-1, MISC-1 rents, MISC-10 attorney proceeds, none).
- 1099 aggregation per vendor per payer TIN per calendar year (cash basis, by payment date, not bill date), **excluding** payments whose method is credit card / TPSO. Threshold constant by year: 2025 = $600, 2026 = $2,000, 2027+ = inflation-adjusted (make it a lookup table, not a constant).
- If backup_withholding_flag is set, a payment run should withhold 24% to a liability account (remitted on Form 945 — Form 945 not confirmed on the fetched IRS page).
- Property-manager mode: the PM entity issues 1099-MISC box 1 to each owner for gross rents collected on their behalf (>= $2,000 in 2026). Owner TIN/W-9 must be captured on the owner record, same as vendors.
- 1099-K for online rent: under the federal rule, a landlord receiving rent via a TPSO (e.g., P2P app) only gets a 1099-K above $20,000 and 200 transactions per platform; rent processed as card payments by a merchant acquirer has no threshold. Reconciliation risk: the app should be able to report gross rent by payment rail so owners can reconcile 1099-K gross amounts (which include fees/refunds) to books.

### Gaps
- Who must file vendor 1099s when a PM pays vendors from an owner's trust account (PM under its own TIN vs. as agent under owner TIN) was not resolved from primary sources.
- Whether parts/materials bundled with repair labor are reported in 1099-NEC box 1 was not confirmed in the fetched portion of the instructions (generally yes when part of a service payment — unverified).
- Whether rent paid through payment apps is "payment for goods or services" for 1099-K purposes was not addressed by the IRS FAQ excerpt retrieved.
- Primary source for TIN Matching program mechanics (Pub 2108A) and B-notice deadlines (Pub 1281) not fetched.

---

## 5. Property manager / owner flows (management fees, contributions, distributions, owner statements, reserves)

### Takeaway
PM accounting is trust accounting: owner money is segregated from the manager's operating cash with a per-owner (per-property) sub-ledger. Cash in = rent + owner contributions; cash out = vendor bills + management fee + owner distributions; a reserve (minimum cash balance) is held back before distribution. Owner statements show beginning balance, income, expenses, management fee, reserve, distribution, and an ending balance that must tie to the trust bank account. Rules are state-law-driven; sources are mostly vendor blogs.

### Cited Findings
- Trust accounting = holding owner funds separately from the manager's operating funds with a distinct, traceable balance per owner; most states require trust accounting, monthly reconciliations and timely owner payouts (vendor blog) — [Rentvine](https://www.rentvine.com/blog/no-more-fines-the-simple-guide-to-trust-accounting-for-property-managers)
- Owner distributions = amounts sent to owners after collecting rent and covering property expenses — [Buildium](https://www.buildium.com/blog/owner-distributions-for-property-managers/)
- Owner contributions (for maintenance or capital projects) are inflows tracked separately from rental income because they affect owner statements and tax reporting — [Buildium](https://www.buildium.com/blog/owner-distributions-for-property-managers/)
- An up-front reserve paid by the owner is recorded as an owner contribution to the property ledger; reserve shown on owner statement, optionally as a secondary balance net of reserve — [Rentec Direct help](https://help.rentecdirect.com/article/155-managing-reporting-property-reserves)
- Management fee is deducted from collected rent before distribution (worked example uses 8% of collected rent) — [Taxstra close guide](https://taxstra.com/downloads/accounting/property-management-close)
- Owner statement lists reserve balance, net distribution with date and method, and an ending balance that should match the trust account — [TenantCloud owner statement](https://support.tenantcloud.com/en/articles/12314630-owner-statement)
- Management fees are a Schedule E deduction category for the owner (see Q7) — [IRS Pub 527](https://www.irs.gov/publications/p527)

### Inferences
- Owner-level ledger model: `owners` (with W-9/TIN), `ownerships` (owner_id, property_id, pct), `owner_ledger_entries` (type: contribution / distribution / mgmt_fee / reserve_change; amount; date). Property cash available to distribute = trust cash attributable to property - unpaid approved bills - reserve requirement - security deposits held.
- Management fee calc: configurable per property (pct of collected income, flat, or greater-of); base should be **collected** rent, excluding security deposits and owner contributions; post as a bill payable to the PM entity so it flows through the same AP and shows on the owner statement.
- Security deposits are liabilities, not income (Pub 527: not income when received if intended to be returned — see Q7 sources), so they must be excluded from distributable cash and fee base.
- This repo's README scopes out "online payment processing" and "public owner portals"; owner statements as a generated report (PDF/CSV) fit scope, distributions can be recorded (not executed).

### Gaps
- State trust-accounting rules (commingling prohibitions, reconciliation frequency, interest on deposits) vary and were not researched (out of federal scope).
- No primary/regulatory source on standard management-fee base definitions; industry practice only.

---

## 6. Replacement reserves and escrows for capital needs

### Takeaway
Agency lenders require a replacement reserve escrow funded monthly; Fannie Mae's Multifamily Guide cites a floor of $250 per unit per year (higher if the Property Condition Assessment calls for it), with servicer ability to adjust deposits after inspection/new PCA. HUD and state housing programs have their own figures. Reserve draws reimburse approved capital work, which ties directly to the AP/capex tagging above.

### Cited Findings
- Fannie Mae Multifamily Guide glossary / Section 406 "Replacement Reserve" references $250 per unit per year — [Fannie Mae MF Guide (PDF)](https://mfguide.fanniemae.com/fnmf-pdf/download/3416)
- Fannie Mae Guide section listing $300/unit/yr (no skilled nursing units) and $450/unit/yr (any skilled nursing units) — context (which product) not confirmed — [Fannie Mae MF Guide Section 505](https://mfguide.fanniemae.com/node/3546)
- Reserve must equal at least $250/unit/yr or a higher amount if the PCA calls for it (secondary summary) — [legalclarity.org](https://legalclarity.org/replacement-reserves-purpose-calculation-requirements/)
- Servicer may increase monthly reserve deposits based on an inspection or new PCA with at least 30 days' written notice (per search excerpt of Fannie Guide) — [Fannie Mae MF Guide](https://mfguide.fanniemae.com/fnmf-pdf/download/3546)
- HUD comparable guidance typically $200-$300 per unit per year (secondary) — [hud.loans](https://hud.loans/hud-loans-blog/what-is-a-capital-needs-assessment)
- California HCD requires a minimum replacement reserve balance of $1,000 per unit for its programs (state program rule, not agency lender) — [CA HCD AN16-02](https://www.hcd.ca.gov/sites/default/files/docs/grants-and-funding/an16-02-replacement-reserve-guidelines.pdf)

### Inferences
- Model reserves as balance-sheet escrow assets per property (`reserve_accounts`: property_id, type: replacement/tax/insurance, required_monthly_deposit, current_balance, holder: lender/owner). Monthly deposit = units x per-unit-per-year / 12 (default $250, override from loan docs/PCA).
- A "reserve draw request" should bundle paid capex bill lines (from Q1/Q2 tagging) with invoices and lien waivers — capex tags on bill lines become the evidence pack for lender reimbursement.
- Tax/insurance escrows held by lenders: payments made from escrow are still deductible taxes/insurance for the owner when paid by the lender; the app should record them as expense with a "paid from escrow" source (inference — not verified against IRS text this session).

### Gaps
- Exact current Fannie Mae Section 406 text and Freddie Mac / HUD (MAP Guide, Handbook 4350.1) reserve rules were not fetched directly; figures above come from search excerpts.
- Tax treatment of reserve deposits (not deductible until spent) was not verified from IRS sources this session.

---

## 7. Schedule E categories and GL mapping for small landlords

### Takeaway
Schedule E Part I reports per property (columns A-C, more via additional schedules): line 3 rents, line 4 royalties, expense lines 5-19, line 20 total. A GL chart of accounts for small landlords should carry a `schedule_e_line` attribute on each income/expense account so a per-property Schedule E worksheet can be generated directly. Capital items never map to an expense line; they flow through depreciation (line 18, via Form 4562).

### Cited Findings
- Pub 527 common rental expense categories: advertising, auto and travel, cleaning and maintenance, commissions, depreciation, insurance, other interest, legal and professional fees, local transportation, management fees, mortgage interest, points, rental payments, repairs, taxes, utilities — [IRS Pub 527 (2025)](https://www.irs.gov/publications/p527)
- Schedule E (2025) instructions: line 3 rents received (incl. FMV of property/services received in lieu of money; separate column per property); line 4 royalties; line 6 auto and travel (actual or standard mileage — 70 cents/mile for 2025; parking/tolls included); line 10 legal and other professional fees (tax prep fees here; legal fees to defend/perfect title capitalized); line 12 mortgage interest paid to banks/financial institutions (Form 1098), points deducted over loan life; line 13 other mortgage interest; line 14 repairs (improvements capitalized/depreciated); line 18 depreciation (Form 4562; land not depreciable); line 19 other; line 20 total — [IRS Instructions for Schedule E](https://www.irs.gov/instructions/i1040se)
- More than three properties: attach additional Schedules E; lines A, B and 23a-26 completed on only one with combined totals — [IRS i1040se](https://www.irs.gov/instructions/i1040se)
- Line 2: fair rental days and personal use days; dwelling treated as a home if personal use exceeds the greater of 14 days or 10% of fair rental days; rentals under 15 days are not reported — [IRS i1040se](https://www.irs.gov/instructions/i1040se)
- Security deposits: not income when received if intended to be returned; amounts kept for tenant breach are income that year; deposit applied to final rent is advance rent — [IRS Pub 527](https://www.irs.gov/publications/p527)
- Advance rent is income in the year received regardless of period covered or accounting method — [IRS Pub 527](https://www.irs.gov/publications/p527)
- Expenses paid by tenant (on landlord's behalf) are rental income, and deductible if they are deductible rental expenses — [IRS Pub 527](https://www.irs.gov/publications/p527)

### Inferences
- Default GL -> Schedule E mapping (line numbers 5, 7, 8, 9, 11, 15, 16, 17 are from the Schedule E form face as commonly published; the fetched instruction text confirmed 3, 4, 6, 10, 12, 13, 14, 18, 19, 20 only):
  - 4000 Rental income -> line 3; 4100 Late fees / pet / parking / utility reimbursement -> line 3; 4900 Forfeited security deposits -> line 3; 2200 Security deposits held -> balance sheet (no line); 2210 Prepaid rent -> balance sheet for books, but taxable when received (book/tax difference)
  - 6100 Advertising / marketing -> line 5
  - 6150 Auto & travel / mileage -> line 6
  - 6200 Cleaning & janitorial, landscaping, turnover cleaning, pest control -> line 7 (Cleaning and maintenance)
  - 6250 Leasing commissions / locator fees -> line 8 (Commissions)
  - 6300 Property & liability insurance -> line 9
  - 6350 Legal, accounting, tax prep -> line 10 (title defense / acquisition legal -> capitalize)
  - 6400 Management fees -> line 11
  - 7100 Mortgage interest (Form 1098 lenders) -> line 12; 7110 Other interest -> line 13; loan points/fees -> amortize
  - 6500 Repairs (labor + materials, de minimis items) -> line 14
  - 6550 Supplies -> line 15
  - 6600 Real estate taxes, licenses/registration fees -> line 16
  - 6700 Water/sewer/trash, electric, gas (owner-paid) -> line 17 (Utilities)
  - 6800 Depreciation (computed, from fixed-asset register) -> line 18
  - 6900 Other: HOA dues, bank fees, software, telephone, etc. -> line 19
  - 1500-series Fixed assets / CIP (building, building systems, 5-yr personal property, 15-yr land improvements), 1600 Retainage-related CIP -> no Schedule E line (depreciation only)
- Generate Schedule E worksheet per property per calendar year on a **cash basis** by default (most individual landlords), with a toggle for accrual; flag book/tax differences (prepaid rent, de minimis election).
- Multifamily owners with entities (LLC/partnership) file Form 8825 rather than Schedule E; the same line-tag approach generalizes (inference; Form 8825 not researched).

### Gaps
- Exact line titles for lines 5, 7, 8, 9, 11, 15, 16, 17 were not in the fetched instruction text (the fetch tool returned a partial table); confirm against the 2025/2026 Schedule E form face.
- Rev. Proc. 2019-38 QBI rental real estate safe harbor (250 hours) not covered by the fetched content.
- 2026 Schedule E instructions not yet retrieved (2025 edition used); standard mileage rate for 2026 not verified.
