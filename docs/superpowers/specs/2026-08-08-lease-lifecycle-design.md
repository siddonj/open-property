# Lease lifecycle: renewal workflow, month-to-month auto-conversion

**Status**: Design — not yet implemented
**Source**: Items #6, #7 in the "Suggested build order" of
`docs/roadmap/2026-08-08-competitive-gap-analysis.md`

## Context

`src/client/components/leases/leases-page.tsx` already computes and surfaces
an "Ends in N days" warning for active leases within 30 days of `end_date`
(lines 111–113, 142) — but the only action available is opening
`LeaseDialog` to hand-edit the existing lease record. There's no dedicated
renewal action, and leases past `end_date` with no successor stay `active`
forever unless someone manually changes status — nothing auto-transitions
them. Both gaps are lease-status-transition problems, hence one spec.

No schema changes required for either — both are new server logic + one new
client action, working entirely with the existing `leases` table.

## 1. Lease renewal workflow

**Problem being solved**: today, renewing a lease means manually creating a
brand-new lease record via `LeaseDialog`, re-entering unit/tenant/dates/rent
from scratch, with no link back to the lease being renewed. AppFolio/Entrata
model a renewal as an explicit action that carries forward the prior lease's
terms as a starting point.

**Data model decision**: do NOT add a `renewed_from_lease_id` column in this
pass. A renewal is just "create a new lease for the same unit/tenant, mark
the old one `ended`" — the existing schema already supports finding lease
history for a unit via `GET /api/leases?unit_id=X`, so an explicit link
column is not necessary to answer "what was this lease renewed from" (it's
inferable by unit + adjacent date ranges). Keep this addition minimal;
revisit if reporting ever needs a hard link.

**Server**: new endpoint `POST /api/leases/:id/renew`, alongside the
existing lease routes (`src/server/index.ts:306–357`). Request body:
```ts
{ start_date: string; end_date: string; monthly_rent?: number; deposit?: number; }
```
(reuses the shape of `LeaseInput`, but only these fields are settable — unit
and tenant always carry forward unchanged). Behavior, in one transaction-like
sequence (D1's `run()` doesn't currently wrap multi-statement transactions
anywhere in this codebase — follow the existing pattern of sequential
`run()` calls, e.g. as done in `POST /api/leases` where creating a lease is
followed by a separate `UPDATE units` call, lines 338–340):

1. Fetch the source lease via `LEASE_SELECT WHERE l.id = ?`; 404 if missing.
2. Validate `new.start_date > source.end_date` isn't required (allow
   back-to-back or overlapping starts — some renewals start same-day) but
   do require `new.end_date > new.start_date`, matching the validation
   already implied by `LeaseInput`'s date fields (currently no cross-field
   date validation exists anywhere in this codebase — this endpoint doesn't
   need to introduce it either beyond a basic sanity check, to stay
   consistent).
3. `UPDATE leases SET status = 'ended' WHERE id = ?` on the source lease.
4. `INSERT INTO leases (...)` a new row: same `unit_id`, `primary_tenant_id`,
   `rent_due_day`, `late_fee`, `notes` as the source; new `start_date`,
   `end_date`, and `monthly_rent`/`deposit` (falling back to source values
   if not provided in the request body — a renewal often keeps the same
   rent). `status: 'active'` (or `'upcoming'` if `new.start_date` is in the
   future — reuse whatever status-inference logic exists, or default to
   `'active'` and let the operator correct it, matching how `POST
   /api/leases` today defaults to `'active'` regardless of `start_date`,
   line 335).
5. Return `{ lease: <new lease, via LEASE_SELECT> }`, 201.

**Client**: `renewLease(id, patch)` added to `use-app-state.ts`, calling the
new endpoint and calling `refreshLookups()` after (matching the pattern of
`createLease`/`updateLease`).

