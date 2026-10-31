# Spec: Phase 5 — Team and document foundations

Intent: [`intent.md`](./intent.md)
Status: Approved 2026-10-31

All six intent defaults were accepted on 2026-10-31.

## Requirements

### A. Sign-in (every `/api/*` route except `/api/health`)

A1. **Which sign-in applies.** Checked in this order on each request:

1. **Access**, if `ACCESS_TEAM_DOMAIN` (for example
   `https://acme.cloudflareaccess.com`) and `ACCESS_AUD` are both set:
   - Read the `Cf-Access-Jwt-Assertion` header.
   - Verify it with Hono's `verifyWithJwks` (`hono/utils/jwt/jwt`, already
     installed in Hono 4.12):
     - `jwks_uri` is `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`
     - `allowedAlgorithms` is `["RS256"]`
     - `iss` is `ACCESS_TEAM_DOMAIN`, and `aud` is `ACCESS_AUD`
     - the token must have an `exp` claim
   - The JWKS fetch uses `cf.cacheTtl` so the keys aren't fetched on every
     request.
   - The email comes from the token's `email` claim, lowercased.
2. **Dev user**, if Access isn't configured, `AUTH_DEV_USER` is set, and the
   request host is `localhost` or `127.0.0.1`. The email is `AUTH_DEV_USER`.
3. **Neither:** 401 `{ error: "Sign-in is not configured" }`.

A2. A missing, expired, or invalid token returns 401
`{ error: "Not signed in" }`. The response never includes verification
details.

A3. **Finding the user.** Look up `users` by email.
- If the email has no row and equals `ADMIN_EMAIL` (lowercased), insert it as
  an active admin. This happens only when no row exists for that email, so a
  deactivated admin can't come back this way.
- No row, or `active = 0`: 403
  `{ error: "Your account isn't set up. Ask an admin to add <email>." }`.
- Otherwise, set `c.var.user` to `{ id, email, name, role }` and update
  `last_seen_at`, at most once an hour.

### B. Roles (enforced in one table, default deny)

B1. One middleware checks `c.var.user.role` against a single `ACCESS` table
of `[method, path pattern, roles]`. **A route missing from the table is
admin-only**, so new routes fail closed. Denied requests get 403
`{ error: "You don't have access to this." }`.

B2. The table (A = admin, M = manager, T = maintenance):

