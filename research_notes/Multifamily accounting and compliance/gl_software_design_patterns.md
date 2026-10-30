# GL Software Design Patterns: Double-Entry Ledger + Subledgers for a Property Management App (Cloudflare Workers + D1/SQLite, TypeScript, no ORM)

Research date: 2026-10-29. Primary sources fetched this session are cited inline. Items marked **[bg]** are from background knowledge of well-known specs/docs that were NOT re-fetched this session. Treat them as unverified until checked; they are kept out of "Cited Findings" for that reason.

---

## 1. Core double-entry data model (accounts, entries, lines, sign convention, balancing, immutability, reversals, dates, periods)

### Takeaway
Every mature ledger studied uses the same three-part shape: **account**, **transaction/journal entry (header)**, and **entry/posting (line)** linking one header to one account with a direction and an amount. Lines are append-only. Corrections are new offsetting entries, never UPDATE/DELETE. A transaction must have at least two lines and net to zero.

### Cited Findings
- Modern Treasury model: Ledger = timestamped log of events with monetary impact; Account = segregated pool of value, either debit-normal or credit-normal; Transaction = atomic event affecting two or more accounts; Entry belongs to both a transaction and an account; "one transaction, at least two entries." — [Modern Treasury, Accounting for Developers Pt I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- Normal balances: Asset and Expense are debit-normal (debit +, credit −). Liability, Equity and Revenue are credit-normal (credit +, debit −). Invariant: the sum of credit-normal balances "always equals the sum of all debit normal balances." — [Modern Treasury Pt I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- MT discourages mutating balances directly ("Mutating balances directly creates a system that is prone to errors"). Store immutable transactions and derive balances, which lets you rebuild balances as of any date. — [Modern Treasury Pt I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- Square Books uses three tables. `books` (account: balance, type, owner, id). `journal_entries` ("must balance to 0"). `book_entries` links a journal entry to a book with a **signed amount: debit (+), credit (−)**. The same book may appear more than once in one journal entry. — [Square, Books: an immutable double-entry accounting database service](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- Square Books: "there are no update statements for the tables presented on the diagram, only inserts". Only `books` (cached balance) is mutable. Mistakes are fixed by a new offsetting entry, so the error stays in the audit trail. — [Square Books](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- TigerBeetle takes the opposite sign approach. Each account tracks cumulative `debits_posted` and `credits_posted` as **unsigned 128-bit integers**, and the balance is derived according to whether the account is debit-balance or credit-balance. "Accounts and transfers are immutable once created." — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- Fowler: an Account's balance is "derived as the sum of all the Accounting Entrys". An Accounting Transaction links the entries in one transfer. Domain events can produce Accounting Transactions (an event-sourcing link). — [Fowler, Accounting Narrative](https://martinfowler.com/eaaDev/AccountingNarrative.html)
- Fowler's three correction patterns:
  - **Replacement Adjustment** deletes the incorrect entries and writes correct ones. It loses history.
  - **Reversal Adjustment** posts exact opposites, then the correct entries. It keeps history but adds volume.
  - **Difference Adjustment** posts only the delta. It keeps history but is more complex.
  — [Fowler, Accounting Narrative](https://martinfowler.com/eaaDev/AccountingNarrative.html)
- ERPNext GL rows carry Posting Date (the accounting date that determines the period), Account, separate Debit and Credit columns, Voucher Type + Voucher No (the source document), Against Account, Party (filled only for receivable/payable accounts), and Cost Center/Project/dimensions. Ledger rows cannot be edited. Corrections go through cancel/amend of the source document or a Journal Entry, and "ERPNext preserves the accounting history through reversal behavior where applicable." — [ERPNext General Ledger](https://docs.frappe.io/erpnext/user/manual/en/general-ledger)
- Modern Treasury ledger transactions can be edited only while `pending`. Once `posted` or `archived` they "can no longer be changed." — [MT docs: Lock on account balance or version](https://docs.moderntreasury.com/ledgers/docs/lock-on-account-balance-or-version) (via search summary; also [Ledger Transactions object](https://docs.moderntreasury.com/reference/ledger-transaction-object))
- MT allows entries with an "arbitrary or past `effective_at` timestamp". This separates the effective/accounting date from the insert time, while `lock_version` still increments monotonically. — [MT docs: Design a Ledger for Concurrency](https://docs.moderntreasury.com/ledgers/docs/handle-concurrency)

### Inferences
- **Sign convention for SQLite.** Store one signed integer `amount` per line, with debit = +, credit = − (the Square pattern). The balance invariant then becomes `SUM(amount) = 0` per entry, which is a single aggregate check. Expose debit/credit columns only in views. The TigerBeetle approach (two unsigned columns) avoids sign bugs at the API boundary but makes the balance check `SUM(debit) = SUM(credit)`. Either works. Pick one and never mix them.
- **Recommended minimal schema** (draft for the open-property D1 database; adapt names to `migrations/NNNN_*.sql`):

```sql
CREATE TABLE gl_accounts (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,              -- e.g. '1100'
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  normal_side   TEXT NOT NULL CHECK (normal_side IN ('debit','credit')),
  is_control    INTEGER NOT NULL DEFAULT 0,        -- 1 = AR/AP/deposits control: only subledger posting rules may hit it
  is_bank       INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE gl_periods (
  id         INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL,                        -- 'YYYY-MM-DD', property-local accounting date
  end_date   TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('open','closed','locked')),
  closed_at  TEXT, closed_by TEXT,
  UNIQUE (start_date)
) STRICT;

CREATE TABLE journal_entries (
  id              INTEGER PRIMARY KEY,
  entry_date      TEXT NOT NULL,                   -- accounting/effective date (drives period)
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),  -- system time
  created_by      TEXT NOT NULL,
  source_type     TEXT NOT NULL,                   -- 'rent_charge','payment','bill','deposit_refund','manual','reversal','close'
  source_id       INTEGER,                         -- FK into the subledger document
  memo            TEXT,
  reverses_id     INTEGER REFERENCES journal_entries(id),  -- set on reversal entries
  idempotency_key TEXT UNIQUE,                     -- see section 4
  UNIQUE (reverses_id)                             -- an entry can be reversed at most once
) STRICT;

CREATE TABLE journal_lines (
  id           INTEGER PRIMARY KEY,
  entry_id     INTEGER NOT NULL REFERENCES journal_entries(id),
  line_no      INTEGER NOT NULL,
  account_id   INTEGER NOT NULL REFERENCES gl_accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),   -- +debit / -credit; rejects zero lines
  property_id  INTEGER REFERENCES properties(id),             -- dimensions (section 3)
  unit_id      INTEGER REFERENCES units(id),
  tenant_id    INTEGER REFERENCES tenants(id),
  lease_id     INTEGER REFERENCES leases(id),
  vendor_id    INTEGER REFERENCES vendors(id),
  memo         TEXT,
  UNIQUE (entry_id, line_no)
) STRICT;
CREATE INDEX jl_account_date ON journal_lines(account_id, entry_id);
CREATE INDEX jl_property      ON journal_lines(property_id, account_id);
```

- **Reversals.** A reversal is a new `journal_entries` row with `reverses_id = original.id`. Its lines are the original lines with `amount_cents` negated. Post it with `entry_date` = the reversal date (the current open period), not the original date, if the original period is closed. The `UNIQUE(reverses_id)` constraint blocks double reversal. "Edit" = reverse + repost (Fowler's Reversal Adjustment). Prefer this over Difference Adjustment for clarity.
- **Two dates are the minimum.** `entry_date` is the accounting/effective date and drives period and reports. `created_at` is the system time and drives audit. Fowler's broader event-time vs record-time idea was not on the fetched page (see Gaps). MT's `effective_at` and Square's `commit_timestamp` reflect the same split.

### Gaps
- Fowler's "Posting Rule" and two-time-dimension (actual vs record) patterns were not on the fetched narrative page. They are in his *Analysis Patterns* and the eaaDev pattern pages, which were not fetched.
- ERPNext's field-level GL Entry schema (`is_cancelled`, `against_voucher`) and its exact cancellation storage were not confirmed. The Immutable Ledger doc URL returned 404.

---

## 2. Money representation (integer cents, rounding, proration, currency)

### Takeaway
Store money as integers in the smallest unit (cents, scale 2), with currency/scale fixed at the ledger level. Floating point is never acceptable. The scale is effectively permanent once chosen.

### Cited Findings
- TigerBeetle: map the smallest useful unit to 1 and use an **asset scale** (power-of-10). USD in cents = scale 2, so 0.45 USD is stored as 45. "Asset scales are hard to change later." Changing it means creating a new ledger and copying accounts. — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- TigerBeetle `ledger` field: a numeric id that groups accounts by currency/asset. "Only accounts on the same ledger can transact directly." Cross-currency movement uses linked transfers. — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- Formance encodes scale in the asset name. A README example posts amount `100` of asset `USD/2` from `world` to `users:1234`. Reading `/2` as scale 2 (so 1.00 USD) is inferred from the notation, not explicitly defined in the search result. — [Formance ledger README](https://raw.githubusercontent.com/formancehq/ledger/main/README.md)

### Inferences
- For a single-currency US property app, use `INTEGER` cents everywhere: columns named `*_cents`, and a TS branded type `type Cents = number & {__brand:'cents'}`. SQLite INTEGER is 64-bit, and JS `number` is exact up to 2^53 (about $90 trillion in cents), which is safe here. Add a `currency TEXT NOT NULL DEFAULT 'USD'` column only if multi-currency becomes real (YAGNI).
- **Proration / allocation rule:** never round each piece independently.
  - Use a largest-remainder allocator: compute floor shares, then distribute the leftover cents one at a time, deterministically (e.g., to the last line or by largest remainder).
  - Assert `sum(parts) === total`.
  - Typical cases: partial-month rent (daily rate × days), splitting a utility bill across units, and splitting a payment across charges.
- Do proration math in integer cents with an explicit rounding mode (banker's or half-up). Document the mode in one function and unit test it.
- Parse user/CSV money strings with a string→cents parser (split on '.'), never `parseFloat(x)*100`. `0.29*100 = 28.999999999999996` in IEEE-754.

### Gaps
- No primary source fetched on proration conventions specific to rent (30-day vs actual-days month). This is a business/lease-policy question, so check the lease/compliance researcher's notes.

---

## 3. Subledger vs GL design (tenant AR open items, allocations, control-account reconciliation, how PM platforms do it); multi-entity dimensions; cash vs accrual

### Takeaway
Keep document-level subledgers: charges, receipts, applications/allocations, bills, deposits. Each subledger event produces a balanced GL entry via a fixed posting rule against a **control account** (AR, AP, Security Deposits Held). Invariant: subledger open balance = GL control-account balance, per property. Put property/unit/tenant as dimensions on the GL lines rather than as separate GL accounts. Cash basis can be derived from payment applications.

### Cited Findings
- ERPNext puts **Party** (Customer/Supplier/Employee) on GL rows only for receivable/payable accounts. Cost Center, Project and accounting **dimensions** are copied onto each GL row from the transaction's item rows (not the header). — [ERPNext General Ledger](https://docs.frappe.io/erpnext/user/manual/en/general-ledger)
- Stripe models every producer system as a **fund flow** between accounts. **Clearing accounts** should hold a zero balance at steady state, so a non-zero clearing balance signals a missing, late or incorrect event. Their example: "Find the clearing Accounts with nonzero balance." — [Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- TigerBeetle `user_data_128/64/32` fields are indexed, application-defined tags for the who/what, when, and where (e.g. jurisdiction) of a transfer. They can also group related transfers. This is the dimension-tagging pattern. — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- Square Books namespaces multitenant data by `shelf_id`, with secondary indexes keyed by shelf. — [Square Books](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- Buildium's GL search API exposes an `accounting_basis` parameter. With `Accrual`, balances are calculated by the period in which the transaction originally happened. Source: a third-party Ruby SDK doc generated from Buildium's API, not Buildium's own docs. — [buildium-ruby GeneralLedgerSearchMessage#accounting_basis](https://preview.rubydoc.info/gems/buildium-ruby/2.1.0/Buildium/GeneralLedgerSearchMessage:accounting_basis)

### Inferences
- **Open-item tenant AR (recommended model):**

```sql
CREATE TABLE ar_charges (            -- open items (debits to tenant)
  id INTEGER PRIMARY KEY, lease_id INTEGER NOT NULL, tenant_id INTEGER,
  property_id INTEGER NOT NULL, unit_id INTEGER,
  charge_type TEXT NOT NULL,         -- 'rent','late_fee','utility','damage'
  income_account_id INTEGER NOT NULL REFERENCES gl_accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  due_date TEXT NOT NULL, journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  voided_by_entry_id INTEGER REFERENCES journal_entries(id)
) STRICT;

CREATE TABLE ar_receipts (           -- money in (credits to tenant)
  id INTEGER PRIMARY KEY, lease_id INTEGER NOT NULL, tenant_id INTEGER,
  property_id INTEGER NOT NULL, received_date TEXT NOT NULL,
  method TEXT NOT NULL, reference TEXT,          -- check #, ACH trace
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  deposit_batch_id INTEGER,                      -- groups receipts into one bank deposit (bank rec matching)
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  reversed_by_entry_id INTEGER REFERENCES journal_entries(id)    -- NSF/returned
) STRICT;

CREATE TABLE ar_applications (       -- many-to-many receipt -> charge allocations
  id INTEGER PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES ar_receipts(id),
  charge_id  INTEGER NOT NULL REFERENCES ar_charges(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  applied_date TEXT NOT NULL,
  unapplied_by_id INTEGER REFERENCES ar_applications(id)   -- reverse an application by a new row, not delete
) STRICT;
```

  - Charge posting rule: Dr AR-Tenants (control) / Cr Rent Income, with tenant/lease/unit/property dimensions.
  - Receipt posting rule: Dr Undeposited Funds or Bank / Cr AR-Tenants.
  - Applications do **not** hit the GL on accrual basis. AR is already credited at receipt. They only drive open-item aging and cash-basis income.
  - Unapplied receipt balance = prepayment. Either keep it in AR (the net AR balance goes negative) or reclassify to a "Prepaid Rent" liability at period end. Choose one and document it.
  - Charge open balance = `amount − Σ active applications`. Aging buckets come from `due_date`.
  - Application ordering policy belongs in one function: oldest-first, or a fee priority such as rent before late fees. Many jurisdictions regulate payment application order (compliance cross-check needed).
- **Control-account reconciliation invariant (run nightly or as a report check):**
  `SUM(journal_lines.amount_cents WHERE account = AR control AND property = P)` must equal `Σ open charge balances − Σ unapplied receipts` for property P.
  - The same check applies to AP (bills − bill payments) and Security Deposits Held (deposits received − refunds − applied-to-damages).
  - A mismatch is the property-management analogue of Stripe's non-zero clearing account.
  - Enforce that control accounts are posted **only** by subledger posting rules (block manual JEs to `is_control=1` accounts in the API). Manual JEs to AR are the #1 cause of subledger/GL drift.
- **Clearing accounts worth having:** Undeposited Funds (receipts awaiting a bank deposit batch) and ACH/processor clearing. Both should reach zero once batches settle. Monitor them with Stripe-style "nonzero clearing account" checks.
- **Dimensions vs accounts.** Keep one chart of accounts and tag lines with `property_id`, `unit_id`, `tenant_id`/`lease_id`, `vendor_id`.
  - Per-property P&L: `GROUP BY property_id, account_id`.
  - Owner statements (if owners are added later): add `owner_id` or derive it from a property→owner mapping effective-dated by ownership period.
  - Multi-entity with separate books/bank accounts per owner is a heavier model: an entity column on journal_entries, with entries required to balance **per entity** and inter-entity due-to/due-from accounts. Don't build it until owners/trust accounting is in scope (README scope boundaries currently exclude owner portals).
- **Cash vs accrual from one ledger.** Accrual = the GL as posted. Cash-basis income for a period = `Σ ar_applications.amount` by `applied_date` (or receipt date), grouped by `charge.income_account_id`. Cash-basis expense = Σ bill-payment applications by payment date, grouped by the bill line's expense account. This derives cash basis from allocations without double-storing entries. The alternative (posting both bases with a `basis` column) doubles volume and invites drift.
- **Platform mapping (vendor docs were not fetched; see Gaps).** Buildium's `accounting_basis` parameter is consistent with "one ledger, basis chosen at report time".

### Gaps
- Primary developer docs for Yardi Voyager, AppFolio, Rent Manager, Entrata and ResMan ledger internals were not retrieved. These are mostly closed or partner-gated APIs. No first-party description of their charge/receipt/application tables was found. Buildium's official API reference was not reached either (only a third-party SDK doc).
- No fetched source for Odoo `account.partial.reconcile` / ERPNext Payment Reconciliation internals (open-item matching). Treat the open-item design above as an inference.

---

## 4. Idempotency, concurrency, and atomic multi-row postings on Cloudflare D1/SQLite

### Takeaway
D1 has no interactive transactions from a Worker. The atomic unit is `db.batch([...])`: statements run sequentially, and any failure rolls back the whole batch. A posting (header + N lines + subledger row + validation) must therefore be built as **one batch with no read-modify-write in application code between statements**. Push invariants into the database (CHECK, UNIQUE, triggers that `RAISE(ABORT)`) so the batch rolls back itself.

### Cited Findings
- D1 `batch()`: "Batched statements are SQL transactions." If a statement fails, "it aborts or rolls back the entire sequence." Statements "execute and commit, sequentially, non-concurrently." "D1 operates in auto-commit." — [Cloudflare D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- D1 `exec()` runs without prepared statements/bindings and stops on error. "Only use this method for maintenance and one-shot tasks (for example, migration jobs)." — [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- `withSession()` "maintains sequential consistency among queries" in a session. Without the Sessions API, all queries run on the primary. — [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- The D1 API page does not document BEGIN/COMMIT/ROLLBACK. Batch is the only documented transactional mechanism. — [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- D1 SQL notes:
  - "D1 PRAGMA statements only apply to the current transaction."
  - `PRAGMA defer_foreign_keys` defers FK checks to transaction end.
  - CHECK constraints are enforced by default (`ignore_check_constraints` OFF).
  - `PRAGMA recursive_triggers` exists, which implies trigger support.
  - `PRAGMA table_list` reports a `strict` column, which implies STRICT table support.
  — [D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- TigerBeetle uses the client-supplied `id` as the **idempotency key** so retries after lost replies do not double-post. It recommends time-based, roughly sortable IDs; random IDs perform worse. — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- Modern Treasury optimistic locking: each ledger account has a `lock_version` that increments whenever its pending/posted balance changes. Passing it on a write makes the write succeed "only if no ledger transactions have posted since the given version." The alternative is balance-condition locks (e.g. `posted_balance_amount >= 0`), where the whole call fails if any condition would be false. MT advises **not** using these locks on high-throughput "hot" accounts. — [MT: Design a Ledger for Concurrency](https://docs.moderntreasury.com/ledgers/docs/handle-concurrency); [MT: Lock on account balance or version](https://docs.moderntreasury.com/ledgers/docs/lock-on-account-balance-or-version); [MT blog: designing ledgers with optimistic locking](https://www.moderntreasury.com/journal/designing-ledgers-with-optimistic-locking)
- Square Books keeps a monotonic per-book version counter alongside a cached balance. — [Square Books](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)

### Inferences
- **Posting pattern for D1 (one batch, no app-side reads between writes):**
  1. Validate in TS before the batch:
     - lines ≥ 2
     - every `amount_cents` is a non-zero integer
     - `Σ amount_cents === 0`
     - accounts exist and are active
     - `entry_date` falls in an open period (fast-fail UX only; the DB re-checks)
  2. `INSERT INTO journal_entries (... idempotency_key) VALUES (...)`. A duplicate key fails `UNIQUE` and the whole batch rolls back. On that error, `SELECT` by key and return the original result (idempotent replay). Alternatively use `INSERT ... ON CONFLICT(idempotency_key) DO NOTHING`, but then later statements must not blindly attach lines, so failing loudly is simpler.
  3. Insert lines with `entry_id = (SELECT id FROM journal_entries WHERE idempotency_key = ?)` or `last_insert_rowid()`. Each batch statement is a separate prepared statement, so a subquery on the unique key is the safe choice. **[bg]** `last_insert_rowid()` is per-connection in SQLite. That should hold within one batch, but this was not verified for D1.
  4. Insert the subledger row (`ar_charges`/`ar_receipts`) referencing the entry.
  5. **Final guard statement** that fails the batch if the entry is unbalanced. See the trigger approach below. Because the batch is one transaction, a failure anywhere rolls back everything. This gives atomic multi-row postings without interactive transactions.
- **DB-level invariants (defense in depth; [bg] SQLite semantics, not fetched):**
  - SQLite cannot enforce a cross-row "SUM = 0" with CHECK. Options:
    - (a) Trust the single code path plus a nightly `SELECT entry_id FROM journal_lines GROUP BY entry_id HAVING SUM(amount_cents) <> 0` audit.
    - (b) **[bg]** Add a "seal" step: lines are inserted, then a final `UPDATE journal_entries SET sealed=1 WHERE id=?`, with a `BEFORE UPDATE OF sealed` trigger that does `SELECT RAISE(ABORT,'unbalanced') WHERE (SELECT SUM(amount_cents) FROM journal_lines WHERE entry_id=NEW.id) <> 0`. Reports filter `sealed=1`. Since the seal is in the same batch, an abort rolls back everything.
    - (b) is the strongest DB-enforced balance check available on SQLite. Pair it with a trigger blocking line inserts into sealed entries.
  - **Immutability triggers [bg]:** `CREATE TRIGGER jl_no_update BEFORE UPDATE ON journal_lines BEGIN SELECT RAISE(ABORT,'journal_lines are append-only'); END;` plus the same for DELETE. Repeat on `journal_entries`, allowing only the one-way `sealed` 0→1 transition. This turns "never mutate posted entries" from a convention into an enforced rule.
  - **Period lock trigger [bg]:** `BEFORE INSERT ON journal_entries ... WHEN EXISTS (SELECT 1 FROM gl_periods WHERE NEW.entry_date BETWEEN start_date AND end_date AND status <> 'open') BEGIN SELECT RAISE(ABORT,'period closed'); END;`
  - Verify trigger and `RAISE()` behavior on D1 locally (`wrangler d1 execute --local`) before relying on it. The D1 docs fetched here only imply trigger support via the `recursive_triggers` PRAGMA.
- **Concurrency on D1.** D1 runs writes serially on a single primary ("sequentially, non-concurrently" within a batch; the per-database write serialization is [bg]). Classic lost-update races therefore mostly come from read-in-Worker, decide, then write-in-a-later-call.
  - Example: "apply payment to oldest open charges" reads open balances, then writes applications in a second round trip, while a concurrent request applies the same charge.
  - Mitigation 1, conditional SQL inside the batch: `INSERT INTO ar_applications ... SELECT ... WHERE (charge.amount − applied) >= ?`, then check `meta.changes` and treat 0 as a conflict.
  - Mitigation 2, Square/MT-style optimistic `version` columns on the subledger document: `UPDATE ar_charges SET version = version+1 WHERE id=? AND version=?` as the first batch statement, plus a trigger or `changes()` guard that aborts when 0 rows were updated. **[bg]** The abort-on-0-rows guard needs a trigger or a follow-up statement that RAISEs. D1 batch does not natively assert row counts.
- **Idempotency keys** should be derived deterministically from the business event, not a random UUID per HTTP retry. Examples: `rent:{lease_id}:{period}` for recurring rent charges (so a cron re-run cannot double-bill), `receipt:{bank_trace_id}`, `import:{bank_account}:{fitid}`. This fits the existing recurring-task patterns in the app.

### Gaps
- No D1 doc fetched explicitly states "BEGIN TRANSACTION is not supported" or describes D1's per-database write serialization. The batch page is the authoritative positive statement. Verify trigger/`RAISE(ABORT)` behavior and `last_insert_rowid()` within a batch empirically on D1.
- D1 limits relevant to large batches (max statements per batch, max bound params, query duration) were not fetched. Check them before bulk imports or period-close jobs.

---

## 5. Auditability (append-only, created_by, audit tables, hash chaining, soft delete vs reversal)

### Takeaway
Append-only journal tables, reversal-based correction, `created_by`/`created_at` on every entry, and source-document links already provide most of the audit value. Hash chaining is a cheap optional tamper-evidence layer (Odoo does SHA-256 chaining per journal). Soft-delete flags on posted financial rows are an anti-pattern; use reversals.

### Cited Findings
- Stripe Ledger is an append-only log: "Transactions previously published into Ledger cannot be deleted or modified." Past state can be rebuilt by replay. Repairs use revert-and-reprocess, with a two-phase review/commit backed by impact reports. — [Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Square Books keeps errors in the audit trail by offsetting rather than editing. — [Square Books](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- Odoo inalterability works as follows:
  - SHA-256 over an entry's essential fields: name, date, journal_id, company_id, debit, credit, account_id, partner_id.
  - Each hash includes the previous entry's hash, forming a chain.
  - The feature is enabled per journal. Once a posted entry exists on a locked journal it cannot be disabled, and posted entries cannot be edited.
  - A data inalterability check report shows the first and last hashed entries per journal.
  — [Odoo 17 Data inalterability check report](https://www.odoo.com/documentation/17.0/es/applications/finance/accounting/reporting/data_inalterability.html) (search-result summary of the Spanish/Italian doc pages)
- Odoo forum (not official): since v15 a posted move can be reset to draft and deleted unless the journal uses hash locking. — [Odoo forum thread](https://odoo.com/lt_LT/forum/pagalba-1/account-move-can-be-deleted-when-set-to-draft-after-posted-240300)
- ERPNext: ledger rows cannot be edited directly. Corrections go via cancel/amend of the source document or a Journal Entry. — [ERPNext General Ledger](https://docs.frappe.io/erpnext/user/manual/en/general-ledger)

### Inferences
- **Minimum audit set:**
  - `journal_entries.created_by`, `created_at`, `source_type/source_id`, `reverses_id`
  - append-only triggers (section 4)
  - a separate `audit_log(id, at, actor, action, entity, entity_id, before_json, after_json, request_id)` table for **non-ledger** mutable master data (accounts, leases, period status changes)
- Period close/reopen must write an audit row with the actor.
- **Optional hash chain (Odoo-style):** add `prev_hash TEXT, hash TEXT` to `journal_entries`. Hash = SHA-256(prev_hash ‖ canonical JSON of header + ordered lines), computed in the Worker with `crypto.subtle.digest`.
  - Under concurrent writers this needs a serialized "last hash" read, which is a read-then-write race on D1.
  - Simpler: compute the chain in a periodic sealing job over entries ordered by id, and store per-period anchors.
  - Treat it as optional. It detects tampering by someone with direct DB access but does not prevent it.
- No `deleted_at` on `journal_entries`/`journal_lines`/`ar_*`. A "voided" document is a document plus a reversal entry (`voided_by_entry_id`).

### Gaps
- Odoo's hard-lock-date interaction with reversals was not found.
- No source found on audit requirements specific to property-management trust accounting (state real-estate commission rules). That is likely covered by the compliance researcher.

---

## 6. Reporting performance (derive from postings vs balance tables/snapshots); trial balance; period close and retained earnings

### Takeaway
At small-landlord scale (thousands to low millions of lines), compute balances on the fly from indexed `journal_lines`. Add per-period, per-account snapshots only once closed periods need fast reads, and make snapshots rebuildable from lines. Two common close approaches: post a closing entry that zeroes revenue/expense into Retained Earnings, or derive retained earnings at report time.

### Cited Findings
- Modern Treasury: balances should be derived from immutable entries. Double-entry records let you reconstruct balances at any point in time. — [Modern Treasury Pt I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- MT balance definitions: **posted** = sum of posted transactions; **pending** = sum of pending + posted. — [MT handle concurrency docs](https://docs.moderntreasury.com/ledgers/docs/handle-concurrency)
- Square Books updates a cached balance on `books` on every operation, with book entries caching balances. This is a maintained balance table, kept consistent because it is updated in the same write. — [Square Books](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- TigerBeetle stores running cumulative `debits_posted`/`credits_posted` per account, so balance reads are O(1). — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- ERPNext reports show balance as a running value rather than a stored field. Users are advised to run General Ledger and Trial Balance with the same period-closing options. — [ERPNext General Ledger](https://docs.frappe.io/erpnext/user/manual/en/general-ledger)

### Inferences
- **Trial balance query:**

```sql
SELECT a.code, a.name, a.type,
       SUM(CASE WHEN l.amount_cents > 0 THEN l.amount_cents ELSE 0 END)  AS debit_cents,
       SUM(CASE WHEN l.amount_cents < 0 THEN -l.amount_cents ELSE 0 END) AS credit_cents
FROM journal_lines l
JOIN journal_entries e ON e.id = l.entry_id
JOIN gl_accounts a     ON a.id = l.account_id
WHERE e.entry_date <= ?1  /* AND l.property_id = ?2 */
GROUP BY a.id ORDER BY a.code;
-- Invariant: SUM(debit_cents) = SUM(credit_cents); equivalently SUM(l.amount_cents) = 0 over all lines.
```

  Index `journal_entries(entry_date)` and `journal_lines(account_id)`. Consider denormalizing `entry_date` onto `journal_lines` so date-bounded scans don't need the join. Because lines are immutable, the duplication can't drift.
- **Snapshots, only when needed:** `gl_period_balances(period_id, account_id, property_id, net_cents)`, written by the close job for closed periods. The balance as of date D = Σ snapshots for closed periods before D + Σ lines in the open range. The close job recomputes snapshots from lines, so they are a cache, never a source of truth. Add a check comparing snapshot vs recompute.
- **Year-end close options:**
  - (A) **Closing entry:** for each revenue/expense account with balance B in fiscal year Y, post −B, and post the net to Retained Earnings, dated the last day of Y with `source_type='close'`. Then lock the period. This is explicit, auditable and simple to report on.
  - (B) **Virtual close:** the balance sheet computes Retained Earnings = prior-year cumulative net income + the RE account. No entries are posted, so reopening is trivial, but every report must use the same formula.
  - Recommendation: (A) for an app that may export to a CPA. Closing entries must be reversible if the year is reopened (reverse the close entry, then reopen).
- **Period status:**
  - `open` → `closed`: blocks normal posting, allows adjusting entries with a permission.
  - `closed` → `locked`: blocks everything.
  - Reopen is a privileged, audited action.
  - Postings dated into a closed period should default to the first open period, or be rejected with a clear error.

### Gaps
- No fetched source gives quantitative thresholds at which SQLite/D1 on-the-fly aggregation becomes too slow. Benchmark with realistic volume (e.g. 200 units × 12 charges+receipts+applications × 10 years ≈ 100k–200k lines, which is trivially small).

---

## 7. Bank reconciliation data model and bank feed formats (OFX/QFX, CSV, BAI2), NACHA (brief)

### Takeaway
Model bank reconciliation as three things: imported bank statement lines (immutable, deduped by bank-provided id), matches between statement lines and ledger items (receipt deposit batches, bill payments, journal lines on the bank GL account), and a reconciliation record per statement period with ending balance and status. No primary format specs were fetched in this session, so the format details below are background knowledge to verify.

### Cited Findings
- Stripe's completeness checks confirm that every producer ID has a matching ledger event, and its statistical models flag likely-missing events. This is the same matching problem as bank rec, applied at Stripe's scale. — [Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)

### Inferences
- **Schema sketch:**

```sql
CREATE TABLE bank_accounts (id INTEGER PRIMARY KEY, gl_account_id INTEGER NOT NULL UNIQUE REFERENCES gl_accounts(id),
  name TEXT NOT NULL, last4 TEXT) STRICT;

CREATE TABLE bank_statement_lines (
  id INTEGER PRIMARY KEY, bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  posted_date TEXT NOT NULL, amount_cents INTEGER NOT NULL,   -- + deposit / - withdrawal (bank's perspective)
  description TEXT, bank_ref TEXT,                            -- FITID / BAI2 bank ref / check #
  import_batch_id INTEGER NOT NULL, raw_json TEXT,
  dedupe_key TEXT NOT NULL,                                   -- FITID if present, else hash(date|amount|desc|seq)
  UNIQUE (bank_account_id, dedupe_key)
) STRICT;

CREATE TABLE bank_matches (          -- many-to-many: 1 deposit line <-> N receipts in a deposit batch, etc.
  id INTEGER PRIMARY KEY, statement_line_id INTEGER NOT NULL REFERENCES bank_statement_lines(id),
  journal_line_id INTEGER NOT NULL REFERENCES journal_lines(id),   -- the line on the bank GL account
  matched_by TEXT NOT NULL, matched_at TEXT NOT NULL, unmatched_at TEXT
) STRICT;

CREATE TABLE bank_reconciliations (
  id INTEGER PRIMARY KEY, bank_account_id INTEGER NOT NULL, statement_end_date TEXT NOT NULL,
  statement_ending_balance_cents INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('in_progress','completed')),
  completed_by TEXT, completed_at TEXT, UNIQUE (bank_account_id, statement_end_date)
) STRICT;
```

  - Completion check: GL bank balance as of the end date − Σ uncleared journal lines (outstanding checks, deposits in transit) = statement ending balance.
  - Bank fees and interest found only on the statement become new journal entries created from the statement line, then matched.
  - Deposit batches (Undeposited Funds → Bank) are what make "1 bank deposit line = N tenant receipts" matchable.
- **[bg] OFX/QFX:** an SGML (v1.x) or XML (v2.x) format. Each `<STMTTRN>` has `TRNTYPE`, `DTPOSTED`, `TRNAMT` (decimal string), `FITID` (financial-institution transaction id, the dedupe key), `NAME`/`MEMO` and optional `CHECKNUM`. `<LEDGERBAL><BALAMT>` gives the statement balance. QFX is Intuit's branded OFX variant. Spec home: ofx.net. FITID uniqueness is per account but not perfectly reliable across banks, so dedupe on (account, FITID) and fall back to a hash.
- **[bg] BAI2** (now maintained by X9 as "BAI2"): fixed record types, comma-delimited, terminated by `/`.
  - 01 file header, 02 group header, 03 account identifier with summary type codes (e.g. 010 opening ledger, 015 closing ledger)
  - 16 transaction detail (type code, amount in cents with implied decimals, funds type, bank ref, customer ref, text), 88 continuation
  - 49 account trailer, 98 group trailer, 99 file trailer
  - Common for commercial/treasury accounts. Small landlords mostly get CSV/OFX.
- **[bg] CSV:** no standard. Store a per-bank column mapping (date format, single signed amount vs debit/credit columns, sign convention). Parse amounts to cents via strings.
- **[bg] NACHA ACH:** fixed-width 94-character records.
  - 1 file header, 5 batch header (SEC code: PPD consumer, CCD corporate, WEB internet-authorized), 6 entry detail (transaction code, RDFI routing, account, amount in cents, individual id/name, trace number), 7 addenda, 8 batch control, 9 file control
  - Padded to blocking factor 10 with 9-filled records.
  - Return entries (R01 NSF, etc.) arrive later and must post as receipt reversals.
  - Online payment processing and ACH origination are **out of scope** per the project README, so only *ingesting* returns and settlement data matters, via the bank feed.

### Gaps
- No primary specs fetched for OFX (ofx.net), BAI2 (X9 / bai.org), or NACHA Operating Rules. Every format detail above is background knowledge and must be verified against the specs before implementation.
- Plaid/aggregator transaction schemas, the most likely real-world feed source, were not researched.

---

## 8. Common pitfalls and bugs in homegrown ledgers

### Takeaway
Most ledger bugs come from a short list: float money, mutable posted rows, missing period locks, partial writes, date/timezone boundary errors, rounding drift in allocations, manual postings to control accounts, and non-idempotent retries/crons. Each has a cheap structural fix in the design above.

### Cited Findings
- Mutating balances directly "creates a system that is prone to errors" and makes errors hard to detect and reconcile. — [Modern Treasury Pt I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- Lost replies and retries cause double execution unless every write carries an idempotency id. — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- Changing money scale later requires creating a new ledger and migrating accounts. — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- Stripe found that most ledger anomalies (non-zero clearing balances, late or missing events) reflect real upstream integration or money-movement problems, not modeling errors. Monitoring clearing accounts surfaces them. — [Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Back-dated entries are legitimate (MT allows past `effective_at`), so any balance cache or version must be insert-order-based, not date-based. — [MT handle concurrency](https://docs.moderntreasury.com/ledgers/docs/handle-concurrency)
- Hot accounts (e.g., one Undeposited Funds or Bank account hit by every receipt) should not carry per-write balance/version locks. — [MT handle concurrency](https://docs.moderntreasury.com/ledgers/docs/handle-concurrency)
- Odoo before hash-locking allowed posted entries to be reset to draft and deleted (forum report). This is the "mutable posted entry" pitfall in a mainstream product. — [Odoo forum](https://odoo.com/lt_LT/forum/pagalba-1/account-move-can-be-deleted-when-set-to-draft-after-posted-240300)

### Inferences
- **Pitfall checklist mapped to fixes:**
  1. **Floating point:** INTEGER cents everywhere, a string parser for input, and a largest-remainder allocator.
  2. **Mutable entries:** append-only triggers. Edit = reverse + repost.
  3. **Missing period locks:** a `gl_periods` status plus an insert trigger. The close job and reopen are audited.
  4. **Unbalanced or partial writes:** a single `db.batch()` per posting plus a seal/balance guard. Never post lines across multiple Worker round trips. Run a nightly `HAVING SUM(amount_cents) <> 0` audit.
  5. **Timezone/date boundaries:**
     - Store the accounting date as `TEXT 'YYYY-MM-DD'` in the **property's local date**, not a UTC timestamp. A 9pm-PT payment on Jan 31 is Feb 1 in UTC and lands in the wrong period.
     - Store `created_at` as UTC ISO.
     - Compare dates as strings only in zero-padded ISO form.
     - Month-end logic should use explicit last-day calculation. The repo's recent commit history already shows a month-end boundary fix in the occupancy report.
  6. **Negative zero / zero lines:** integer cents have no −0 (`-0` only exists in JS floats; `Object.is(-0, 0)` is false, and JSON serializes `-0` as `0`). Reject `amount_cents = 0` lines via CHECK. Normalize with `x === 0 ? 0 : x`, or `x | 0` if any float math sneaks in.
  7. **Rounding drift:** per-line rounding in proration or splits leaves a 1-cent imbalance. Allocate a remainder and assert sums.
  8. **Manual JEs to control accounts:** block them at the API layer, then run the subledger↔GL reconciliation check.
  9. **Non-idempotent cron/recurring charges:** use deterministic idempotency keys (`rent:{lease}:{YYYY-MM}`) with a UNIQUE constraint.
  10. **Deleting master data with postings:** foreign keys without CASCADE. Never `ON DELETE CASCADE` from properties/tenants into ledger tables. Use `active=0` on accounts instead of delete. Note D1's warning that `defer_foreign_keys` does not stop CASCADE actions ([D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)).
  11. **Reversing twice / reversing a reversal incorrectly:** `UNIQUE(reverses_id)`. Reversal lines are exact negations of the original lines, including dimensions.
  12. **Sign-convention confusion at the UI/API:** store signed; render debit/credit via `account.normal_side`. Test one fixture per account type.
  13. **Reports reading unsealed/pending entries:** a single reporting view `posted_lines` filters `sealed=1`, and every report uses it.
- **One runnable check worth keeping:** a script or endpoint that asserts the following and fails loudly:
  - (a) every entry sums to 0
  - (b) the trial balance sums to 0
  - (c) AR/AP/deposit control = subledger per property
  - (d) clearing accounts (Undeposited Funds) are within expected bounds
  - (e) no lines are dated in locked periods with `created_at` after the lock time

  The project has no test suite (CLAUDE.md), so this invariant check carries the most weight.

### Gaps
- No single primary "post-mortem of homegrown ledger bugs" source was fetched. The pitfall list is synthesized from the cited design principles plus background knowledge. The timezone and negative-zero points are general engineering knowledge, not sourced to a ledger-specific post.

---

## 9. How reference systems compare (quick matrix)

### Takeaway
Two main families exist. **Signed single-amount lines** (Square Books) give the simplest SUM=0 invariant and suit SQLite. **Unsigned debit/credit pairs** (TigerBeetle, ERPNext, and most ERPs in reports) match accountant mental models. Every system studied enforces immutability and reversal-based correction. Odoo hard-enforces it only when the journal is hash-locked, per a forum report.

### Cited Findings
- Square Books: signed amounts, append-only, cached balance on account row, Spanner, UUID keys, multitenant by `shelf_id`. — [Square Books](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- TigerBeetle: unsigned u128 debits/credits, integer amounts + asset scale, `ledger` per currency, client id = idempotency key, indexed `user_data_*` dimensions, immutable accounts and transfers. — [TigerBeetle data modeling](https://docs.tigerbeetle.com/coding/data-modeling/)
- Modern Treasury: debit/credit-normal accounts, pending vs posted states, `effective_at`, `lock_version` optimistic concurrency, balance-condition locks. — [MT Pt I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i); [MT concurrency docs](https://docs.moderntreasury.com/ledgers/docs/handle-concurrency)
- Stripe Ledger: append-only, fund-flow modeling, clearing-account zero-balance invariant, DQ scores for completeness and timeliness (99.999% timeliness target). — [Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Formance: multi-posting atomic transactions, account-address modeling (`users:1234`, `world`), asset-with-scale notation (`USD/2`), Numscript DSL. — [Formance README](https://raw.githubusercontent.com/formancehq/ledger/main/README.md)
- ERPNext: GL rows with debit/credit columns, voucher linkage, party on AR/AP rows only, dimensions per row, no direct edits. — [ERPNext GL](https://docs.frappe.io/erpnext/user/manual/en/general-ledger)
- Odoo: SHA-256 hash chain per journal for inalterability. — [Odoo data inalterability](https://www.odoo.com/documentation/17.0/es/applications/finance/accounting/reporting/data_inalterability.html)

### Inferences
- For open-property on D1, take one idea from each system:
  - Square's signed single-amount lines (simplest invariant)
  - TigerBeetle's integer-scale discipline and idempotency-by-id
  - ERPNext's voucher linkage (`source_type/source_id`) and party-only-on-control-accounts
  - Stripe's clearing-account monitoring
  - MT's posted/pending idea, only if "scheduled/pending charges" are needed. Otherwise skip it (YAGNI): post charges on their date via the recurring job.
  - Odoo-style hash chaining as an optional later hardening.
- **Ponytail cut for v1:** accounts, periods, entries, lines, `ar_charges`/`ar_receipts`/`ar_applications`, deposits as a liability account with a subledger, append-only + period-lock triggers, and one invariant-check endpoint.
  - Skip for v1: snapshots, hash chains, multi-entity/owner books, multi-currency, BAI2.
  - Add them when a CPA export, owner statements, or measured report latency demands it.

### Gaps
- Beancount/hledger (plain-text ledgers with balance assertions and `pad`/`balance` directives) were not fetched. Their "balance assertion" concept is the text-ledger equivalent of the bank-rec ending-balance check and could inform a reconciliation UX.
- Formance's official docs page returned no body content. Idempotency and revert semantics for Formance were not confirmed from a primary source.
