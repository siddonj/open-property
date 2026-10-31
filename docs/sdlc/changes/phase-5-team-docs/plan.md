# Plan: Phase 5 — Team and document foundations

Intent: [`intent.md`](./intent.md)
Spec: [`spec.md`](./spec.md)
Status: Approved 2026-10-31

Delivered in four slices, in order. Each slice ends with typecheck, build, and
its own checks before the next one starts. All checks run in the scratch
copy, with its own D1 and R2 state, Wrangler on 8812, and Vite on 5199. Josh's
dev server and `.wrangler/state` are never touched.

## Files and systems that change

- `migrations/0004_phase5_team_docs.sql`: the `users`, `activity` (with the
  append-only triggers), and `documents` tables (spec, Data and API changes).
- `src/server/index.ts`:
  - New sections:
    - **Auth**: `Env` additions, the A1–A3 middleware, and `c.var.user`
      typing.
    - **Access**: the B1 table and middleware.
    - **Users** (`/api/me`, `/api/users`).
    - **Activity**: `logActivity` and `GET /api/activity`.
    - **Documents**: the routes, the magic-byte check, and the R2 calls.
  - Edits to existing sections:
    - a `logActivity` call in each of the 43 write handlers
    - `tenant_phone` in `WO_SELECT`
    - a `hasDocuments` guard on the property, unit, tenant, lease, work
      order, and bill deletes
  - The file is about 2,040 lines today and will be about 2,600 after. If it
    passes about 2,700, auth, users, activity, and documents move to
    `src/server/team.ts` and get mounted on `app`.
- `wrangler.toml`: the `DOCS` R2 binding.
- `.dev.vars.example` (new): `AUTH_DEV_USER` and `ADMIN_EMAIL`.
- `src/client/types.ts`: the `Me`, `User`, `ActivityRow`, and `DocumentRow`
  types, and `tenant_phone` on `WorkOrder`.
- `src/client/hooks/use-app-state.ts`:
  - Load `/api/me` first, and keep its 401 and 403 states.
  - New fetchers for users, activity, and documents.
  - The upload uses `FormData`, not the JSON `api()` helper.
- `src/client/lib/permissions.ts` (new): a `can(role, area)` helper used by
  the sidebar, `app.tsx`, and the dialogs. It mirrors table B2 for display
  only; the server still enforces.
- `src/client/app.tsx`: the sign-in and not-set-up screens, sending
  maintenance users from home to `/maintenance`, and the "You don't have
  access" panel.
- The sidebar component: links filtered by role, plus the user name, role,
  and Sign out in the footer.
- `src/client/components/settings/`: `users-tab.tsx` and `activity-tab.tsx`,
  shown on the settings page for admins.
- `src/client/components/documents/documents-panel.tsx` and
  `history-list.tsx` (new), used in `lease-dialog.tsx`, `tenant-dialog.tsx`,
  `work-order-dialog.tsx`, and `bill-dialog.tsx`.
- `work-order-dialog.tsx`: the read-only tenant name and phone, and the
  approve and delete buttons hidden for maintenance.
- `README.md`:
  - The deploy section is rewritten for Wrangler self-deploy (spec).
  - The Clawnify deploy button and template line come out.
  - Local dev now needs `.dev.vars`.
- `CLAUDE.md`:
  - The Deployment section, for Wrangler.
  - One line on the auth and role middleware: new routes are admin-only
    until they're added to the access table.
  - A note that local dev needs `.dev.vars`.
- `scripts/check-auth.mjs` (new, committed): the repeatable check from the
  Proof section.

## Order of work

**Slice A: sign-in, users, and roles** (spec A, B, E)

1. Add migration 0004 and the `Env` and binding changes.
2. Add the auth middleware: Access, then the dev user, then 401; the
   `users` lookup; and the `ADMIN_EMAIL` bootstrap.
3. Add the access table and middleware, with admin-only as the default.
   Add `/api/me` and `/api/users` with the last-admin guard, and
   `tenant_phone`.
4. Client: the `/api/me` gate, `can()`, the sidebar, route guards, the Users
   tab, and the work-order dialog changes for maintenance.
5. Write `scripts/check-auth.mjs`. It:
   - starts a local JWKS server with a generated RS256 key
   - signs tokens for each case
   - creates a manager and a maintenance user through the admin API
   - runs the JWT cases (spec acceptance 2)
   - runs the role matrix over every route in `index.ts`, comparing against
     an expected table that mirrors B2

**Slice B: activity history** (spec C)

6. Add `logActivity` and the `changes` diff helper, then call it in every
   write handler, section by section.
7. Add `GET /api/activity`, the Activity tab, and `history-list.tsx` in the
   four dialogs.
8. Extend `check-auth.mjs` to make one write per section and check that the
   activity row exists with the right user. Grep that every
   `app.post/put/delete` has a `logActivity` call.

**Slice C: documents** (spec D)

9. Add the document routes, the magic-byte allowlist, and the R2 reads and
   writes, plus the `hasDocuments` guard on the six delete routes and their
   cascades.
