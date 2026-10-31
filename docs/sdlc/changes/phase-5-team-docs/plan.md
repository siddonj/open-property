# Plan: Phase 5 — Team and document foundations

Intent: [`intent.md`](./intent.md)
Spec: [`spec.md`](./spec.md)
Status: Approved 2026-10-31; built 2026-10-31 (slices A–D)

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

Slice B results, 2026-10-31 (scratch copy p5, a fresh D1, Access mode):

- All 45 write handlers call `logActivity`. A script walks every
  `app.post/put/delete` in `index.ts` and finds none missing.
- `scripts/check-auth.mjs` passes 32 checks on two runs in a row. The 16
  new ones cover:
  - creating a property, unit, tenant, lease, vendor, recurring task, bill,
    and application, plus deleting a tenant
  - a rent payment, a work-order update by maintenance, and a budget save
  - users created by an admin
  - field-level changes on property and work-order updates
  - a manager reading one record's history (200) but not browsing all of it
    (403), and maintenance getting 403
- `UPDATE activity` and `DELETE FROM activity` through `wrangler d1
  execute` both fail with "activity is append-only".
- Browser (admin):
  - The Activity tab lists every change with its user, time, record, and
    "field: old → new" lines.
  - Clicking a work-order row opens that work order through its deep link,
    and the dialog's History list shows the same rows.
- `tsc --noEmit` and `vite build` pass.

Slice B deviations:

- **Checklists and payments are logged on their parent.** Checklist changes
  are recorded on the lease, rent payments on the rent charge, and bill
  payments and voids on the bill. Budget saves are recorded on the property
  (entity `budget`, with the property id). This way each record's History
  shows them.
- **`history-list.tsx` lives in `components/documents/`**, as the plan
  listed. Formatting helpers live in `src/client/lib/activity.ts`, shared by
  the Activity tab and the History list.
- **The four record dialogs now scroll** (`max-h-[90dvh] overflow-y-auto`,
  with horizontal overflow hidden). The History section made them taller
  than short screens. The vendored `ui/dialog.tsx` is unchanged.
- **`navigateTo()`** was added to `use-router.ts`, so the Activity tab
  (which doesn't receive `navigate`) can follow deep links.
- **Known rough edge:** bill totals show raw cents in history
  ("total cents: — → 1234"), and update labels use the name from before
  the change.

Slice C results, 2026-10-31 (scratch copy p5, a fresh D1 and local R2, Access mode):

- `scripts/check-auth.mjs` passes 54 checks. The 22 new ones cover:
  - a PDF uploaded to a lease comes back byte-for-byte, with
    `nosniff` and `CSP: sandbox`
  - the upload shows in the lease's history
  - rejected uploads: a renamed HTML file sent as a PDF (415), an SVG (415),
    11 MB (413), and a missing parent (404)
  - maintenance gets 403 opening, listing, or uploading lease documents, can
    upload and list work-order photos, and can't delete them (403)
  - deleting a lease, unit, or property whose leases have documents gets
    409, and so does deleting a tenant, work order, or bill with documents
  - a manager can delete a document, and opening it afterwards gets 404
  - the role matrix now covers 77 routes × 3 roles
- Browser (manager): uploading through the lease dialog's Documents panel
  lists the file, the link opens `/api/documents/:id/file` in a new tab,
  and the History list refreshes with "added a document".
- `tsc --noEmit` and `vite build` pass.
- **Not verified:** how Chrome shows a PDF under `Content-Security-Policy:
  sandbox`. The in-app browser treats PDFs as downloads. Some Chrome
  versions refuse to render PDFs in a sandboxed document. If that happens,
  drop `sandbox` for `application/pdf` only, keeping `nosniff` and the
  magic-byte check, or switch PDFs to `attachment`.

Slice C deviations:

- **Document adds and deletes are logged on the parent record** (action
  `document_add` / `document_delete`, labelled with the file name), not as a
  separate `document` entity, so the record's History shows them.
- **`/api/documents*` is open to all three roles in the access table.** The
  handlers narrow it by parent record (D3). The check script's route
  expectation matches, and the 22 document checks cover the parent rules.
- **Deleting a property or unit is blocked when its leases have documents**,
  with the message "Its leases have documents. Delete them first." Work
  orders and bills don't cascade from properties (`SET NULL` and
  `RESTRICT`), so only leases matter there.

