# Revenue Recognition, Tenant Receivables, and Lessor Lease Accounting (US Multifamily)

> Scope: US apartment/multifamily, current as of Oct 2026. Researcher notes for a GL + tenant-ledger build in open-property.
> Source-quality legend: **[primary]** = statute, FASB/IRS text or Big 4 guidance; **[vendor]** = PM-software or vendor blog; **[aggregator]** = secondary survey site (verify before relying on it).
> Items marked **[unverified: training knowledge]** were NOT confirmed by a source fetched in this session. They are flagged so the report writer can verify them or leave them out.

---

## 1. ASC 842 lessor accounting for residential operating leases (straight-line, concessions, short-term leases, collectibility)

### Takeaway
Under ASC 842-30, operating-lease income is recognized on an accrual (generally straight-line) basis only while collection of the lease payments is *probable*. Collectibility is assessed lease by lease. When a lease flips to "not probable," income is capped at cash received, and the reversal is a **reduction of lease income (revenue), not bad-debt expense**. Operating-lease receivables are excluded from CECL (ASC 326). An optional ASC 450-20 portfolio reserve is a policy choice, and it may be presented through revenue or through bad-debt expense.

### Cited Findings
- **Not-probable cap:** If collection of lease payments is not probable at commencement, lease income is limited to the lesser of straight-line income or cash received (ASC 842-30-25-12) — [Deloitte FRA 19-1 [primary]](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Change in assessment goes to revenue:** A change in the collectibility assessment "shall be recognized as a current-period adjustment to lease income" (ASC 842-30-25-13). This applies in both directions, from probable to not probable and back — [Deloitte FRA 19-1 [primary]](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Cash-basis switch:** Once collection is not probable, the lessor records lease income only as cash is received, measured cumulatively — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Reversal and reinstatement:** In the period collection is no longer probable, all previously recognized straight-line rent receivables are reversed. If collectibility later becomes probable again, accrual accounting resumes and commencement-to-date straight-line rent is caught up — [PwC Viewpoint 8.9 (search snippet; page returned 404 on fetch)](https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/leases/leases__4_US/chapter_8_other_topi_US/8_9_Lessor-operating-leases_impact-of-collectibility_assessment-_added-November-2019_.html); [KPMG Hot Topic ASC 842 (Jul 2019)](https://frv.kpmg.us/kpmg-us/content/dam/kpmg/frv/pdf/2017/us-hot-topic-asc-842-072219.pdf)
- **Outside CECL:** ASC 326-20-15-3(g) (added by ASU 2018-19) excludes "receivables arising from operating leases accounted for in accordance with Topic 842." The FASB "did not intend to change lessor accounting for operating leases" (BC13) — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease); [IAS Plus summary of FASB clarification](https://www.iasplus.com/en/publications/us/aje/2019/0718)
- **Portfolio reserve is a policy choice:** Deloitte accepts two views.
  - **View 1:** Keep an ASC 450-20 general allowance on the portfolio of receivables still assessed as probable. Deloitte's example uses 10%.
  - **View 2:** Keep no general allowance and adjust only specific leases that become not probable.
  - Whichever view is chosen must be applied consistently and disclosed. — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Presenting the general allowance:** The offset can go to lease income (consistent with the 842 model) or to bad-debt expense (legacy practice) — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Disputed charges:** Disputed amounts are not "enforceable" rights. They are excluded from the collectibility assessment, and the assessment is about lessee credit risk, not disputes — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Mixed components:** A lessor with lease and nonlease (ASC 606) components may need two subsequent-measurement models: ASC 842 for lease receivables and ASC 326 for 606 receivables — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Straight-line formula:** Straight-line rent is total net lease payments, including free or abated periods, divided by the number of periods in the term — [FinQuery (vendor)](https://finquery.com/blog/rent-abatement-and-rent-free-period-accounting/); [Visual Lease (vendor)](https://visuallease.com/deferred-rent-accounting-101-for-asc-842-and-asc-840/)
- **Concessions after signing:** A concession granted after lease signing and not provided for in the original contract is generally a lease modification. KPMG notes reduced-rent concessions in the COVID context were often accounted for as negative variable lease payments. Grant Thornton describes a lessor deferral recorded either as continued straight-line income plus a receivable, or as negative variable rent in the deferral period — [Grant Thornton](https://www.grantthornton.com/insights/articles/audit/2020/snapshot/april/accounting-for-rent-concessions); [KPMG](https://frv.kpmg.us/kpmg-us/content/dam/kpmg/frv/pdf/2017/coronavirus-riots-lease-impact.pdf); [BDO practice aid](https://www.bdo.com/getmedia/0dcf9da9-a648-43b1-a0f5-ab3b74e20600/BDO-Practice-Aid-Lease-Concessions-Related-to-COVID-19_Final.pdf?ext=.pdf)
- **Conflicting source:** One Visual Lease page describes abatements as reducing a "lease liability," which is lessee language and inconsistent with lessor accounting. Disregard it for lessor design — [Visual Lease](https://visuallease.com/how-to-handle-lease-concessions-deferrals-abatements-and-other-modifications/amp/)

### Inferences
- **Free month in a 12-month lease:** Example: 1 month free, $1,200 contract rent, 12-month term. GAAP straight-lining gives $1,100/month of revenue. During the free month, record Dr Straight-line rent receivable (deferred rent asset) $1,100 / Cr Rental income $1,100. Each paying month, record Dr Tenant AR $1,200 / Cr Rental income $1,100 / Cr Straight-line receivable $100.
  - For an upfront concession credit in month 1, straight-lining spreads it over the term the same way.
- **Common practice for small operators:** Many small and mid-size operators simply book the concession as a contra-revenue "Concessions" line in the month granted. This is GAAP-acceptable only if the difference from straight-lining is immaterial. Because apartment leases are ≤12–13 months, the straight-line asset never exceeds roughly one month's concession per lease, so many operators judge it immaterial. **[unverified: training knowledge — no source fetched confirms the materiality practice]**
- **Short-term lease exemption is lessee-only:** ASC 842's short-term (≤12 month) exemption applies to lessees, not lessors. A lessor with 12-month apartment leases still applies the operating-lease model, including straight-line and collectibility. **[unverified: training knowledge]**
- **Lessor practical expedient:** Lessors may elect not to separate nonlease components, such as included utilities or services, when timing and pattern are the same and the lease component would be operating (ASU 2018-11). REITs commonly elect this. **[unverified: training knowledge]**
- **Design implication:**
  - Keep a `revenue_recognition_policy` per entity: `concession_treatment = 'straight_line' | 'as_incurred'` and `collectibility_reserve = 'none' | 'specific' | 'portfolio_450'`.
  - Model collectibility status per lease (`probable` | `not_probable`).
  - When a lease flips to not probable, automatically reverse any straight-line receivable balance and any accrued-but-unpaid rent to **lease income**, then recognize income only as cash arrives.

### Gaps
- No residential-specific Big 4 guidance was found on whether straight-lining one-month-free concessions on ≤12-month leases is "commonly immaterial." Audit firms treat this as an entity-specific judgment.
- PwC Viewpoint section 8.9 returned 404 on direct fetch, so PwC's portfolio-reserve position was not read first-hand.
- ASC 842 codification text itself is paywalled (FASB Codification) and was not fetched. Citations rely on Deloitte's quotation of 842-30-25-12/13.

---

## 2. Basis of accounting: cash vs. accrual vs. modified accrual vs. income-tax basis

### Takeaway
Small landlords overwhelmingly report on the **cash basis** (the IRS default for most individuals). Third-party property managers and multi-owner operators tend to run **accrual** books, often with cash-basis owner statements. Institutional, REIT, and lender-audited owners need **GAAP accrual** (ASC 842). Tax rules override book rules for some items: advance rent and lease-cancellation payments are taxable when received under *either* method. Software should therefore store transactions once and *derive* each basis as a reporting view.

### Cited Findings
- **Cash vs. accrual for tax:** A cash-basis taxpayer reports income in the year it is actually or constructively received, and most individuals use the cash method. Accrual-basis taxpayers report income when earned — [IRS Pub 527 [primary]](https://www.irs.gov/publications/p527)
- **Advance rent:** "Include advance rent in your rental income in the year you receive it," regardless of the period covered or the accounting method — [IRS Pub 527](https://www.irs.gov/publications/p527)
- **Lease cancellation payments:** A payment from a tenant to cancel a lease is rent, includable when received under either method — [IRS Pub 527](https://www.irs.gov/publications/p527)
- **Security deposits:** A deposit you plan to return is not income when received. The amount kept (for example, after a lease break) is income in the year it is kept. A deposit intended as final rent is advance rent and is taxable when received — [IRS Pub 527](https://www.irs.gov/publications/p527)
- **Tenant-paid expenses:** Expenses the tenant pays on the landlord's behalf (for example, a repair deducted from rent) are rental income, and the landlord can also deduct them as expenses — [IRS Pub 527](https://www.irs.gov/publications/p527)
- **Practice pattern (vendor sources):** Cash basis is not GAAP-compliant. Accrual "is more common for larger operations or property management companies tracking multiple owners." Recording security deposits as income is a common cash-basis error — [TenantCloud (vendor)](https://www.tenantcloud.com/blog/cash-vs-accrual-accounting); [Landlord Studio (vendor)](https://www.landlordstudio.com/blog/cash-vs-accrual-accounting-for-rentals)

### Inferences
- **Modified accrual / modified cash:** Modified accrual is a governmental (GASB) basis and is rarely relevant to private multifamily. The practical third option is **modified cash**, for example cash revenue plus accrued payables or capitalized fixed assets, or the **income-tax basis**, which mostly follows cash but treats advance rent as income when received. **[unverified: training knowledge]**
- **Design recommendation: accrual source of truth, cash as a derived view.** Post every charge to tenant AR on an accrual basis (charge date = income date). Derive cash-basis reports by recognizing income at the date each payment is *applied* to a charge, using the payment-allocation records.
  - This is how Yardi, AppFolio, Buildium, and Rent Manager offer "cash/accrual" toggles on the same ledger. **[unverified: training knowledge — vendor docs not fetched]**
  - The allocation table, mapping payment to charge and amount, is therefore a first-class accounting object, not a UI convenience. Cash-basis income by GL account equals the sum of allocations by the charge's GL account, dated by payment date.
- **Prepaid rent in a cash view:** On a cash-basis report, an unapplied payment (prepaid rent) should show as income when received if following tax basis. It should show as a liability if following book accrual. Make this a per-entity setting.

### Gaps
- No authoritative survey quantifies what share of small landlords, fee managers, or institutional owners use each basis. Vendor blogs only.
- Vendor help-center articles for AppFolio, Yardi, or Rent Manager explaining how their cash/accrual toggle derives cash income from allocations were not fetched.

---

## 3. Tenant ledger mechanics: charge codes, recurring postings, proration, payment application order, and state rules on application order and late fees

### Takeaway
Industry software lets operators configure the payment allocation order. Buildium's default is to apply to the *largest balance first* (usually rent), with a custom priority list layered on top. Some states legally constrain the order: **Washington requires payments to apply to rent first**, and Wisconsin does the same per legal aid. Late fees are heavily state-regulated (caps, grace days, written-lease requirements). The software therefore needs per-property (by state) rule configuration, not hard-coded defaults.

### Cited Findings
**Allocation in software**
- **Buildium default and custom order:** The default applies money "to the item with the greatest balance first (typically, that would be rent)." Custom allocation lets an operator rank GL accounts, for example Rent Income first and Renters Insurance second. Any remainder after the ranked items falls back to the largest-balance rule — [Buildium blog (vendor)](https://buildium.com/blog/introducing-custom-payment-allocation)
- **Other vendors:** Rentvine and DoorLoop expose a configurable "payment allocation order" setting (pages found, not read in detail) — [Rentvine help](https://help.rentvine.com/en/articles/16574031-how-to-change-your-payment-allocation-order); [DoorLoop help](https://support.doorloop.com/en/articles/6821737-payment-allocation-settings)

**Payment application statutes**
- **Washington, RCW 59.18.283(1):** "A landlord must first apply any payment made by a tenant toward rent before applying any payment toward late payments, damages, legal costs, or other fees, including attorneys' fees."
  - (2): The right to possession may not be conditioned on paying amounts other than rent, except as provided in 59.18.410.
  - (3): Defaults on an installment plan for nonrefundable fees or deposits that was offered at commencement may be treated as rent owing.
  - Session law: 2019 c 356 s 6. — [RCW 59.18.283 [primary]](https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.283)
- **Wisconsin:** Landlords must apply rent payments first to rent owed before late fees. There is no statutory late-fee cap, but fees must be reasonable — [Wisconsin legal aid (wislawhelp)](https://www.wislawhelp.org/print/pdf/node/424)
- **Oregon, ORS 90.260(4):** "A landlord may not deduct a previously imposed late charge from a current or subsequent rental period rent payment." Doing so cannot make that payment delinquent for a new late charge or for termination. This effectively bans fee-first allocation for late charges — [ORS 90.260 [primary]](https://oregon.public.law/statutes/ors_90.260)

**Late-fee rules by state**

| State | Late-fee rule | Source |
|---|---|---|
| **TX** — Prop. Code §92.019 | Allowed only if (1) notice is in the written lease, (2) the fee is reasonable, and (3) some rent is unpaid **two full days** after the original due date.<br><br>Safe harbor: ≤**12%** of monthly rent for structures with ≤4 units, ≤**10%** for >4 units. A higher fee is allowed only if it does not exceed the landlord's actual damages.<br><br>An initial fee plus daily fees count as one late fee. Violation: $100 + 3× the fee + attorney's fees. Waivers are void. | [Tex. Prop. Code §92.019 (public.law mirror) [primary]](https://texas.public.law/statutes/tex._prop._code_section_92.019) |
| **OR** — ORS 90.260 | Only if rent is not received by the **4th day** of the period (charge from the 5th day). Due dates and late dates must be in the written agreement.<br><br>Max of one of: a reasonable flat fee once per period; a daily fee ≤6% of that flat amount; or 5% of periodic rent per 5-day period (that period only). | [ORS 90.260 [primary]](https://oregon.public.law/statutes/ors_90.260) |
| **NY** — RPL §238-a | Cap is the lesser of **$50 or 5%** of monthly rent. Charge only after rent is **more than 5 days** late. Lease terms exceeding the cap are void.<br><br>Bounced-check fees are limited to the landlord's actual bank cost. | [N.Y. RPL §238-a [primary]](https://newyork.public.law/laws/n.y._real_property_law_section_238-a); [ezel.ai [aggregator]](https://ezel.ai/surveys/late-rent-fee-limits/new-york) |
| **CA** | No statutory cap or grace period. The fee must be a reasonable pre-estimate of actual damages (Civ. Code §1671(d); *Orozco v. Casimiro*, 2004). | [Landlord Studio [aggregator]](https://www.landlordstudio.com/blog/a-state-by-state-guide-to-late-fees); [hatchkeep [aggregator]](https://www.hatchkeep.com/laws/late-fee-index.html) |
| **FL** | No statutory cap or grace period. Must be in the lease and reasonable. | Same aggregators as CA |
| **WA** | RCW 59.18.170 reportedly bars late fees until rent is **5 days** late. No cap was confirmed. | [aggregators](https://www.landlordstudio.com/blog/a-state-by-state-guide-to-late-fees) (statute not fetched) |
| **IL** | One aggregator claims "$20 or 20%." **Unconfirmed; no statute cite found.** | [aggregator](https://rentceiling.com/blog/late-fee-laws-by-state-2026/) |
| **ME / MN** | Maine 4% of monthly rent; Minnesota 8% of overdue payment. | [HUD Cityscape (Nebraska law review survey)](https://www.huduser.gov/PORTAL/periodicals/cityscpe/vol24num2/ch18.pdf) |

- **Aggregator caveat:** Aggregator sources conflict with each other. For example, the Texas "2-day grace" is described differently across sites, and Maryland figures conflict. Verify each state against statute text — [Landlord Studio](https://www.landlordstudio.com/blog/a-state-by-state-guide-to-late-fees); [Hemlane](https://www.hemlane.com/resources/late-fee-laws-by-state/); [Azibo](https://www.azibo.com/blog/maximum-late-fees-by-state)

### Inferences
- **Charge codes:** A charge code should map 1:1 to a revenue or liability GL account and carry flags, as yardi/AppFolio "charge types" do **[unverified: training knowledge]**:
  - `is_rent` (needed for WA/WI rent-first allocation and for eviction "rent owing" amounts)
  - `is_potential_rent` (feeds GPR/loss-to-lease)
  - `is_deposit` (liability, not income)
  - `taxable`
  - `late_fee_eligible`
  - `priority` (allocation rank)
- **Recurring charges:** Generate monthly charges from lease recurring-charge rows on a schedule, typically posted on the 1st or a few days before for the next period. Keep charges idempotent: one charge per (lease, charge_code, period). The existing `rent` module in open-property should be checked for an equivalent period key.
- **Proration:** Choose a policy per property: `actual_days_in_month` (rent × days occupied / days in month) or `30-day month`. Some operators also use a 365/12 daily rate. Store the method used on the charge for auditability. **[unverified: training knowledge — no source fetched on proration conventions]**
- **Allocation algorithm:**
  1. If the property's state requires rent first (WA, WI), force all `is_rent` charges to the front.
  2. Otherwise apply the operator's priority list.
  3. Within the same priority, apply oldest first (by due date).
  4. Fall back to largest-balance.
- **Oregon allocation:** Never apply a payment to a late charge if that would leave current-period rent unpaid.
- **Late-fee engine:** Parameters per property should include `grace_days`, `fee_type` (flat / percent / daily), `cap_pct` and `cap_amount`, `units_in_structure` (Texas tiers), and `requires_written_lease_notice`. Validate configured fees against a state rules table at save time.

### Gaps
- Statute text was not fetched for WA RCW 59.18.170 (late-fee timing), Illinois (a 2018 public act reportedly set a formula cap; unverified), California Civ. Code §1671, Florida ch. 83, or Chicago and other municipal ordinances (Chicago RLTO reportedly caps late fees at $10 for the first $500 plus 5% above; **unverified**).
- No comprehensive 50-state list of *payment-application-order* statutes was found. Only WA (primary), WI (legal aid), and OR (late-charge deduction ban) are confirmed.
- No vendor doc fetched confirms AppFolio or Yardi default allocation orders.
- No authoritative source was found on proration conventions.

---

## 4. Prepaid rent (unearned revenue), partial payments, NSF / returned payments, credits and refunds

### Takeaway
Under accrual books, payments received before the charge period are a **liability (prepaid rent / unearned revenue)** until applied. For tax, however, advance rent is income when received. Security deposits are liabilities until forfeited. NSF and returned payments must reverse the original allocation, not just add a fee. Fees for dishonored checks are capped by statute in some states (NY: actual bank cost).

### Cited Findings
- **Tax timing of advance rent:** Advance rent is taxable in the year received under any method, and deposits applied as last month's rent are advance rent — [IRS Pub 527](https://www.irs.gov/publications/p527)
- **Deposits are liabilities:** Security deposits are not income when received if returnable. Forfeited amounts become income when kept — [IRS Pub 527](https://www.irs.gov/publications/p527); [TenantCloud (vendor)](https://www.tenantcloud.com/blog/cash-vs-accrual-accounting)
- **NY dishonored checks:** Landlords cannot charge a fee for a dishonored check above the actual cost from their bank — [N.Y. RPL §238-a](https://newyork.public.law/laws/n.y._real_property_law_section_238-a); [ezel.ai](https://ezel.ai/surveys/late-rent-fee-limits/new-york)
- **Partial payments and possession (WA):** In Washington, a tenant's right to possession cannot be conditioned on paying non-rent amounts, so a partial payment must first cure rent — [RCW 59.18.283](https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.283)
- **Partial payments in Texas:** The late fee is triggered if *any portion* of rent remains unpaid two full days after the due date — [Tex. Prop. Code §92.019](https://texas.public.law/statutes/tex._prop._code_section_92.019)

### Inferences
- **Prepaid flow:**
  - Payment received with no open charges: Dr Cash / Cr Prepaid Rent (liability).
  - When the next charge posts: Dr Prepaid Rent / Cr Tenant AR. The allocation record links them.
  - Tenant balance = AR − prepaid. Show a credit balance to the tenant, but keep the GL accounts separate. **[unverified: standard practice, not sourced]**
- **NSF / returned payment:** Create a *reversal* transaction that undoes the original receipt and its allocations: Dr Tenant AR (re-opens the charges) / Cr Cash.
  - Then optionally post an NSF fee charge, subject to the state cap.
  - Flag the tenant `cash_only` / `certified_funds` for N months (common PM practice; **unverified**).
  - Never delete the original payment. Keep an immutable audit trail.
- **Partial payments:**
  - Apply the payment via the allocation algorithm and leave the remainder open.
  - Some landlords refuse partial payments because acceptance may waive eviction rights in some states (state-specific; **unverified, not researched**). The software should support a "reject partials" flag at the lease or tenant level.
- **Credits:**
  - Concessions and credits post as negative charges to a concession or contra-revenue code. They are not "payments," so they do not hit cash.
- **Refunds:**
  - Refund of a tenant credit balance: Dr Prepaid Rent (or AR credit) / Cr Cash.
  - Refund of a deposit: Dr Security Deposit Liability / Cr Cash.
  - Both must be separate transaction types, because deposit refunds have statutory deadlines and itemization rules (covered by another researcher, deposit topic).

### Gaps
- No primary source was fetched on state rules for accepting partial payments and waiver of eviction (varies by state).
- No primary source was found on NSF fee caps outside New York.
- Vendor docs for NSF reversal workflows (AppFolio "Reverse payment," Yardi "NSF receipt") were not fetched.

---

## 5. Delinquency, write-offs, bad debt, collections, recovery, and the allowance for doubtful accounts

### Takeaway
For GAAP lessors, a write-off or specific reserve of *lease* receivables (rent) runs **through lease revenue** under ASC 842-30-25-13. Only an optional portfolio reserve may be shown in bad-debt expense. Non-lease receivables (for example, ASC 606 fee or service income) follow CECL (ASC 326). Cash-basis owners have no "bad debt" at all: income was never recognized. The GL needs both paths plus a recovery path.

### Cited Findings
- **Reversal through revenue:** Moving a lease from probable to not probable reverses accrued receivables (including straight-line rent) against lease income — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease); [KPMG Hot Topic](https://frv.kpmg.us/kpmg-us/content/dam/kpmg/frv/pdf/2017/us-hot-topic-asc-842-072219.pdf)
- **Optional portfolio reserve:** The 450-20 general reserve is optional, may be presented in revenue or bad-debt expense, and must be applied as a consistent, disclosed policy — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Write-off approach depends on the reserve:** Multiple approaches to the probable-to-not-probable write-off may be acceptable, depending on whether the general allowance already contemplated it — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)
- **Recovery:** If collectibility becomes probable again, accrual resumes with a cumulative catch-up to income. Under the cash-basis model, cash collected on a not-probable lease is lease income when received — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease); [PwC 8.9 (snippet)](https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/leases/leases__4_US/chapter_8_other_topi_US/8_9_Lessor-operating-leases_impact-of-collectibility_assessment-_added-November-2019_.html)
- **Separate models for non-lease receivables:** Lessors with non-lease receivables may need separate subsequent-measurement models (842 vs. 326/CECL) — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)

### Inferences
- **Practical residential trigger:** A practical "not probable" trigger for residential is a move-out with a balance owing, eviction filing, or skip.
  - Deloitte's guidance is lease-by-lease credit assessment. Apartment operators typically implement it as an aging-based or event-based rule, for example "write off at move-out and send to collections."
  - The industry also commonly books a monthly bad-debt reserve on residents aged 60+/90+ days. **[unverified: training knowledge]**
- **Suggested GL accounts:**
  - `Rental Income`
  - `Concessions` (contra)
  - `Bad Debt – Rent` (contra-revenue under 842; tag a P&L presentation option)
  - `Bad Debt Expense` (non-lease, 606/CECL)
  - `Allowance for Doubtful Accounts` (contra-asset)
  - `Bad Debt Recovery` (contra-revenue or other income)
- **Write-off entry:**
  - With an allowance: Dr Allowance / Cr Tenant AR.
  - Without an allowance (direct write-off): Dr Bad Debt – Rent / Cr Tenant AR.
  - Keep the tenant's legal balance in a sub-ledger, a "written-off / collections" bucket. This lets the move-out statement and collections agency still see the full balance even though AR in the GL is zero.
- **Recovery after write-off:**
  1. Dr Tenant AR / Cr Bad Debt Recovery (or reverse the write-off).
  2. Then Dr Cash / Cr Tenant AR.
  - Post collection-agency fees, often 25–50% contingency (**unverified**), as expense, or net them if the agency remits net.
- **Cash-basis view:** Write-offs have no P&L effect, because income was never recognized. The cash-basis report should exclude write-off transactions entirely.

### Gaps
- No primary source was found on industry-standard aging thresholds for the apartment bad-debt reserve, or on how NMHC/NAA or REITs define "bad debt" in same-store NOI.
- Collection-agency commission norms and FDCPA implications for in-house collections were not researched.

---

## 6. Gross Potential Rent, loss-to-lease, and vacancy loss: GL journal entries ("GPR method") or reporting only?

### Takeaway
Both approaches exist in practice. Yardi Breeze Premier and Infor/AMSI PowerSite can **post GPR journal entries to the GL**, where GPR (market rent on every unit) is offset by loss-to-lease, vacancy, and concession contra lines so that net equals actual charges. Many smaller systems (Buildium, Propertyware) only *report* GPR from unit data. A GPR-method GL gives institutional-style P&Ls. The cost is a non-cash monthly batch that must reconcile exactly to the rent roll.

### Cited Findings
- **Yardi Breeze Premier** calculates GPR and records GPR journal entries — [Yardi Breeze class page (vendor)](https://www.yardibreeze.com/refresh-virtual/classes/page/11)
- **Yardi Voyager course:** Yardi Aspire offers "AO 320 – Preparing and Posting Gross Potential Rent (GPR) in 7S" (title only seen) — [Yardi Aspire](https://ecigroups.yardiaspire.com/c-512392/Signup)
- **Yardi vacancy definition:** Yardi analytics define vacancy as the difference between Potential Rent and Actual Rent charged — [Yardi 102 Financial Analytics PDF](https://hf-files-oregon.s3.amazonaws.com/hdpbridgeregroup_kb_attachments/2021/08-13/3cd97715-81a1-40ad-b05d-35e5785eea39/Yardi_102_Financial_Analytics_Analysis_GPR_and_Security_Deposits_.pdf)
- **Infor/AMSI PowerSite "Gross Potential" method:**
  - Loss to lease = Unit Market Rent − Unit Gross Potential.
  - Vacant unit: Gross Potential = Market, so loss to lease = 0.
  - Occupied unit: Gross Potential = actual potential-code charges + lost rent.
  - Example: market $1,000, occupied at $900, so LTL = $100.
  - The calculation "affects the Reconciliation Report, Rent Summary Report, and Transfer to G/L." Debit and credit detail is not given.
  - — [Infor PowerSite help (vendor)](https://amsiaws.saas.infor.com/AMSIWEBG001/Areas/eSite/help/loss_to_lease_calculation_overview.htm)
- **Propertyware GPR report (report only):** Vacancy loss is computed from target rent for unoccupied units and is $0 for occupied units — [Propertyware support](https://support.propertyware.com/s/article/What-are-the-columns-option-for-the-Gross-Potential-Rent-Report)
- **Buildium workaround:** A practitioner reports Buildium could not show a potential-rent top line. The workaround was invoicing GPR in Xero with a loss-to-lease credit and posting leftovers to vacancy loss — [BiggerPockets forum (anecdotal)](https://www.biggerpockets.com/forums/80/topics/663720-p-and-l-report-including-vacancy-and-loss-to-lease)
- **Definitions:**
  - GPR = all units at market rent.
  - Loss to lease = market − in-place rent on occupied units (gain to lease when in-place > market).
  - Vacancy loss = rent forgone on empty units.
  - Each is shown as a separate line, not netted into GPR.
  - MassHousing's audit glossary lists loss/gain to lease separately from vacancy.
  - — [Wall Street Prep](https://www.wallstreetprep.com/knowledge/gross-potential-rent-gpr/); [MassHousing audit glossary](https://www.masshousing.com/-/media/Files/Multifamily/Reporting/audit-glossary.pdf); [HelloData gain to lease](https://www.hellodata.ai/help-articles/what-is-gain-to-lease-in-real-estate)
- **Conflicting GPR definition:** One source defines GPR as occupied units at *actual* rent plus vacant units at market. This conflicts with the "all units at market" definition and matches the PowerSite "unit gross potential" concept. Definitions vary by system — [Next Level PM](https://nextlevelpm.co/understanding-gross-potential-rent-industry-standards-and-best-practices/)
- **CHAM asset-management formulas** (GPR, economic occupancy) — [CHAM PDF](https://www.chamonline.org/wp-content/uploads/2022/06/Asset-Management-Formulas-May-2020.pdf)

### Inferences
- **Typical GPR-method monthly JE** **[unverified: reconstructed from definitions; no vendor DR/CR doc fetched]**:
  - Cr `Gross Potential Rent` (market rent × all units)
  - Dr `Loss/(Gain) to Lease` (contra)
  - Dr `Vacancy Loss` (contra)
  - Dr `Model/Employee/Down Units` (contra, optional)
  - Net = Dr `Tenant AR` for actual rent charges
  - Concessions and bad debt then hit their own contra accounts.
  - Net "Rental Income" equals actual rent charged, identical to the non-GPR method.
  - Only the presentation differs.
- **Pros of the GPR method:**
  - Lender- and investor-standard P&L top line.
  - Vacancy and LTL are visible in the GL and budgets.
  - Supports economic-occupancy KPIs directly from the trial balance.
- **Cons of the GPR method:**
  - Requires a reliable market-rent table per unit per month.
  - Mid-month move-ins and move-outs require daily proration of vacancy versus occupied potential.
  - Adds non-cash entries that confuse small owners on cash basis.
  - Must reconcile to the rent roll every close.
- **Recommendation for open-property:** Ship "report-only GPR" first, computed from units × market rent vs. charges. Treat posting it to the GL as an optional monthly batch per entity, since net income is identical either way.

### Gaps
- No vendor documentation was found showing exact debit and credit accounts for GPR posting (Yardi AO 320 content was not accessible).
- No authoritative source (IREM, NAA, NMHC) was found stating which share of operators book GPR in the GL versus report-only.

---

## 7. Other income: late fees, RUBS / utility reimbursements, application fees, pet fees vs. pet deposits, non-refundable fees, move-out damage charges

### Takeaway
Refundable amounts (security and pet deposits) are liabilities, and become income only when forfeited. Variable charges tied to the lease (late fees, RUBS) are generally variable lease payments or other income recognized when earned or billed. Non-refundable upfront fees (application, admin, non-refundable pet fees) are income when received for tax. For GAAP, upfront fees tied to the lease are arguably lease payments to be spread over the term. That last point was not confirmed by a fetched source.

### Cited Findings
- **Deposits:** Refundable deposits are not income. Kept deposits are income when kept — [IRS Pub 527](https://www.irs.gov/publications/p527)
- **Tenant-paid landlord expenses** (for example, utilities paid by the tenant) are rental income for tax, and the landlord deducts the expense — [IRS Pub 527](https://www.irs.gov/publications/p527)
- **Late fees are statutorily constrained**; see Section 3 for TX, OR, and NY specifics — [Tex. §92.019](https://texas.public.law/statutes/tex._prop._code_section_92.019); [ORS 90.260](https://oregon.public.law/statutes/ors_90.260); [N.Y. RPL §238-a](https://newyork.public.law/laws/n.y._real_property_law_section_238-a)
- **WA non-refundable fees and deposits:** In Washington, if an installment plan for non-refundable fees or deposits was offered at commencement, a default may be treated as rent owing — [RCW 59.18.283(3)](https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.283)
- **Disputed charges:** Disputed charges (for example, contested CAM, or by analogy contested damage charges) are not enforceable and are excluded from collectibility assessment — [Deloitte FRA 19-1](https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease)

### Inferences
**[unverified: standard practice, not sourced]**

| Item | Recognition | GL |
|---|---|---|
| Late fee | When assessed (after the grace period), as variable lease income. Many GAAP operators recognize late fees only when collected, given high uncollectibility. | Other income – Late fees |
| RUBS / utility reimbursement | Monthly when billed; variable lease payment (lessor), or a nonlease component under 606 if not combined | Utility reimbursement income (keep separate from utility expense; don't net) |
| Application fee | When received. Covers screening, and is often capped by state (e.g., CA, WA, NY limits — not researched here). | Application fee income |
| Admin / move-in fee (non-refundable) | Tax: when received. GAAP: arguably part of lease payments, straight-lined over the term | Admin fee income (or deferred) |
| Pet deposit (refundable) | Liability until forfeited | Pet deposit liability |
| Pet fee (non-refundable) / pet rent | Fee: as above. Pet rent: monthly lease income | Pet fee income / Pet rent |
| Move-out damage charge | When assessed at move-out, typically offset first against the deposit liability. Excess goes to AR (likely written off). | Damage recovery income; Dr Deposit liability |
| Lease-break / cancellation fee | Taxable when received (Pub 527). GAAP: lease modification or termination, recognized over the remaining term or at termination | Lease termination income |

- **Fee-cap tables:** Application-fee caps and pet-deposit rules vary by state (for example, NY caps application fees at $20 under the HSTPA 2019; CA ties application fees to a CPI-adjusted cap). These need their own state table. **[unverified: training knowledge]**

### Gaps
- No fetched source addresses ASC 842 vs. ASC 606 classification of non-refundable apartment admin or application fees, or RUBS specifically.
- No fetched source covers state application-fee caps or state pet-deposit rules (some states count pet deposits toward the total security-deposit cap).

---

## 8. Sales tax / occupancy tax for short-term rentals or furnished units (brief)

### Takeaway
Not researched in depth; no sources fetched in this session. Long-term residential rent (typically >30 days) is generally exempt from sales and transient-occupancy taxes in most states. Stays of ≤30 days (with state thresholds varying, for example 30, 90, or 180 days) and some furnished units trigger state and local lodging, sales, or TOT taxes. This is **[unverified: training knowledge]**.

### Cited Findings
- None. No source was fetched on this topic within the tool budget.

### Inferences
- **Design hooks only:** Give charge codes a `taxable` flag and a `tax_jurisdiction` / `tax_rate_id`. Give leases a `term_days` / `is_transient` flag. Treat tax collected as a liability (Dr AR / Cr Rent + Cr Sales tax payable), never as income.
- **Examples to verify:**
  - Florida's tax on transient rentals of ≤6 months.
  - Texas hotel occupancy tax for stays <30 days.
  - California city TOT for stays ≤30 days.
  - Hawaii GET/TAT.
  - **[unverified]**

### Gaps
- Everything in this section needs primary-source verification from state revenue departments before it is used in the product. Treat short-term rental tax as out of scope for v1 unless the product targets furnished or corporate units.