10. Add `documents-panel.tsx` in the four dialogs.
11. Extend `check-auth.mjs` with the document cases: upload, list, open, and
    delete by role, the 10 MB limit, a renamed `.html`, opening another
    role's document by id, and deleting a parent that has documents.

**Slice D: wrap-up**

12. README and CLAUDE.md updates.
13. Browser pass as each role (spec acceptance 8), plus a Phase 1–4
    regression as admin.
14. Independent review against `REVIEW.md`, with security as the focus, then
    fix the findings.

## Risks and alternatives

- **Local dev breaks after pull.** Without `.dev.vars`, every API call
  returns 401. That's intended (fail closed), but Josh's own `pnpm dev` will
  show the "Sign-in required" screen until he copies `.dev.vars.example` to
  `.dev.vars`. The README, CLAUDE.md, and the 401 screen all say so.
- **Remote upgrade order.** Apply migration 0004 before deploying, as with
  earlier phases. Set `ACCESS_*` and `ADMIN_EMAIL` before or with the deploy,
  or the live app returns 401 until they're set. That's safe but annoying.
- **Matching paths in the access table.** Patterns are matched by method and
  a path prefix or pattern (for example `PUT /api/work-orders/:id`). The role
  matrix in `check-auth.mjs` is what proves the table and the routes agree.
  A route added later without a table entry is admin-only, never open.
- **`cf.cacheTtl` in local Wrangler.** Local dev may ignore it. Only
  performance is affected, not correctness.
- **Multipart in Hono on Workers.** `c.req.parseBody()` returns `File`
  objects. The size check also runs on `file.size`, because `Content-Length`
  can be missing or wrong.
- **Alternative considered:** Hono's `jwk` middleware. It expects an
  `Authorization: Bearer` header, but Access sends the raw token in
  `Cf-Access-Jwt-Assertion`, so calling `verifyWithJwks` directly is simpler.
- **Alternative considered:** automatic history logging in middleware, keyed
  by path. It can't see created ids or before-and-after values, so the
  handlers make explicit calls, and a grep proves none are missed.

## Proof

- [ ] `node scripts/check-auth.mjs` against the scratch Worker passes:
  - the JWT cases
  - not-a-user and deactivated users get 403
  - the `ADMIN_EMAIL` bootstrap runs once
  - the role matrix for every route
  - the last-admin 409
  - an activity row per write section
  - the `UPDATE`/`DELETE` triggers on `activity` (through `wrangler d1
    execute`)
  - the document cases
- [ ] Without Access vars or a dev user: `/api/properties` returns 401 and
      `/api/health` returns 200.
- [ ] Grep: every write handler calls `logActivity`.
- [ ] Browser as admin, manager, and maintenance: navigation, blocked pages,
      the Users and Activity tabs, and Documents and History in the four
      dialogs.
- [ ] Phase 1–4 regression as admin: rent payment, lease, work order with
      approval, bill with payment, and the reports.
- [ ] `pnpm typecheck`
- [ ] `pnpm build`

## Deviations

- **Settings is visible to every role (slice A).** Vendors live on the Settings
  page, and maintenance and managers need them. So every role sees Settings,
  but non-admins only get the Vendors tab, and maintenance can't delete
  vendors. Rent policy and Users are admin-only tabs. The spec said managers
  "see everything except Settings"; the API rules in B2 are unchanged.
- **Maintenance still sees market rent** on the property list and property
  page. It's listing data, not ledger data, so it was left visible.
- **For slice D:** `wrangler.toml` has no `[assets]` block, so a Wrangler
  self-deploy wouldn't serve the SPA yet. The deploy docs need
  `[assets] directory = "./dist"` with SPA fallback and `/api/*` sent to the
  Worker first, checked so it doesn't break `wrangler dev` before a build.

Slice A results, 2026-10-31 (scratch copy p5, its own D1 state):

- `scripts/check-auth.mjs` (Access mode, local JWKS on 8899): all 16 checks
  pass, including:
  - no token, wrong `aud`, wrong `iss`, expired, bad signature, and a
    garbage token all get 401
  - the `ADMIN_EMAIL` bootstrap runs once, and email matching ignores case
  - unknown and deactivated users get 403
  - a duplicate email gets 409, and the last-admin rule gets 409 for both
    demote and deactivate
  - the role matrix passes for 72 routes × 3 roles

  A deliberately wrong expectation (maintenance allowed on tenants) produced
  5 failures, so the matrix check catches mismatches.
- No sign-in configured: `/api/properties` gets 401 "Sign-in is not
  configured", and `/api/health` gets 200. The dev user works on
  `localhost` and `127.0.0.1`. With a `Host: app.example.com` header the dev
  user is refused (401).
- Browser:
  - Maintenance lands on `/maintenance`. The sidebar shows Properties,
    Maintenance, and Settings (Vendors only). `/rent` shows "You don't have
    access". The property page has no financials or edit buttons. No
    console errors.
  - Admin: the Users tab lists users, adding a user works, and the
    last-admin error shows inline.
  - Manager: full sidebar, the dashboard loads, and Settings shows Vendors
    only.
- `tsc --noEmit` and `vite build` pass.
