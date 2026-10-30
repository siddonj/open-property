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

There is no test suite and no lint script configured in `package.json`. `pnpm typecheck` is the only automated check — run it after any change.

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

- `src/server/index.ts` — every API route lives in this one Hono file (~1,100 lines), organized in commented sections per entity (Properties, Units, Tenants, Leases, Lease checklists, Rent, Maintenance, Vendors, Applications, Dashboard, Settings, Reports). New endpoints should follow the existing section, not create new files, unless the file grows unreasonably.
- `src/server/db.ts` — re-exports `initDB`/`query`/`get`/`run` from `@clawnify/db`, the D1 adapter package. All DB access goes through these three functions; there is no ORM.
- `src/server/schema.sql` — baseline schema + seed data (3 properties, 5 units, 3 vendors). Applied on every `pnpm dev` via `db:migrate`. Don't add columns here: `CREATE TABLE IF NOT EXISTS` can't alter existing databases.
- `migrations/NNNN_<name>.sql` — schema changes after the baseline, applied once each by `wrangler d1 migrations apply` (tracked in `d1_migrations`). Remote databases need `wrangler d1 migrations apply open-property-db --remote`.
- `src/client/app.tsx` — shell: renders `Sidebar` + the active page based on `route.name`, wrapped in `AppContext.Provider`.
- `src/client/hooks/use-router.ts` — hand-rolled pushState router. Routes are a discriminated union (`Route` type); add new routes here (both the `parse()` regex and the `Route` union member) and wire the page in `app.tsx`.
- `src/client/hooks/use-app-state.ts` — central data-fetching hook; owns loading/error state consumed via `AppContext`.
- `src/client/components/<domain>/` — one directory per feature (dashboard, properties, tenants, applications, leases, rent, maintenance, reports, settings), each with list/detail/dialog components colocated.
- `src/client/components/ui/` — vendored shadcn/ui primitives (Radix-based). Treat as generated; prefer composing over editing unless fixing a real bug.
- `src/client/lib/utils.ts` — `cn()` class helper plus shared color/date/money/period formatting helpers used across components.

### API conventions (server)

- Zod schemas per entity (e.g. `PropertyInput`) validate POST/PATCH bodies via the local `parseJson()` helper, which returns `{ ok, data | error }`.
- `intParam()` parses and validates numeric route params, returning `null` on failure — callers respond `400` immediately.
- `buildUpdate()` turns a partial-fields object into `SET` clauses + params for PATCH endpoints, skipping `undefined` values (so partial updates only touch provided fields).
- List endpoints often join in computed aggregates (e.g. `unit_count`, `occupied_count` on `/api/properties`) via correlated subqueries rather than separate calls.

### Client conventions

- No client-side router library and no server-state library (no TanStack Query/SWR) — data fetching and caching is centralized in `use-app-state.ts`.
- Routing is a closed union matched exhaustively in `app.tsx`; there is no catch-all except the explicit `not-found` route.

## Deployment

Deploys as a Cloudflare Worker with a D1 binding (`DB` → database `open-property-db`, see `wrangler.toml`). Built on the Clawnify template format (`clawnify.json` defines deploy-time prompts); `clawnify deploy` handles provisioning if the Clawnify CLI is installed, otherwise wire Wrangler + D1 directly.

## Scope boundaries

Per the README, these are intentionally out of scope for this template — don't add them without an explicit ask: listing syndication, real credit/background screening, SMS/email blast sending, online payment processing, public tenant/owner portals.
