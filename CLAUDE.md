# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install
pnpm dev          # applies D1 schema, then runs Vite (:5173) + Wrangler (:8787) concurrently
pnpm db:migrate   # apply src/server/schema.sql (baseline) + pending migrations/ to the local D1 database
pnpm typecheck    # tsc --noEmit
pnpm build        # vite build -> dist/
```

There is no test suite and no lint script configured in `package.json`. `pnpm typecheck` is the only automated check — run it after any change. `scripts/check-auth.mjs` is a manual check of sign-in, the role matrix, activity history, and documents against a throwaway local Worker (see README → Develop); run it after touching auth, routes, or the `ACCESS` table.

Local dev needs `.dev.vars` (copy `.dev.vars.example`): without it every API call is 401 by design.

`db:migrate` is idempotent and does not reset data (`CREATE TABLE IF NOT EXISTS`, guarded seeds, tracked migrations). To reset local data, delete `.wrangler/state` and re-run `pnpm db:migrate`.

## AI-assisted SDLC

- For substantial changes, use the repository-local `/ai-native-sdlc` skill and its Plan → Design → Build → Test → Deploy → Maintain workflow. See [docs/sdlc/README.md](docs/sdlc/README.md).
- Keep change artifacts together in `docs/sdlc/changes/<slug>/` (`intent.md`, `spec.md`, and `plan.md` as appropriate). The root `intent.md` is the product roadmap, not a per-change record.
- Scale the paperwork to the change: small fixes may use a concise plan, but still need verification.
- Verify code changes with `pnpm typecheck` and `pnpm build`. There is currently no automated test suite; do not report tests as passing unless tests were actually run.
- Review changes against [REVIEW.md](REVIEW.md). Report what was verified and any checks that could not be run.
- Artifacts and review guidance do not replace human judgment. Do not commit, merge, or deploy unless the user explicitly asks.

## Architecture

Single Cloudflare Worker app: Hono API + static React SPA, sharing one D1 (SQLite) database. In dev, Vite proxies `/api/*` to Wrangler on :8787 (see `vite.config.ts`); in production both are served by the same Worker.

- `src/server/index.ts` — every API route lives in this one Hono file (~2,500 lines), organized in commented sections: Auth and access, Activity history, then one per entity (Properties, Units, Tenants, Leases, Lease checklists, Rent, Maintenance, Recurring tasks, Vendors, Applications, Accounts, Bills & payments, Dashboard, Settings, Reports, Budgets, Users, Documents, Activity). New endpoints should follow the existing section, not create new files, unless the file grows unreasonably.
- `src/server/db.ts` — re-exports `initDB`/`query`/`get`/`run` from `@clawnify/db`, the D1 adapter package. All DB access goes through these three functions; there is no ORM.
- `src/server/schema.sql` — baseline schema + seed data (3 properties, 5 units, 3 vendors). Applied on every `pnpm dev` via `db:migrate`. Don't add columns here: `CREATE TABLE IF NOT EXISTS` can't alter existing databases.
- `migrations/NNNN_<name>.sql` — schema changes after the baseline, applied once each by `wrangler d1 migrations apply` (tracked in `d1_migrations`). Remote databases need `wrangler d1 migrations apply open-property-db --remote`.
- `src/client/app.tsx` — shell: renders `Sidebar` + the active page based on `route.name`, wrapped in `AppContext.Provider`.
- `src/client/hooks/use-router.ts` — hand-rolled pushState router. Routes are a discriminated union (`Route` type); add new routes here (both the `parse()` regex and the `Route` union member) and wire the page in `app.tsx`.
- `src/client/hooks/use-app-state.ts` — central data-fetching hook; owns loading/error state consumed via `AppContext`.
- `src/client/components/<domain>/` — one directory per feature (dashboard, properties, tenants, applications, leases, rent, maintenance, reports, settings), each with list/detail/dialog components colocated.
- `src/client/components/ui/` — vendored shadcn/ui primitives (Radix-based). Treat as generated; prefer composing over editing unless fixing a real bug.
- `src/client/lib/utils.ts` — `cn()` class helper plus shared color/date/money/period formatting helpers used across components.

### Auth, roles, history (server, Phase 5)

- Every `/api/*` route except `/api/health` goes through the auth middleware: a Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`, verified with `verifyWithJwks` against `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`), or `AUTH_DEV_USER` on localhost only, else 401. The email must be an active row in `users`; `ADMIN_EMAIL` bootstraps the first admin.
- Roles come from the single `ACCESS` table near the top of `index.ts`. **A route not listed there is admin-only.** When adding a route, add its rule and update `expected()` in `scripts/check-auth.mjs` (it restates the spec independently). Record-level rules (managers reading one record's activity, documents by parent) live in the handlers.
- Every write handler calls `logActivity(c, entity, id, action, label, diff(before, patch))` after its change. The `activity` table is append-only (SQLite triggers). Child records log on their parent (checklists on the lease, payments on the charge).
- Documents: metadata in `documents`, files in the R2 `DOCS` binding under random keys, served only by `GET /api/documents/:id/file`. Deleting a record with documents is refused (`hasDocuments`).
- Client: `lib/permissions.ts` (`canSeePage`, `isStaff`) only hides UI; never rely on it for security.

### API conventions (server)

- Zod schemas per entity (e.g. `PropertyInput`) validate POST/PATCH bodies via the local `parseJson()` helper, which returns `{ ok, data | error }`.
- `intParam()` parses and validates numeric route params, returning `null` on failure — callers respond `400` immediately.
- `buildUpdate()` turns a partial-fields object into `SET` clauses + params for PATCH endpoints, skipping `undefined` values (so partial updates only touch provided fields).
- List endpoints often join in computed aggregates (e.g. `unit_count`, `occupied_count` on `/api/properties`) via correlated subqueries rather than separate calls.

### Money (server)

- Phase 3 money columns (`bill_lines`, `bill_payments`, `budgets`) store **integer cents** (`*_cents` columns). Use cents for any new money column. Rent tables are still `REAL` dollars; reports convert each rent row with `CAST(ROUND(x * 100) AS INTEGER)` before summing.
- Bills are written in steps and are only real once `complete = 1`. Every bill total, report, and payment must filter on it — reuse `billLineActuals()` for bill-line actuals rather than writing a new query.
- Occupancy has one rule: `leaseCovers()` / `unitOccupied()` in `index.ts` (non-cancelled lease covering the period; an active lease past `end_date` runs through `today`). Use them for any occupied count instead of `units.status`. Endpoints take the operator's local date via `requestToday(c)` (`?today=`).
- The chart of accounts (`gl_accounts`) is seeded by `migrations/0003_phase3_financial.sql`; reports group by account `type` and `is_operating`.

### Client conventions

- No client-side router library and no server-state library (no TanStack Query/SWR) — data fetching and caching is centralized in `use-app-state.ts`.
- Routing is a closed union matched exhaustively in `app.tsx`; there is no catch-all except the explicit `not-found` route.

## Deployment

Self-deployed with Wrangler (not Clawnify; `clawnify.json` is unused). One Worker serves the built SPA from `dist` (`[assets]`, SPA fallback, `/api/*` to the Worker first) plus the API, with bindings `DB` (D1 `open-property-db`) and `DOCS` (R2 `open-property-docs`). Production needs `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ADMIN_EMAIL` set and a Cloudflare Access application in front; see README → Deploy. Apply migrations before deploying code.

## Scope boundaries

Per the README, these are intentionally out of scope for this template — don't add them without an explicit ask: listing syndication, real credit/background screening, SMS/email blast sending, online payment processing, public tenant/owner portals.
