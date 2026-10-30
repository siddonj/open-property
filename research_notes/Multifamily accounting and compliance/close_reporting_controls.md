# Multifamily Month-End Close, Internal Controls, and Standard Financial Reports (US, 2026)

Research date: 2026-10-29. Primary sources read in full: Fannie Mae Multifamily Selling & Servicing Guide §503 (effective 10/26/2026), Freddie Mac Multifamily Seller/Servicer Guide Ch. 40 (Bulletin update 08/25/26), Freddie Mac PRS CREFC Desk Reference (July 2026), and the IRS record-retention page. Practitioner and vendor sources were used for the close checklist, controls, and box-score definitions. Their status as secondary sources is noted where it matters.

Note on the Freddie Mac PRS CREFC Desk Reference: the PDF is publicly downloadable from mf.freddiemac.com, but its footer says "July 2026 | NONPUBLIC". Cite it for internal design only, and do not republish it.

---

## 1. Standard month-end close checklist for a multifamily property

### Takeaway
The vendor and practitioner checklists use the same sequence:
1. Finish resident and lease activity: move-ins, move-outs, renewals, month-to-month conversions, rent increases.
2. Post charges, receipts, credits, late fees and write-offs.
3. Reconcile subledgers to the GL: AR aging to the AR control account, prepaids to the prepaid-rent liability, and the deposit activity report to the deposit liability on both the cash and accrual trial balances.
4. Reconcile every bank account.
5. Validate and post GPR and gain/loss-to-lease.
6. Book accruals.
7. Run and archive the reporting package.
8. Close (lock) the period last.

No authoritative standard-setter publishes a multifamily close checklist. The items below come from PMS-consultant checklists (Yardi/MRI) and common practice.

