# Intent: Phase 5 — Team and document foundations

Author: Josh (requester); drafted with Claude
Status: Approved 2026-10-31 (decisions 1–4 made; open-question defaults accepted)
Date: 2026-10-31
Roadmap: [Phase 5 in `intent.md`](../../../../intent.md#phase-5-team-and-document-foundations)

## Problem

- **No authentication.** The API in `src/server/index.ts` has no auth
  middleware. Anyone who can reach the Worker URL can read and change every
  record, including tenants, rent, and bills.
- **One user only.** There are no user accounts, so an operator can't add
  staff, and a maintenance tech would see tenant financials and the books.
- **No record of who did what.** Changes aren't attributed to anyone.
  Phase 6 (general ledger) depends on this: every journal entry needs a user,
  and approvals need to be separated.
- **No documents.** Signed leases, tenant IDs, work-order photos, and bill
  receipts live outside the app. There is no file storage binding.

## Proposed outcome

1. **Sign-in through Cloudflare Access.** Cloudflare Zero Trust sits in front
   of the Worker and handles sign-in (email code, Google, or Microsoft). The
   Worker verifies the Access JWT on every `/api/*` request, then looks up the
   email in a `users` table. A signed-in email that isn't an active user gets
   403. No passwords are stored. *(Decided 2026-10-31.)*
2. **Three global roles**, enforced by the API:
   - **Admin**: everything, including users and settings.
   - **Manager**: all day-to-day work, including money (rent, bills,
     budgets, reports).
   - **Maintenance**: work orders, recurring tasks, and vendors; read-only
     properties and units; no rent, bills, budgets, financial reports, or
     applications.

   Every user sees every property; there is no per-property assignment.
   *(Decided 2026-10-31.)*
3. **Activity history.** Every create, update, and delete through the API
   records the user, timestamp, record type, record id, and action. Admins
   can browse it.
4. **Documents in R2.** Files go to a private R2 bucket and are served only
   through an authenticated API route, never a public URL. Files attach to
   leases, tenants, work orders, and bills, and access follows the parent
   record's role rules. PDF and images only, 10 MB each.
   *(Decided 2026-10-31.)*
5. **Bootstrap.** A deploy-time `ADMIN_EMAIL` setting names the first admin,
   who adds everyone else. Existing records are unchanged. Activity history
   starts at deploy, and earlier changes show as "before history".
   *(Decided 2026-10-31.)*

## Affected users and systems

- Operators and their staff: everyone now signs in, and what they see depends
  on their role.
- Deployers: they must set up a Cloudflare Access application, an R2 bucket,
  and `ADMIN_EMAIL`. We deploy with Wrangler ourselves, not Clawnify, so the
  README's deploy section is rewritten for Wrangler.
- Server: auth and role middleware on every route in `src/server/index.ts`,
  plus new Users, Activity, and Documents sections. New migration
  `0004_phase5_team_docs.sql`. R2 binding in `wrangler.toml`.
- Client: a current-user fetch, nav and actions hidden by role, a Users admin
  page, an Activity view, and a documents panel on the lease, tenant, work
  order, and bill dialogs.

## Constraints and non-goals

- **The API enforces permissions.** The client hides what a role can't use,
  but every check happens on the server. The client is never trusted.
- **Fail closed.** If Access isn't configured in production, the API refuses
  every request. The local dev bypass only works when explicitly turned on.
- No passwords, sessions, or email sending in the app. Access handles
  sign-in, and invites are "add the email, then tell them the URL".
- No per-property access or custom roles. No tenant or owner portal (that
  stays out of scope, per the README).
- No document versioning, previews, OCR, or virus scanning in v1.
- Activity history is append-only. No one can edit or delete it through the
  app.
- No change to the existing tables' columns for attribution. The activity
  history carries who and when.
- Follow existing patterns: Zod plus `parseJson`, `intParam`, the commented
  sections in `index.ts`, and migrations in `migrations/`.

## Acceptance criteria

- [ ] With Access unconfigured and the dev bypass off, every `/api/*` request
      returns 401.
- [ ] A missing or invalid Access token returns 401. A valid token for an
      email that isn't an active user returns 403.
- [ ] A maintenance user gets 403 from the API (not just a hidden button) on
      rent, bills, budgets, financial reports, applications, users, and
      settings. Each role is checked against every route group.
- [ ] Every create, update, and delete shows in the activity history with the
      user and timestamp.
- [ ] Documents can only be downloaded through the API by a user whose role
      can see the parent record. There is no public R2 URL.
- [ ] An upload over 10 MB or of a disallowed type is rejected.
- [ ] `ADMIN_EMAIL` becomes admin on first sign-in. Admins can add, change the
      role of, and deactivate users. The last active admin can't be demoted
      or deactivated.
- [ ] Existing Phase 1–4 flows still work for an admin. `pnpm typecheck` and
      `pnpm build` pass.

## Open questions

Defaults the spec will use unless Josh says otherwise:

- **Activity detail:** updates store the changed fields with their old and new
  values; creates and deletes store a short label (for example the tenant's
  name). Is storing old and new values acceptable, given they can include
  tenant contact details?
- **Where history shows:** an admin-only Activity page (filter by user, record
  type, and date), plus a "History" list in each record's dialog. Is the
  per-record list wanted in v1, or the Activity page only?
- **Maintenance and tenant contact:** maintenance users see the unit's current
  tenant name and phone on a work order (to arrange entry), but not the tenant
  list, leases, or rent.
- **Removing users:** deactivate only, never delete, so history keeps the
  name. Deactivated users get 403.
- **Deleting documents:** admins and managers can delete; maintenance can
  upload and view on work orders only. Deletes remove the file from R2 and
  are logged.
- **Local dev:** `wrangler dev` uses a fixed test user only when
  `AUTH_DEV_USER` is set in `.dev.vars`. It's never read in production.