New `RenewalDialog` component (`src/client/components/leases/renewal-dialog.tsx`),
structurally a trimmed-down `LeaseDialog` — only `start_date`, `end_date`,
`monthly_rent`, `deposit` fields, pre-filled from the source lease with
`end_date` advanced by one year and `start_date` set to the day after the
source lease's `end_date` (using `toIsoDate`/date math already in
`src/client/lib/utils.ts`, same helpers `LeaseDialog` already uses at lines
62–66 for its own defaulting).

**Entry point**: in `leases-page.tsx`, where the "Ends in N days" badge
already renders (line 142), add a "Renew" button/action next to it — visible
only when `ending` is true (reusing the existing computed `ending` boolean,
line 113). Clicking it opens `RenewalDialog` instead of `LeaseDialog`.

## 2. Month-to-month auto-conversion

**Problem being solved**: a lease whose `end_date` has passed with `status`
still `'active'` and no renewal/new lease created just sits there
indefinitely, silently wrong — it inflates `active_leases` and
`occupied_count` numbers on the Dashboard even though the original fixed
term is over.

**Approach**: this is a status-correction pass, not a new lease type. Do NOT
add a `'month_to_month'` value to the `LeaseStatus` enum (`upcoming | active
| ended | cancelled`, `src/client/types.ts:62`, mirrored in the `LeaseInput`
Zod enum, `src/server/index.ts:290`) — that would ripple into every place
`LeaseStatus` is switched on (`STATUS_TONE` maps in both `leases-page.tsx`
and elsewhere, the `Tabs` filter in `leases-page.tsx` lines 70–76, dashboard
counting logic). Instead, keep `status: 'active'` and add a boolean flag:

**Schema**: `ALTER TABLE leases ADD COLUMN month_to_month INTEGER NOT NULL
DEFAULT 0;` — same idempotent-migration caveat as noted in
`2026-08-08-compliance-fields-design.md`.

**Server**: no scheduled job exists in this codebase (confirmed — no cron
infra in `wrangler.toml`), so this can't run as a background task. Instead,
compute it lazily: any `GET` that reads leases (`GET /api/leases`,
`LEASE_SELECT`-based endpoints) already knows `end_date` — add a derived
(not stored, computed at read time) indicator by extending `LEASE_SELECT`'s
output with a computed column:
```sql
CASE WHEN l.status = 'active' AND l.end_date < date('now') THEN 1 ELSE 0 END as is_past_term
```
This avoids ever needing to run a write/migration pass over existing rows —
the "flag" is derived, not persisted, sidestepping the question of whether
`month_to_month` should be a stored column at all. Drop the `ALTER TABLE`
above; this doesn't need new storage.

**Client**: `Lease` type gains `is_past_term?: number` (0 | 1, derived
field, matching the "Joined" comment convention already used for other
derived fields on `Lease`, e.g. `unit_name`, `property_name` at
`src/client/types.ts:77-85`). In `leases-page.tsx`, where `ending` is
computed (line 113), add a sibling badge for `l.is_past_term === 1` — label
it "Month-to-month" (amber tone, same `Badge` pattern) rather than exposing
the more technical "past term" language to the operator, since that's the
real-world meaning once a fixed-term lease runs past its end date without a
successor.

**Explicit non-goal**: do not change how `active_leases`/`occupied_count`
are computed on the Dashboard (`GET /api/dashboard/summary`) in this pass —
a month-to-month lease is still legitimately active and the unit is still
occupied. This flag is informational only, surfaced on the Leases list, not
a status change with downstream side effects.

## Testing

Manual: `npx tsc --noEmit`, `npx vite build`. For renewal: create a lease
ending soon via `curl`, call the new `/renew` endpoint, verify the source
lease flips to `ended` and a new `active` lease appears with carried-forward
unit/tenant. For auto-conversion: create a lease with `end_date` in the
past and `status: 'active'`, verify `GET /api/leases` returns
`is_past_term: 1` for it, verify the badge renders correctly in the UI.
