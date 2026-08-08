# In-app notification center, global search

**Status**: Design — not yet implemented
**Source**: Items #5, #9 in the "Suggested build order" of
`docs/roadmap/2026-08-08-competitive-gap-analysis.md`

## Context

Grouped together because both are new *global* UI surfaces (not scoped to
one page, unlike the other three specs), but they're functionally
independent — implement in either order, or only one.

Neither is a `[SCOPE CONFLICT]` item: no SMS/email sending, no external
service. Both are pure read-only aggregation over existing data, surfaced
in new UI chrome.

## 1. In-app notification center

**What exists already**: `GET /api/dashboard/summary`
(`src/server/index.ts:740`) already computes exactly the signals a
notification center needs — `overdue_count`, `overdue_total`,
`urgent_work_orders`, `open_work_orders`, `upcoming_expirations` (leases
ending within 60 days), `upcoming_move_outs` (within 30 days). Today these
numbers only render as static stat tiles on the Dashboard page
(`src/client/components/dashboard/dashboard-page.tsx`, not modified by this
spec — it keeps its own tiles). The gap is having no *global*, persistent
way to see "things needing attention" from anywhere in the app — a user on
the Properties page has no idea rent is overdue without navigating back to
the Dashboard.

**Decision: no new endpoint.** Reuse `GET /api/dashboard/summary` as-is —
duplicating its aggregation logic into a second endpoint would violate DRY
for zero benefit, since both consumers want the same underlying counts.

**Client architecture**:
- `useAppState()` (`src/client/hooks/use-app-state.ts`) already loads
  `properties`/`vendors`/`settings` once on mount via `refreshLookups()`
  (lines 55–64). Add a parallel `dashboardSummary` piece of state, fetched
  the same way — call it inside `refreshLookups()` alongside the existing
  three calls (`Promise.all([...])`), or as a lighter-weight separate
  effect with its own short poll interval if "freshness" matters more than
  for properties/vendors (recommend: same `refreshLookups()` call for v1,
  simplest option, refreshed on the same triggers — i.e. after any mutation
  that calls `refreshLookups()` already, which covers rent/lease/work-order
  changes).
- New `NotificationBell` component
  (`src/client/components/notifications/notification-bell.tsx`), rendered
  in the sidebar header area next to the existing ResiQ logo/wordmark
  (`src/client/components/sidebar.tsx` lines 54–67) or in a new top bar if
  one gets introduced — for v1, place it in the sidebar header row, matching
  where the app's only other persistent chrome (`ErrorBanner`,
  `src/client/components/error-banner.tsx`) is NOT positioned (that one is
  a fixed bottom-center toast; this is a persistent icon+badge, different
  UX pattern, no conflict).
- A badge count (`overdue_count + urgent_work_orders + upcoming_expirations.length`)
  on a bell icon (`lucide-react`, already a dependency, `Bell` icon).
  Clicking opens a `Popover` (already installed:
  `@radix-ui/react-popover`, used elsewhere per `package.json`) listing each
  category as a clickable row that navigates to the relevant page (overdue
  → `/rent`, urgent work orders → `/maintenance`, expiring leases →
  `/leases`) using the existing `navigate()` prop threaded through
  `App`/`Sidebar` already (`src/client/app.tsx`, `sidebar.tsx` both receive
  `navigate`).

**Explicit non-goals**: no persistence of "read/dismissed" state (no
`notifications` table, no per-notification read-tracking) — this is a live
computed view of current problems, not a historical notification log. If
"mark as read" becomes a real need, that's a separate, larger feature
(needs storage) and should get its own spec later. No push/browser
notifications, no sound — purely an in-app badge+popover.

## 2. Global search

**What exists already**: only `GET /api/tenants?q=` supports search
(`src/server/index.ts:204-219`, `LIKE` across `first_name`/`last_name`/
`email`/`phone`). Properties, units, and leases have no search endpoint at
all — `GET /api/properties`, `GET /api/leases` always return full lists,
filtered only by exact-match params (`status`, `unit_id`, etc.), not text
search.

**New endpoint**: `GET /api/search?q=<term>` — a single cross-entity search,
not a router to the three existing per-entity searches (keeps the client
simple: one call, one result shape). Implementation, in
`src/server/index.ts`, follows the exact `LIKE`-with-`%term%` pattern
already established in the tenants endpoint:

```sql
SELECT 'property' as type, id, name as label, address as sublabel FROM properties WHERE name LIKE ? LIMIT 5
UNION ALL
SELECT 'tenant' as type, id, (first_name || ' ' || last_name) as label, email as sublabel FROM tenants WHERE (first_name || ' ' || last_name) LIKE ? OR email LIKE ? LIMIT 5
UNION ALL
SELECT 'unit' as type, id, name as label, NULL as sublabel FROM units WHERE name LIKE ? LIMIT 5
```

Skipping `leases` from cross-entity search — a lease has no natural
"name," it's better found by searching its tenant or unit, which are
already covered. Response: `{ results: { type: string; id: number; label:
string; sublabel: string | null }[] }`, capped at 5 per entity type (15
total max) to keep it fast and glanceable — this is a jump-to search, not a
full results page.

Minimum query length: require `q.trim().length >= 2` server-side (400 if
shorter) to avoid full-table scans on single-character input, matching the
spirit of the existing tenant search which has no such guard today but
should probably get one too — flagging as a related, optional fix, not
required for this feature since the existing behavior isn't regressed.

**Client**: `globalSearch(q)` in `use-app-state.ts`, debounced client-side
(no existing debounce utility in this codebase — add a minimal one, or
inline a `setTimeout`/`clearTimeout` pattern directly in the search
component; this codebase has no `useDebounce` hook today per the earlier
codebase read, and doesn't need a general-purpose one for a single call
site).

New `GlobalSearch` component (`src/client/components/search/global-search.tsx`)
— a search `Input` (existing component,
`src/client/components/ui/input.tsx`) placed in the sidebar header,
opening a dropdown of grouped results (Properties / Tenants / Units) on
type, each row navigating via the existing `navigate()` prop to
`/properties/:id`, `/tenants/:id`, or the unit's parent property page
(units have no standalone detail route today — `use-router.ts`'s `Route`
union has no `unit` variant — so a unit result should navigate to
`/properties/:property_id` and let the existing property page's unit grid
handle the rest, not introduce a new route in this spec).

**Placement decision**: the sidebar (`w-60 shrink-0`, `sidebar.tsx`) is
narrow; a full search input may not fit well alongside the logo. Two
options: (a) a search icon button that expands/overlays when clicked, or
(b) place it as a slim always-visible input below the logo header. For v1,
recommend (a) — matches the existing sidebar's compact, icon-driven density
better than a permanently-open text field.

## Testing

Manual: `npx tsc --noEmit`, `npx vite build`. For notifications: create
overdue rent charges / urgent work orders / near-expiring leases via
`curl` (same technique used to verify the Reports tab this session),
confirm the badge count matches, confirm each popover row navigates
correctly. For search: `curl "localhost:8787/api/search?q=<partial
property/tenant name>"`, confirm results span multiple entity types and
respect the 5-per-type cap.