| Routes | Read | Write |
|---|---|---|
| `/api/me` | A M T | — |
| properties, units | A M T | A M |
| tenants, leases, lease checklists | A M | A M |
| rent charges, payments, generate | A M | A M |
| vendors | A M T | A M T (T can't delete) |
| work orders | A M T | A M T (T can't delete or approve) |
| recurring tasks, generate | A M T | A M T |
| accounts, bills, bill payments, void | A M | A M |
| applications | A M | A M |
| dashboard summary | A M | — |
| settings | A M T | A |
| reports, budgets | A M | A M |
| users | A | A |
| activity, all records | A | — |
| activity for one record (`entity` + `entity_id`) | A M | — |
| documents | by parent (see D3) | by parent (see D3) |

B3. Work-order responses add `t.phone as tenant_phone` to `WO_SELECT`, so a
maintenance user can arrange entry without tenant access.

### C. Activity history

C1. A `logActivity(c, entity, entityId, action, label, changes?)` helper is
called by every successful write handler after its database change:
- `action` is `create`, `update`, or `delete`, or a named action:
  `generate`, `payment`, `payment_delete`, `approve`, `reject`, `void`.
- `changes` is set only for updates: `{ field: [old, new] }` for the fields
  whose value actually changed, read from the row the handler already loads.
- `label` is a short name, for example "Jane Doe" or "Unit 2B".
- Generate routes log one row with a count, not one row per created charge.

C2. Activity is append-only. Triggers on the table abort any `UPDATE` or
`DELETE`, and there is no API route to edit or delete it.

C3. `GET /api/activity` takes `user_id`, `entity`, `entity_id`, `from`, `to`,
and `before` (an id cursor). It returns 100 rows, newest first, joined to the
user's name and email.

### D. Documents

D1. Storage is an R2 binding `DOCS`. The key is
`docs/<entity>/<entity_id>/<uuid>`; the filename is never part of the key.
Metadata lives in a `documents` table.

D2. Routes:
- `GET /api/documents?entity=&entity_id=` lists a record's documents.
- `POST /api/documents` takes multipart form data with `entity`, `entity_id`,
  and `file`. It checks:
  - the parent record exists
  - `file.size` is at most 10 MB, and the request is rejected early when
    `Content-Length` is over 10.5 MB
  - the first bytes match the declared type: PDF (`%PDF`), JPEG, PNG, or WebP

  After the upload succeeds, it writes the row and logs `create`.
- `GET /api/documents/:id/file` streams from R2 with:
  - the stored content type
  - `Content-Disposition: inline; filename="<sanitized name>"`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: sandbox`
- `DELETE /api/documents/:id` removes the R2 object, then the row, and logs
  `delete`.

D3. Access by parent:

| Parent | View and upload | Delete |
|---|---|---|
| lease, tenant, bill | A M | A M |
| work order | A M T | A M |

D4. Deleting a property, unit, tenant, lease, work order, or bill is refused
(409) while documents exist on it or on records the delete would cascade to.
The message is "Delete its documents first." This follows the
`hasRentHistory` pattern, so no R2 object is left without a row.

### E. Users

- `GET /api/me` returns the signed-in user, and whether Access sign-out is
  available (Access is configured).
- `GET /api/users`, `POST /api/users` (`email`, `name`, `role`), and
  `PUT /api/users/:id` (`name`, `role`, `active`) are admin-only. Each write
  is logged.
- Users are never deleted.
- Refused with 409 if the change would leave no active admin: demoting or
  deactivating the last active admin.
- Emails are unique, compared case-insensitively.

## User experience

- **On load**, the client calls `/api/me` first:
  - 401 shows a full-page "Sign-in required" message. When sign-in isn't
    configured, it explains that the deployer must set up Access.
  - 403 shows "Your account isn't set up", with the email, and nothing else.
- **Navigation by role.** The sidebar shows only the pages the role can use.
  - Maintenance sees Properties, Maintenance, and Vendors (inside
    Maintenance). Their home route sends them to `/maintenance`.
  - Managers see everything except Settings.
  - A blocked page reached by URL shows "You don't have access" instead of
    failing on load.
- **Who is signed in.** The sidebar footer shows the user's name or email and
  role. A "Sign out" link to `/cdn-cgi/access/logout` appears when Access is
  on.
- **Settings (admin)** gets two new tabs:
  - **Users**: a table, "Add user", role select, and activate/deactivate. The
    last-admin error shows inline.
  - **Activity**: filter by user, record type, and date range; "Load more"
    pages through older rows. Each row shows the time, user, action, record
    label, and the changed fields as "field: old → new". Rows link to the
    record using the Phase 4 deep links where they exist.
- **Record dialogs** (lease, tenant, work order, bill) for an existing record
  gain:
  - A **Documents** section: file list with size, uploader, and date; an
    Upload button (accepting `.pdf,.jpg,.jpeg,.png,.webp`); open in a new
    tab; and delete for A and M. A too-large or wrong-type file shows the
    server's error.
  - A **History** section for A and M: the last 20 activity rows for that
    record. Records changed before deploy show "No history before
    <deploy date>."
- **Maintenance users** in the work-order dialog see the tenant's name and
  phone as read-only text, and get no Approve or Delete buttons.
- Every new control is a native button, input, or label with keyboard focus
  styles, like the existing dialogs.

## Data and API changes

New migration `migrations/0004_phase5_team_docs.sql`:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'maintenance')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  at TEXT NOT NULL DEFAULT (datetime('now')),
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  label TEXT,
  changes TEXT
);
CREATE INDEX idx_activity_record ON activity(entity, entity_id, id);
CREATE INDEX idx_activity_user ON activity(user_id, id);
CREATE TRIGGER activity_no_update BEFORE UPDATE ON activity
  BEGIN SELECT RAISE(ABORT, 'activity is append-only'); END;
CREATE TRIGGER activity_no_delete BEFORE DELETE ON activity
  BEGIN SELECT RAISE(ABORT, 'activity is append-only'); END;

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL CHECK (entity IN ('lease', 'tenant', 'work_order', 'bill')),
  entity_id INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_record ON documents(entity, entity_id);
```

Existing tables don't change. The only change to an existing route's response
is the new `tenant_phone` on work orders.

Configuration:
- `wrangler.toml`: `[[r2_buckets]] binding = "DOCS"`,
  `bucket_name = "open-property-docs"`.
- `Env` adds `DOCS: R2Bucket`, `ACCESS_TEAM_DOMAIN?`, `ACCESS_AUD?`,
  `ADMIN_EMAIL?`, and `AUTH_DEV_USER?`.
- A new `.dev.vars.example` sets `AUTH_DEV_USER` and `ADMIN_EMAIL` to the
  same address. `.dev.vars` stays gitignored.
- We deploy ourselves with Wrangler, not Clawnify (decided 2026-10-31).
  `clawnify.json` isn't updated. The README's deploy section is rewritten
  for Wrangler, covering:
  - creating the D1 database and the R2 bucket
  - the Access application, and copying its `aud` tag
  - setting `ADMIN_EMAIL`, `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD` as Worker
    vars
  - `wrangler d1 migrations apply --remote`, then `wrangler deploy`
- `CLAUDE.md`'s Deployment section changes to match. The `@clawnify/db`
  package stays: it's the D1 adapter, not the deploy tool.

## Risks and safeguards

- **Lockout or open door on deploy.** Missing Access vars mean 401, not open
  access. The dev user needs both no Access vars and a localhost host, so
  setting `AUTH_DEV_USER` in production still doesn't bypass sign-in.
- **A route without a check.** The `ACCESS` table defaults to admin-only.
  Proof includes a script that calls every route in `index.ts` as each role
  and compares the result with table B2.
- **A write without a history row.** Proof greps that every
  `app.post/put/delete` handler calls `logActivity`, or is one of the
  documented exceptions (none are expected).
- **History isn't atomic with the change.** D1 through `@clawnify/db` has no
  transaction, so if the history insert fails after the change, the change
  stays and the API returns 500. This is rare and visible, not silent.
  Phase 6's atomic-batch proof will cover it.
- **Malicious files.** Magic bytes are checked against an allowlist; files
  are served with `nosniff` and `CSP: sandbox`; R2 keys use a uuid, never the
  filename; and the size is capped at 10 MB.
- **Personal data in history.** Old and new values can include tenant
  contact details. The full Activity page is admin-only, and per-record
  history follows the record's own access (A M).
- **Orphaned files.** Deletes are refused while documents exist (D4). If the
  R2 delete fails, the row is kept and the API returns 500, so it can be
  retried.
- **JWKS outage.** If the keys can't be fetched, the API returns 401 and
  writes nothing.

## Out of scope

- Per-property access, custom roles, and API tokens for scripts.
- Passwords, sessions, and email invites. Access handles sign-in.
- Document versions, previews, thumbnails, OCR, and virus scanning.
- History on property, unit, and application dialogs. Those are visible on
  the Activity page.
- Backfilling history for changes made before deploy.
- Tenant and owner portals.

## Open questions

None. (Clawnify deploy prompts no longer apply: we deploy with Wrangler.)

## Acceptance criteria

- [ ] With Access vars unset and no dev user, `/api/properties` returns 401
      and `/api/health` returns 200 (curl).
- [ ] An Access-mode request against a local JWKS server returns 401 for no
      token, a wrong `aud`, a wrong `iss`, an expired token, and a bad
      signature, and 200 for a valid one. Tokens are signed by a local test
      key, and `ACCESS_TEAM_DOMAIN` points at the test server.
- [ ] A valid email that isn't a user, or a deactivated user, gets 403.
      `ADMIN_EMAIL` becomes admin on first request, and only once.
- [ ] A role-matrix script calls every route as admin, manager, and
      maintenance. Each result (2xx/4xx validation, versus 403) matches
      table B2, and any route missing from the table is admin-only.
- [ ] Every write route records a history row with the user and timestamp
      (grep plus a sample curl per section), and `UPDATE` or `DELETE` on
      `activity` fails in SQL.
- [ ] Documents:
  - upload, list, open, and delete work for A and M on all four record types
  - maintenance can do the same on work orders, except delete
  - files over 10 MB, a renamed `.html`, and a bad type are rejected
  - a maintenance user gets 403 opening a lease document by id
  - deleting a record with documents gets 409
- [ ] Demoting or deactivating the last active admin gets 409.
- [ ] Browser, as each role: navigation matches the role, blocked pages show
      "You don't have access", the Users and Activity tabs work, and the
      Documents and History sections work in the four dialogs.
- [ ] Phase 1–4 flows still work as an admin. `pnpm typecheck` and
      `pnpm build` pass.

## Approval

- Product / requester: Josh, 2026-10-31 (self-deploy with Wrangler, no
  Clawnify)
- Technical review, if needed: independent review during the wrap-up slice