Slice D results, 2026-10-31:

- **Deploy config.** `wrangler.toml` gets an `[assets]` block
  (`directory = "./dist"`, `not_found_handling = "single-page-application"`,
  `run_worker_first = ["/api/*"]`), following Cloudflare's static-assets
  docs. With a build, `/`, `/leases`, and `/properties/1` return
  `index.html`, `/api/*` reaches the Worker, and `/api/nope` gets 404.
  Without a `dist` folder, `wrangler dev` refuses to start, so `pnpm dev`
  now runs `mkdir -p dist` first; an empty `dist` is enough.
- **README:** the Clawnify button and deploy steps are replaced by a
  Wrangler self-deploy section covering D1, R2, the Access application,
  the variables, migrations, and upgrade order. It also adds local sign-in
  setup with `.dev.vars`, how to run `check-auth.mjs`, the Team, history &
  documents features, and the project layout.
- **CLAUDE.md:** a new "Auth, roles, history" section, plus the `.dev.vars`
  note, the check script, the updated `index.ts` size and sections, and a
  Wrangler deployment section.
- **Phase 1–4 regression as admin (scratch copy):**
  - The dashboard, tenants, applications, leases, rent, expenses, P&L,
    budget, and income pages all load, and every `/api` call returns 200.
  - Rent: generating November charges and recording a partial payment
    (status `partial`) works.
  - Approvals: an approval-gated work order is refused "in progress"
    (400), then approved, then completed.
  - Bills: a bill linked to that work order, paid and then voided (paid
    back to 0), shows on the P&L.
  - Editing a lease and loading the dashboard summary both work.
- **Independent review** (a separate model, read-only, against `REVIEW.md`
  and the spec): 0 critical, 0 high, 2 medium, and 4 low findings. All six
  are fixed:
  1. **MEDIUM:** a file type of `constructor` or `toString` matched
     `Object.prototype` and skipped the content check. The lookup now uses
     `Object.hasOwn`. A new check uploads HTML with type `constructor` and
     gets 415.
  2. **MEDIUM:** managers could read user and settings history with
     `entity` plus `entity_id`. Non-admins are now limited to the record
     types in `MANAGER_HISTORY`. New checks: user and settings history get
     403 for managers.
  3. **LOW:** maintenance saw the current tenant's name on units
     (`active_tenant_name`). It's now null for maintenance (`unitForRole`).
     New check: null for maintenance, the name for a manager.
  4. **LOW:** the last-admin guard was check-then-update. The `UPDATE` now
     re-checks that another active admin exists, and returns 409 when no
     row changes.
  5. **LOW:** a missing or unparseable `Content-Length` let the whole body
     be read before the size check. Such uploads are now rejected up front.
     Browser uploads still work (re-checked), but this case wasn't tested
     on its own.
  6. **LOW:** `filename*` now percent-encodes `' ( ) *`, as RFC 5987
     requires.

  The reviewer confirmed: the JWT checks (kid, RS256 only, iss, aud,
  exp); that Hono's middleware and router see the same path, so encoded
  paths can't slip past; that `HEAD` and `OPTIONS` fail closed; the dev-user
  guard; the bootstrap; document access on all four routes; history
  coverage and immutability; and the deploy config.
- After the fixes: `check-auth.mjs` passes 58 checks on a fresh database
  and again on a re-run. `tsc --noEmit` and `vite build` pass.
- **Still not verified:** how Chrome shows a PDF under `CSP: sandbox` (see
  Slice C).

