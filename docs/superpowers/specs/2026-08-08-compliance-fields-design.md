# Compliance tracking: vendor insurance/license, renters insurance

**Status**: Design — not yet implemented
**Source**: Items #3, #4 in the "Suggested build order" of
`docs/roadmap/2026-08-08-competitive-gap-analysis.md`

## Context

Two small, independent additions that share a shape: a compliance
expiration date tracked on an existing entity, surfaced as a warning when
lapsed/expiring. Neither requires third-party verification (no scope
conflict) — this is manual data entry with a visual flag, the same trust
model as everything else in this app.

Grouped into one spec because they're both S-sized schema additions with the
identical pattern (add columns → surface in existing dialog → add a flag
somewhere visible), not because they share a feature surface.

## 1. Vendor insurance / license tracking

**Schema** (`src/server/schema.sql`, `vendors` table): add two nullable
columns via a new `ALTER TABLE` block near the existing `vendors` table
definition:

```sql
ALTER TABLE vendors ADD COLUMN insurance_expires_at TEXT;  -- 'YYYY-MM-DD'
ALTER TABLE vendors ADD COLUMN license_number TEXT;
```

Note: `schema.sql` is applied via `wrangler d1 execute ... --file=schema.sql`
on every `pnpm dev` (per `package.json`'s `db:migrate` script) using
`CREATE TABLE IF NOT EXISTS`, so it's idempotent for table creation but
`ALTER TABLE ADD COLUMN` is not naturally idempotent — running it twice
errors. Follow whatever pattern the schema uses elsewhere for column
additions after the fact (check for an existing precedent before adding);
if there is none, wrap in a `PRAGMA` column-existence check or accept that
this only applies cleanly on a fresh local D1 instance, consistent with this
being a dev-only migration script (no production migration tooling exists
in this repo today — flagging this as a pre-existing gap, not something to
solve as part of this feature).

**Types** (`src/client/types.ts`): add to `Vendor` interface:

```ts
insurance_expires_at: string | null;
license_number: string | null;
```

**Server** (`src/server/index.ts`): extend `VendorInput` Zod schema
(line 530) with `insurance_expires_at: z.string().optional().nullable()` and
`license_number: z.string().optional().nullable()`. Extend the `INSERT INTO
vendors` column list and the `PUT /api/vendors/:id` update path (uses the
existing `buildUpdate()` helper, so no change needed there beyond the Zod
schema accepting the new fields).

**Client**: add two fields to the vendor dialog
(`src/client/components/settings/settings-page.tsx`, `VendorDialog`
function) — an `Input type="date"` for `insurance_expires_at` and a plain
`Input` for `license_number`, following the exact pattern of the existing
phone/email grid row (lines ~209–218).

**Surfacing the flag**: add an `insuranceStatus` computed value (expired /
expiring-soon-30-days / ok / not-tracked) wherever vendors are listed
(`VendorsTab` in `settings-page.tsx`) as a small `Badge`, using the same
`Badge` component and color-tone pattern already used for
`ChargeStatus`/lease status elsewhere. Do NOT add this to the Dashboard
summary in this pass — that's a separate decision (dashboard real estate is
already dense); keep the flag local to the Vendors list for v1.

## 2. Renters insurance tracking

**Schema decision**: put this on `leases`, not `tenants` — insurance is a
lease-term requirement, not a tenant-permanent attribute (a tenant could
have insurance for one lease and let it lapse on a renewal). Add to the
`leases` table:

```sql
ALTER TABLE leases ADD COLUMN renters_insurance_required INTEGER NOT NULL DEFAULT 0;  -- boolean
ALTER TABLE leases ADD COLUMN renters_insurance_policy_number TEXT;
ALTER TABLE leases ADD COLUMN renters_insurance_expires_at TEXT;  -- 'YYYY-MM-DD'
```

Same idempotent-migration caveat as above applies.

**Types** (`src/client/types.ts`): no precedent for boolean fields exists
elsewhere on `Lease` or any other entity in this codebase — establish the
convention here as SQLite `INTEGER NOT NULL DEFAULT 0` on the wire, coerced
client-side with `Boolean(lease.renters_insurance_required)` at read time
(no stored client type needed beyond `number`, matching how the API already
returns raw SQLite values for every other field). Add to `Lease`:

```ts
renters_insurance_required: number;  // 0 | 1
renters_insurance_policy_number: string | null;
renters_insurance_expires_at: string | null;
```

**Server**: extend `LeaseInput` (line 281) with
`renters_insurance_required: z.boolean().optional()` (Zod coerces to
`0`/`1` at the SQL param layer the same way other booleans would — confirm
against `buildUpdate()`'s param passthrough, which sends values as-is to
`run()`; D1/SQLite accepts JS `true`/`false` bound params and stores them as
`1`/`0`, consistent with SQLite's dynamic typing), plus
`renters_insurance_policy_number` and `renters_insurance_expires_at` as
`z.string().optional().nullable()`. Extend `INSERT INTO leases` and
`LEASE_SELECT` in the same pattern as the vendor fields above.

**Client**: `lease-dialog.tsx` (read in full for this spec) follows a
consistent `useState` + controlled-`Input`/`Select` pattern with three
`grid-cols-{2,3}` rows for start/end, rent/deposit, and due-day/late-fee/
status (lines 182–220), then a notes `Textarea`. Add a fourth
`grid-cols-3` row after the due-day/late-fee/status row: a checkbox-style
control for `renters_insurance_required` (this codebase has no existing
checkbox primitive in `src/client/components/ui/` — either add one via
`@radix-ui/react-checkbox`, already a sibling dependency to the other
installed Radix primitives in `package.json`, or use a plain `Select`
with Yes/No options to avoid a new dependency; recommend the `Select`
approach to stay minimal), a date `Input` for `renters_insurance_expires_at`
(same `type="date"` pattern as `l-start`/`l-end`), and a text `Input` for
`renters_insurance_policy_number`. Extend the `payload` object in `save()`
(line 88) with the three new fields, sourced from new `useState` hooks
initialized in the existing `useEffect` at line 58 alongside `setStatus`/
`setNotes`.

Surface a lapsed/missing insurance flag on the Lease list
(`src/client/components/leases/leases-page.tsx`, not read in this pass —
inspect its row-rendering before implementing) using the same `Badge`
component and color-tone pattern already established for `ChargeStatus` in
`src/client/components/rent/rent-page.tsx` (`STATUS_TONE` constant) and for
vendor insurance status above — three states: expired (red/rose tone),
expiring within 30 days (amber tone), ok/not-required (no badge or a muted
"—").

## Explicit non-goals for this spec

- No automated reminder emails/notifications for expiring
  insurance/licenses in this pass — that's the in-app notification center
  (separate spec, `2026-08-08-notifications-and-search-design.md`), which
  should read from these new fields once both exist, not duplicate the
  logic here.
- No document upload for insurance certificates — that depends on file
  storage being enabled (`clawnify.json` `"storage": false"` today), which
  is a bigger, separate decision flagged in the roadmap under §11 Documents.

## Testing

Manual: `npx tsc --noEmit`, `npx vite build`, then via `curl` — create/update
a vendor and a lease with the new fields, verify `GET` responses include
them, verify the Badge logic renders correctly for a date in the past vs.
future vs. null (untracked).