### Cited Findings
- **Pre-close resident activity (Yardi):** clear all resident exceptions, verify month-to-month charges, finalize move-ins and move-outs, complete deposit accounting, enter lease renewals and MTM conversions, and record rent increases and write-offs. Confirm all financial activity is posted before closing. — [REdirect Consulting, Yardi Year-End Close Checklist 2026](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- **Bookkeeping review:** run "Receivable Detail by Charge Code" to find negative charges, misapplied credits and improper reversals. Then apply outstanding credits, run the late-fee function, and complete all bank reconciliations. — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- **AR and prepaid tie-out:** print the accrual Trial Balance and the Aged Receivables report.
  - The aged receivables total must equal the TB receivable balance.
  - The prepaid total must equal the prepaid-rent liability.
  - Investigate any mismatch before closing.
  — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- **Security deposit reconciliation:** use the Security Deposit Activity Report with both the accrual and the cash trial balance.
  - Deposit *charges* must match the accrual deposit balance.
  - Deposit *receipts* must match the cash deposit balance.
  — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- **GPR validation:** review the "GPR Gain/Loss to Lease" report for vacancy amounts, loss-to-lease credits and zero potential-rent values. Post GPR only after it is validated. — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- **Report archive (year-end, Yardi):** retain the following reports:
  - Aged Receivables and Paying Aging Summary
  - Security Deposit Activity
  - Rent Roll
  - GPR Gain/Loss to Lease
  - Trial Balance (Accrual and Cash)
  - Daily Activity
  - Transaction Exceptions
  - Receipt Register, Charge Register, NSF Register and Write-Off reports

  — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- **Year-end extra:** after closing the year, verify the tax IDs and addresses of the management company, owners, bank accounts and vendors, then prepare 1099s. — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- **Tie receipts to the rent roll:** compare the receipts journal to gross potential rent, using a rent roll pulled as of the last day of the month. Month-to-month conversions after lease expiration are a common rent-roll error, because systems keep the original end date. — [Manifestly Monthly Financial Reporting Checklist](https://app.manifest.ly/public/checklists/5242f0a2ee7218f4e0d4080a280c3bb8); [Manifestly Rent Roll Audit Checklist](https://app.manifest.ly/public/checklists/6e97bc2ff58e3a0af191c4843bd1da45?modal=true)
- **Sequencing:** close the GL last, after the final reports have been run. Track pending journals and accruals early so the close is not held up. — [REdirect Consulting, MRI month-end close checklist](https://www.redirectconsulting.com/blog/mri-month-end-close-checklist-for-real-estate-teams)
- **Lender requirements that affect the close:**
  - Fannie Mae requires operating statements to reflect the property's actual physical occupancy based on the most recent quarter-end rent roll.
  - It requires actual expenses, normalized for seasonal variations and for real estate taxes, property casualty insurance, Replacement Reserves and management fees.

  So taxes and insurance should be accrued or amortized monthly, not expensed when paid. — [Fannie Mae MF Guide §503.01](https://mfguide.fanniemae.com/node/18131) (PDF: https://mfguide.fanniemae.com/fnmf-pdf/download/18131)
- **Real estate taxes in lender reporting:** report the amount due for the calendar year, not necessarily the amount disbursed in that year. Prorate it for YTD normalized reporting. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Escrow reconciliation:** Fannie Mae's annual review requires the borrower's escrow activity reconciliation, delivered within 15 Business Days of notice. — [Fannie Mae MF Guide §503.03C](https://mfguide.fanniemae.com/node/18131)
- **Reserve servicing:** at least annually, the servicer must recompute the required reserve installment amounts. Annual reserve certifications go on Form 1110M within 90 days of the servicer's fiscal year-end. — [Freddie Mac MF Guide Ch. 39](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_39.pdf)

### Inferences
These are inferred, not taken from a source.

**Implementation-ready close checklist (ordered).** Each step should be a tracked task with a preparer, a reviewer and timestamps:
1. **Cutoff.** Stop new lease and resident activity for the period: move-ins and move-outs, renewals, MTM flags, notices.
2. **Charges.** Confirm recurring rent and other charges posted for the period. Post late fees per lease and state rules. Post utility rebills, concessions and credits.
3. **Receipts.** Post every deposit batch. Clear unapplied cash. Auto-apply prepaids. Record NSF reversals.
4. **Write-offs and bad debt.** Write off move-out balances that have gone to collections. Book the bad-debt allowance if the basis is accrual.
5. **AR subledger to GL.** The aged receivables total must equal the AR control account, and the prepaid subledger must equal the prepaid-rent liability. Any difference blocks the close.
6. **Security deposits.**
   - The deposit-held subledger must equal the deposit liability account.
   - It must also tie to the trust or escrow bank balance where the state requires segregation.
   - Move-out deposit dispositions must be posted within the statutory window.
7. **Bank reconciliations.** Reconcile every operating, deposit, reserve and escrow account. The reconciled book balance must equal the GL. Review outstanding items older than 60–90 days.
8. **AP and accruals.**
   - Accrue unbilled utilities and services received but not invoiced.
   - Accrue or amortize property tax and insurance.
   - Accrue the management fee, usually a percentage of collected or effective gross income.
9. **Prepaids and amortization.** Amortize prepaid insurance and service contracts.
10. **Fixed assets.** Capitalize capex according to the capitalization policy. Post monthly depreciation and amortization of loan costs.
11. **Reserves and escrows.** Reconcile the replacement-reserve and tax/insurance escrow balances to the lender or servicer statements.
12. **GPR reconciliation.** Validate the potential-rent schedule. Then post GPR, gain/loss to lease, vacancy loss and concessions.
13. **Reporting package.** Run the trial balance (cash and accrual), income statement vs budget, balance sheet, rent roll, aged receivables, deposit activity, bank recs, GL detail and the owner statement.
14. **Review and sign-off.** The reviewer approves each reconciliation, and variances above a threshold need comments.
15. **Close/lock the period.** After the lock, block postings dated in that period. Corrections post to the open period.

### Gaps
- No primary-standard (IREM, NAA or AICPA) multifamily close checklist was found online. IREM's materials appear to be paywalled course content.
- No source gave specific close-day targets (for example, "close by business day 5").

---

## 2. Standard reports and exact definitions

### Takeaway
Lenders expect a T-12 or YTD operating statement and a rent roll:
- Fannie Mae uses Form 4254, analyzed per Form 4254.DEF.
- Freddie Mac uses the CREFC OSAR and NOIWS templates.

The lender income waterfall runs:

**GPR ± gain/loss to lease − vacancy − concessions − bad debt = net rental income; + other income = EGI; − operating expenses = NOI; − capex/replacement reserves = NCF; DSCR = NOI/DS and NCF/DS.**

Depreciation, debt service, capex and owner or personal expenses are excluded from operating expenses.

### Cited Findings

#### Rent roll fields (Freddie Mac's definition for lender reporting)
A Borrower-certified document containing:
- (a) tenant name
- (b) unit number or other physical identification
- (c) contract rent
- (d) lease start date
- (e) lease end date
- (f) commercial units, where applicable
- (g) market rent: required for vacant units, and for occupied units as available
- (h) subsidy amount
- (i) past-due balance
- (j) additional fees or charges (pet, utilities, etc.)
- (k) unit type
- (l) unit size

Items (h)–(l) are "as available". — [Freddie Mac MF Guide Ch. 40 §40.2(a)(4)](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)

Freddie Mac also requires the rent roll to state the number of units accurately and to disclose gross potential rents and actual leased rents within a **7.5% tolerance**. — [Freddie Mac MF Guide Ch. 5](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_5.pdf) (from search excerpt; not re-read in full)

#### Box score / unit availability (Yardi-style definitions, from an Infor AMSI help site)
- Vacant Leased = units with status Vacant Leased, excluding Down units.
- Vacant Not Leased = Vacant Available + Vacant Pending, excluding Down units.
- Total Vacant = Vacant Leased + Vacant Not Leased.
- Notice Leased and Notice Not Leased are counted the same way, excluding Down units.
- Occupied = Occupied + Notice Available + Notice Pending + Notice Leased. % Occupancy = Occupied ÷ total units.
- Available to Rent = (Vacant − Vacant Not Available) + (Notice − Notice Not Available).

— [AMSI Weekly Boxscore Tab](https://amsiaws.saas.infor.com/AMSIWEBG001/Areas/eSite/help/weekly_boxscore_tab.htm); [AMSI Weekly Boxscore Report Overview](https://amsiaws.saas.infor.com/AMSIWEBG001/Areas/eSite/help/weekly_boxscore_report_overview.htm). This is not Yardi's own documentation. Treat it as the industry-standard status taxonomy.

#### Physical occupancy for lenders
- Report rent-roll occupancy, not vacancy, together with the rent-roll date. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- The Freddie Mac Mid-Year Rent Schedule asks for the physical occupancy % and "total actual rent received for occupied units; no income should be counted for vacant units." — [Freddie Mac MF Guide Ch. 40 §40.2(a)(3)](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)

#### Economic occupancy
- Economic Occupancy = Actual Rent Collected ÷ Gross Potential Rent × 100. GPR means every unit leased at market rent with every resident paying in full. — [HelloData](https://www.hellodata.ai/help-articles/how-to-calculate-economic-occupancy); [Rentana glossary](https://www.rentana.io/glossary/economic-occupancy)
- Sources disagree on whether loss-to-lease reduces economic occupancy. Several vendor glossaries count it as a leak; Fannie Mae treats gain/loss to lease as an adjustment to GPR. — [HelloData](https://www.hellodata.ai/help-articles/how-to-calculate-economic-occupancy); contrasted with Fannie Mae Form 4254.DEF (search excerpt only; the PDF returned 403)
- Concessions are rent discounts, such as one month free on a 12-month lease. Bad debt is billed rent on an occupied unit that is never collected and is written off. This is different from vacancy loss. — [Findigs](https://www.findigs.com/blog/economic-occupancy); [rets.ai bad debt](https://rets.ai/glossary/bad-debt)

#### Lender income-line coding (Freddie Mac / CREFC)
- **Gross Potential Rent:** classify loss/gain to lease and short-term premiums in GPR. Do not net apartment allowances (employee units) or non-revenue units against GPR; report them in Payroll & Benefits and G&A respectively. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Vacancy:** enter as negative amounts.
  - If the borrower reports vacancy, include concessions and collection loss/bad debt in Vacancy.
  - Otherwise, report net rental income in Base Rent.

  Freddie Mac notes that putting bad debt in Vacancy "differs from current CREFC requirements." A template with data in GPR, Vacancy *and* Base Rent will be rejected. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Other Income:**
  - It must be likely to continue, common in the market, legal and related to property operations.
  - Eliminate delinquent rent, whether outstanding or paid.
  - Include reimbursed expenses such as heat, water/sewer, electric and repairs and maintenance.
  - Include commercial income net of vacancy and collection loss.

  — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Effective Gross Income (Fannie Mae glossary):** "the Property's total Net Rental Income, plus commercial income, plus other income." — [Fannie Mae MF Guide §503 Glossary](https://mfguide.fanniemae.com/node/18131)

#### Expense-line coding (Freddie Mac / CREFC)
- **Repairs & Maintenance:** exclude personal and non-property expenses. Move capex buried in R&M into Capital Expenditures. Classify maintenance payroll as Payroll & Benefits. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Management fee:** use the higher of the borrower's actual fee or the underwritten fee (as % of EGI). Never reduce the actual fee to match the underwritten one. Include asset management fees if they relate to operating the property. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Professional Fees:** legal and accounting. **G&A:** includes lost income from office and down units, plus security, leased furniture, licenses, permits and corporate-unit expenses. **Other Expenses:** must be property-related and expected to recur. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Capital Expenditures:**
  - Normalize to the underwritten Replacement Reserve: the annual amount for annual reports, prorated for quarterly reports.
  - Enter extraordinary capex as actual in the "Borrower Actual" column, then adjust it to $0 in the "Normalized" column per CREFC.

  — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Debt service:**
  - Report the actual debt service due for the period. Do not annualize debt service in the funding year.
  - Floating-rate loans: rate-cap income is excluded from other income, and replacement-cap costs are excluded from other expenses. Reported debt service equals uncapped interest + principal + replacement-cap escrow − cap income.

  — [Freddie Mac MF Guide Ch. 40 §40.2(a)(1)](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf); [Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **DSCR:** the CREFC templates compute two ratios, **DSCR (NOI/DS)** and **DSCR (NCF/DS)**. The servicer must explain any DCR below the watchlist level. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- **Items below the NOI line:** debt service, capital expenditures and depreciation are excluded from operating expenses. — [rets.ai operating statement glossary](https://rets.ai/glossary/operating-statement) (secondary source, but it matches the CREFC treatment above)

#### Variance reporting
Fannie Mae requires comments when Form 4254.DEF shows a **≥20% variance (up or down) from the same period of the prior year** in EGI, Total Operating Expenses, Capital Expenditures or DSCR, or when the loan is on the Watchlist. Comments must cover root cause, risk trends, management changes, normalization or annualization adjustments, and market data. — [Fannie Mae MF Guide §503.01](https://mfguide.fanniemae.com/node/18131)

#### OSAR structure
- The OSAR compares current financials with the **three preceding annual periods and underwriting ("At Contribution")**.
- The NOIWS has three columns: **Borrower Actual | Adjustments | Normalized**. It explains every normalization or annualization adjustment, and the Normalized column feeds the OSAR.

— [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf); [CREFC IRP v8.4](https://www.crefc.org/common/Uploaded%20files/CREFC%20IRP%20v8.4_Final.pdf)

#### Who expects which reports
- **Lenders and agency servicers:** the annual and quarterly operating statements and rent roll described in section 3.
- **Owners:** the Yardi archive list in section 1 shows the property-level package: trial balance (cash and accrual), aged receivables, rent roll, deposit activity, GPR gain/loss to lease, and receipt and charge registers. — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)

### Inferences
These are inferred and not from a cited formula source. They should be implemented as definitions and the formula shown on the report.

**Report formulas:**

| Metric | Formula |
|---|---|
| GPR | Σ market rent of all rentable units for the period (occupied at market + vacant at market) |
| Gain/Loss to lease | Σ(contract rent − market rent) for occupied units |
| Vacancy loss | Σ market rent of vacant days |
| Net rental income | GPR ± gain/loss to lease − vacancy − concessions − bad debt − non-revenue units |
| EGI | net rental income + other income |
| NOI | EGI − operating expenses. Exclude debt service, depreciation and amortization, capex, income taxes, and owner/partnership expenses. |
| NCF | NOI − replacement reserves or capex (normalized) |
| DSCR | NOI ÷ annual debt service (also NCF ÷ DS) |
| Cash-on-cash | (NCF − debt service) ÷ initial equity invested |
| Expense per unit | total opex ÷ total units, annualized |
| Revenue per occupied unit (RevPOU) | rental revenue ÷ average occupied units per month |
| Physical occupancy | occupied units ÷ total rentable units, excluding down/model units from the denominator only if policy says so (the policy must be shown on the report) |
| Economic occupancy | rental income collected (or net rental income) ÷ GPR. The report must state which convention it uses, because sources disagree. |

**GPR reconciliation.** Prove that every unit-day is accounted for:

GPR = contract rent billed on occupied units + loss/gain to lease + vacancy loss + non-revenue/model/employee units

The rent revenue posted to the GL must tie to this schedule. This follows the Yardi "GPR Gain/Loss to Lease" validation step and Freddie Mac's 7.5% GPR tolerance on rent rolls.

**Recommended report set:**
- Rent roll (as-of date)
- Box score
- Aged receivables (0–30, 31–60, 61–90, 90+, plus prepaids)
- Trial balance
- Income statement: month, YTD, T-12, budget vs actual with $ and % variance
- Balance sheet
- Cash flow statement (indirect method from the accrual books)
- GL detail
- Owner statement (cash basis: beginning cash + receipts − disbursements − owner draws = ending cash, plus reserves held)
- Security deposit activity
- Bank reconciliation report
- Lender export mapped to CREFC OSAR/NOIWS lines

### Gaps
- Fannie Mae Form 4254.DEF (exact line definitions) returned HTTP 403 and was not read. The GPR/gain-to-lease treatment comes from a search excerpt only.
- No authoritative source was found for cash-on-cash or RevPOU formulas. The formulas above are standard industry usage, not cited.
- The CREFC IRP v8.4 PDF (multifamily OSAR and NOIWS line list, Master Coding Matrix) was not read directly.
- Fannie Mae requires a "Streamlined Rent Roll (Form 4241)" dated 12/31 and due within 120 days after year-end. This appeared only in a search-result summary of an older Guide version and was **not** found in the current §503 text read (effective 10/26/2026). Verify before relying on it.

---

## 3. Lender reporting: Fannie Mae, Freddie Mac and CMBS (CREFC IRP)

### Takeaway
- **Fannie Mae** wants Form 4254 annually by **June 1** (12 months of actuals). Quarterly reports cover Q2 and Q3 at **75 days** after quarter-end (Sept 15 and Dec 15). Watchlist and seniors loans report more often.
- **Freddie Mac** wants CREFC A-CREFC-MF annual statements by **May 31** (March 31 for risk-rated or special loans). Q-CREFC is due May 31, Aug 31 and Nov 30, with a borrower-certified **T-12** and a rent roll no older than two months. Late fees run **$1,000–$5,000**, and **$25,000–$50,000** for unacceptable submissions.
- **CMBS** uses the CREFC OSAR and NOIWS.

### Cited Findings

#### Fannie Mae (§503, effective 10/26/2026)
- Submit quarterly and annual Financial Analysis of Operations reports (**Form 4254 or 4254.Seniors**) for each property, through **MAMP**. — [Fannie Mae MF Guide §503.01](https://mfguide.fanniemae.com/node/18131)
- **Quarterly due dates:**

  | Loan category | Quarters covered | Due |
  |---|---|---|
  | All Others | Q2 YTD, Q3 YTD | Sept 15, Dec 15 (75 days after quarter-end for non-12/31 FYE) |
  | Watchlist | Q1 | June 30 (90 days) |
  | Watchlist | Q2, Q3 | Sept 15, Dec 15 (75 days) |
  | Seniors Housing | every quarter, trailing 3 months | 75 days after quarter-end (June 15 / Sept 15 / Dec 15 / Mar 15) |
  | Small Mortgage Loan ≤ $6M original | none | no quarterly reporting |
  | Small Mortgage Loan > $6M | Q2, Q3 | 75 days after quarter-end |
  | Cooperative | none | no quarterly reporting |
  | Credit Facility | each quarter | Deal Level Structured Transaction Quarterly report, plus Forms 4801/4802 |

  If a due date is not a Business Day, submit the next Business Day. — [Fannie Mae MF Guide §503.02](https://mfguide.fanniemae.com/node/18131)
- **Annual:** covers the prior calendar or fiscal year.
  - Due **June 1** with **12 months of actual operating data** for 12/31 FYE properties.
  - Non-12/31 FYE: due within **150 days** of fiscal year-end.
  - First year: loans purchased on or before June 30 annualize the data and submit by June 1 of the following year. Loans purchased on or after July 1 submit 12 months of actuals by June 1 of the second year.

  — [Fannie Mae MF Guide §503.03](https://mfguide.fanniemae.com/node/18131)
- The servicer must indicate on each statement line which borrower income and expense items are included, per Form 4254.DEF. — [Fannie Mae MF Guide §503.03B](https://mfguide.fanniemae.com/node/18131)
- **Waivers:**
  - Unresponsive borrower: after 3 written requests, request a waiver 6 months after the annual due date, or at the next quarterly due date.
  - A waiver is also allowed if the loan was acquired in the current year and less than 6 months of data exists.

  — [Fannie Mae MF Guide §503.04](https://mfguide.fanniemae.com/node/18131)
- Fannie Mae runs an **Operating Statement Digitizer** for submitting operating statement and rent roll data. — [Fannie Mae Operating Statement Digitizer](https://multifamily.fanniemae.com/applications-technology/operating-statement-digitizer)

#### Freddie Mac (Ch. 40, Bulletin update 08/25/26)
- **Annual Financial = A-CREFC-MF** (multifamily) or A-CREFC-HC (seniors), prepared under the CREFC IRP and required when UPB > $250,000.
  - Due **March 31** for loans with Risk Rating > 6 or Special Product Type (except SBL).
  - Due **May 31** for all others, including SBL.

  — [Freddie Mac MF Guide Ch. 40 §40.2](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)
- **Annual submission components:**
  1. A completed A-CREFC template.
  2. The annual income and expense statement for the most recent fiscal year, **certified by the Borrower**.
  3. A **current rent roll**, certified by the Borrower and dated no more than **6 months** before the due date.

  If 12 months are unavailable, a partial year is acceptable. The assessment may be waived when there is less than 6 months of data (non-SBL) or less than 3 months (SBL). — [Freddie Mac MF Guide Ch. 40 §40.2–40.3](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)
- **Quarterly Financial = Q-CREFC-MF.**
  - **Non-SBL** (UPB > $250K, originated on or after 1/1/2003): Q2 due **Aug 31**, Q3 due **Nov 30**, plus Q1 due **May 31** for Special Product Type or Risk Rating > 6.
  - **SBL:** quarterly only when Risk Rating > 6.
  - Components: the template, a **borrower-certified trailing-12-month** property financial statement (for loans funded on or after March 1, 2014), and a borrower-certified rent roll dated no more than **2 months** before the due date.

  — [Freddie Mac MF Guide Ch. 40 §40.2, §40.4](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)
- **Mid-Year Rent Schedule (SBL loans on loan agreements dated on or after 11/08/2016):** a rent roll dated within 5 days of Q2 end, submitted by **Aug 31**. It must include the effective date, physical occupancy % and total actual rent. — [Freddie Mac MF Guide Ch. 40 §40.5](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)
- "All reporting must reflect trailing 12-month financial statements, unless indicated otherwise" (§40.15, special product types). — [Freddie Mac MF Guide Ch. 40](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)
- **Penalties paid by the servicer:**

  | Event | Penalty |
  |---|---|
  | Received in 1st month after due-date month | $1,000 |
  | Received in 2nd month | $2,500 |
  | Not received by end of 2nd month | $5,000 |
  | Unacceptable submission | $25,000 |
  | Repeat unacceptable submission | $50,000 |

  — [Freddie Mac MF Guide Ch. 40 §40.10](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)

#### CMBS (CREFC IRP)
- The IRP (v8.4, March 2024) contains the "CREFC/MBA Methodology for Analyzing and Reporting Property Income Statements" with OSAR templates for commercial, multifamily, lodging and healthcare properties. — [CREFC IRP v8.4](https://www.crefc.org/common/Uploaded%20files/CREFC%20IRP%20v8.4_Final.pdf)
- Servicers use the NOIWS "Normalized" column to update the OSAR. — [Law Insider, OSAR definition (PSA excerpts)](https://www.lawinsider.com/dictionary/operating-statement-analysis-report)

### Inferences
- The app should export a **T-12 operating statement mapped to CREFC OSAR line items**, with a three-column NOIWS: Actual | Adjustment (with a comment) | Normalized.
- It should also export a **certified rent roll** with Freddie Mac's 12 fields and an as-of date.
- Both agency programs key on a **borrower certification** of the statement and the rent roll. That points to a sign-off record (who certified, when, and which locked period) attached to each export.
- The app should store `fiscal_year_end` per property. Both agencies shift due dates for non-12/31 FYE.

### Gaps
- The Freddie Mac Ch. 5 rent-roll representations (7.5% tolerance) were read only via search excerpt.
- HUD/FHA multifamily reporting (annual audited financial statements, REAC/FASS submission) was not researched.
- The full CREFC multifamily OSAR line list was not extracted.

---

## 4. Internal controls, audit expectations and fraud patterns

### Takeaway
The core controls are:
- segregation of duties (collect, deposit, record and reconcile handled by different people; vendor setup separate from payment approval)
- tiered approval workflows
- independent review of bank reconciliations
- a complete, searchable audit trail of vendor edits, approvals and payments
- matching deposits to lease terms

Documented fraud patterns include hiding collected rent by showing occupied units as vacant, diverting tenant payments, fictitious or related-party vendors, kickbacks, and deposit-refund theft.

### Cited Findings

#### Controls
- **Vendor master:** the person who creates or changes a vendor should be different from the person who approves invoices or releases payments. Changes to vendor bank details need independent verification. Keep an audit trail for vendor edits, approvals and payment releases; a searchable trail shortens audit sampling. — [ManageCasa, AP Process for Property Managers](https://managecasa.com/articles/accounts-payable-process)
- **Three-way match:** require a PO, a vendor invoice and proof of service before payment. Require **dual sign-off on disbursements over $5,000** (a case example, not a standard). — [CLA, Protect What You've Built With Internal Controls](https://www.claconnect.com/en/resources/blogs/real-estate/protect-what-youve-built-with-internal-controls-for-property-management)
- **Using software for small teams:** use property management software to enforce approval workflows, restrict access by role, keep backups and generate audit trails. — [CLA, Build Strong PM Controls Without the Headcount](https://www.claconnect.com/en/resources/blogs/real-estate/build-strong-property-management-controls-without-the-headcount)
- **Bank reconciliations** should be independently reviewed, with outstanding items investigated. — [ManageCasa](https://managecasa.com/articles/accounts-payable-process)
- **Cash receipts:** separate the person making deposits from the person recording receipts. A NY State Comptroller audit flagged one person who invoiced, collected, deposited and recorded as a weakness, and recommended pre-numbered receipts and reviewed bank recs. — [NY OSC audit, Yates County 2019-182](https://www.osc.ny.gov/sites/default/files/state-audits/documents/pdf/2020-03/yates-co-2019-182.pdf) (public sector, not real-estate specific)
- **Practitioner fraud controls:**
  - Match rent deposits to lease terms monthly.
  - Hold deposits in a separate trust account.
  - Require dual signatures on deposit refunds and competitive bids for large repairs.
  - Red flags: deposits consistently below lease amounts, and refunds paid to names not on the lease.

  — [Steph's Books, PM fraud prevention](https://stephsbooks.com/blog/property-management-fraud-prevention) (blog; low authority)
- **Lender audit expectations:**
  - Fannie Mae requires operating statements to reconcile to physical occupancy on the quarter-end rent roll.
  - Freddie Mac penalizes any submission that "materially misrepresents, misstates or conceals information": $25K, and $50K for a repeat.

  — [Fannie Mae §503.01](https://mfguide.fanniemae.com/node/18131); [Freddie Mac Ch. 40 §40.10](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_40.pdf)

#### Fraud cases
- **Concealing collected rent:** a CT property manager submitted rent rolls showing occupied units as vacant to hide collected rent. He defrauded the owner of at least $275,000 and pleaded guilty to wire-fraud conspiracy. — [FBI New Haven press release (2014)](https://www.fbi.gov/newhaven/press-releases/2014/monroe-man-admits-role-in-rental-income-fraud-scheme)
- **Diverting rent and deposits:** a NJ manager allegedly told tenants to pay rent and deposits to his own company; $189,055 was identified. — [NJ Treasury](https://nj.gov/treasury/taxation/pdf/MoorestownPropertyManagerCharged.pdf)
- **Money-order rent theft:** a FL manager allegedly deposited tenant money orders into personal accounts; more than $100K, charged as an organized scheme to defraud. The URL references lapping and ledger manipulation in Yardi. — [CBS12](https://cbs12.com/news/crime/delray-beach-property-manager-accused-of-over-100k-rent-scheme-targeting-immigrant-renters-organized-scheme-to-defraud-palm-beach-county-jail-property-manager-arrest-money-order-fraud-tenant-rent-theft-leasing-software-yardi-lapping-scheme-ledger)
- **Fictitious vendors:** building-operations cash paid to fictitious vendors that were relatives or associates of the accounting manager. The source cites ACFE's 2008 Report to the Nation, in which the median scheme lasted about 2 years before detection (dated). — [FacilitiesNet](https://facilitiesnet.com/facilitiesmanagement/article.aspx?id=10922)

### Inferences
Inferred design requirements for the GL:
- **Immutable posted journal entries.**
  - Posted entries are never edited or deleted.
  - Corrections are made by a reversing entry plus a new entry, both linked to the original (`reverses_entry_id`).
  - Drafts are editable until posted.
  - Every entry must balance (Σdebits = Σcredits) as a DB-level or transactional invariant.
- **Period lock.**
  - Statuses: open → soft-closed (accountant only) → hard-closed (no postings).
  - Posting dates in a closed period are rejected.
  - Reopening requires an elevated role, a reason, and an audit event.
- **Append-only audit log** covering: actor, timestamp, entity, before/after values, IP, and the approval chain. Cover vendor master changes (bank account changes especially), user role changes, charge and credit adjustments, write-offs, deposit dispositions and period reopen.
- **SoD rules the app can enforce:**
  - The creator of a vendor cannot approve that vendor's invoices.
  - An invoice's enterer cannot be its approver.
  - Payment release needs an approver who is not the invoice enterer, with a dollar threshold for dual approval.
  - The preparer of a bank rec cannot be its reviewer.
  - A user who posts receipts cannot also post rent write-offs or concessions without approval.
- **Fraud analytics to surface:**
  - occupied-per-lease units shown as vacant on the rent roll (the CT pattern)
  - units with receipts but vacant status
  - concessions or write-offs by user
  - vendors sharing an address, bank account or tax ID with an employee
  - refunds paid to a name different from the lease holder
  - receipts deposited later than X days
  - manual credits after the lock date (blocked)

### Gaps
- No AICPA, COSO or IREM primary document on property-management internal controls was retrieved.
- No current ACFE Report to the Nation (2024/2026) real-estate statistics were retrieved.
- State trust-account rules for security deposits and management-company trust accounting (for example, state real-estate commission rules) were not researched. They vary by state and are likely covered by another researcher.

---

## 5. Basis of accounting: cash vs accrual

### Takeaway
Multifamily systems keep both bases at the same time. Yardi's close uses both an accrual and a cash trial balance, and the deposit reconciliation explicitly ties to each. Lender reporting is effectively accrual-like: actual expenses normalized for taxes, insurance, reserves and fees, and taxes reported on an amount-due basis.

### Cited Findings
- The close tie-outs use the "Trial Balance (Accrual)" for AR and prepaids, and **both** accrual and cash trial balances for security deposits (charges to accrual, receipts to cash). The year-end archive keeps the TB in both Accrual and Cash. — [REdirect Consulting](https://www.redirectconsulting.com/blog/yardi-year-end-close-checklist-2026-step-by-step-month-year-end-process)
- Fannie Mae requires actual expenses normalized for seasonality, real estate taxes, insurance, Replacement Reserves and management fees. — [Fannie Mae §503.01](https://mfguide.fanniemae.com/node/18131)
- Freddie Mac/CREFC: report real estate taxes as the amount due for the calendar year, which is "not always the amount disbursed in the calendar year". Eliminate delinquent rent from other income. — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)

### Inferences
- Implement a single GL where each journal line carries a flag: `basis IN ('cash', 'accrual', 'both')`.
  - Charges, accruals and depreciation are accrual-only.
  - Receipts and payments hit both bases, or the cash basis is derived from the receipt and payment dates of AR/AP applications.
  - Run reports with a basis parameter.
- **Owner statements** are typically cash basis.
- **Lender and investor packages** are accrual or normalized.
- Tax books are often cash basis for small owners.

### Gaps
- No authoritative source was found stating how often owners or investors require cash vs accrual. The practice described above is inferred from vendor workflows.

---

## 6. Budgeting and reforecasting

### Takeaway
The searches returned no authoritative multifamily budgeting standard. The only lender-sourced budget item is the reserve schedule: Freddie Mac requires annual recomputation of reserve installments. Fannie Mae and Freddie Mac compare actuals to prior periods and to underwriting rather than to the owner's budget.

### Cited Findings
- **Fannie Mae variance trigger:** a 20% year-over-year variance in EGI, OpEx, CapEx or DSCR requires commentary, including the borrower or manager's plan to improve cash flow if the property is underperforming its original underwriting. — [Fannie Mae §503.01](https://mfguide.fanniemae.com/node/18131)
- The OSAR compares the current period with the three prior annual periods and with underwriting ("At Contribution"). — [Freddie Mac PRS CREFC Desk Reference](https://mf.freddiemac.com/docs/prs_crefc_desk_reference_guide.pdf)
- At least annually, the servicer must recompute the required reserve installment amounts. — [Freddie Mac MF Guide Ch. 39](https://mf.freddiemac.com/docs/chapters/mf_guide_ch_39.pdf)

### Inferences
- **Budget model:** `budget(property_id, fiscal_year, version, account_id, period(1–12), amount)` with versions such as Original, Reforecast Q1–Q3 and Approved.
- **Typical structure:**
  - revenue built from unit mix × market rent × projected occupancy, less loss-to-lease, concessions and bad debt
  - other income
  - controllable opex: payroll, R&M, turnover/make-ready, marketing, admin
  - non-controllable opex: taxes, insurance, utilities, management fee as % of EGI
  - capex and reserves
  - debt service
- **Reforecast:** actuals through month N plus the remaining budget or a new forecast.
- **Variance reports:** month and YTD, budget vs actual, $ and %, with a comment required above a threshold (for example 10% and $X), mirroring Fannie Mae's 20% YoY commentary rule.

### Gaps
- No IREM, NAA or vendor budgeting documentation was retrieved, including reforecast cadence and typical owner-approval timelines (for example, budgets due in Q4).

---

## 7. Record retention

### Takeaway
IRS minimums:
- 3 years by default
- 6 years if income is underreported by more than 25%
- 7 years for bad-debt deductions
- 4 years for employment tax
- property and basis records until the limitations period expires for the year of disposition
- indefinitely for fraud or no return

Lenders, insurers and creditors may require longer.

### Cited Findings
- **IRS rules:**
  - 3 years if no other rule applies.
  - Refund claims: 3 years from filing or 2 years from payment, whichever is later.
  - 7 years for a worthless-securities or bad-debt deduction.
  - 6 years if omitted income exceeds 25% of reported gross income.
  - Indefinitely if no return was filed or the return was fraudulent.
  - Employment tax: at least 4 years after the tax is due or paid, whichever is later.
  - Property records: until the period of limitations expires for the year of disposition. In a nontaxable exchange, keep records for both the old and the new property.
  - Insurers or creditors may require longer.

  — [IRS: How long should I keep records?](https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records)
- **Bad-debt write-offs of tenant receivables** (if deducted) fall under the 7-year rule. — [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records)

### Inferences
- **Default retention:** at least 7 years after the fiscal year for GL, AR/AP, bank and deposit records. Fixed-asset and basis records: life of the asset plus 7 years. Audit logs: same horizon as the GL.
- Posted financial data should be **soft-archived, never hard-deleted**, which also matches the immutable-ledger requirement.

### Gaps
- **Lender loan-document retention requirements** were not retrieved, for example the borrower's obligation to keep books for the loan term plus N years under the Fannie/Freddie loan agreements.
- **State security-deposit, landlord-tenant and real-estate-broker trust-account retention periods** vary by state (commonly 3–7 years) and were not researched.
- **HUD-assisted property retention rules** were not researched.
