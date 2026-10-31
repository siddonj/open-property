<img src="readme-banner.png" alt="ResiQ Property preview" width="100%" />

# ResiQ Property

**ResiQ Property management software** — a self-hosted, cloud-based alternative to TenantCloud, AppFolio, Buildium, and Propertyware for landlords, small property managers, and apartment / multi-family back-office teams.

Rental property management with everything you need to run a portfolio: properties and units, tenants and leases, rent collection and a ledger, maintenance work orders, and a vendor directory.

> Self-hosted on your own Cloudflare account (Workers, D1, R2) with Wrangler. Customize freely, own the data.

## Features

### Dashboard
- **At-a-glance KPIs** — occupancy rate, active leases, outstanding rent, open work orders
- **This month's rent** — collected, outstanding, overdue at a glance
- **Portfolio** — units occupied this month (matches the occupancy report) and units vacant now
- **Needs attention** — rent, maintenance, leases, applications, and vacant units, each split into overdue and upcoming (next 7 days, or the renewal window for leases) with a reason per item. Each item opens its record (`/rent?period=…&charge=…`, `/leases?id=…`, `/maintenance?id=…`, `/applications?id=…`, `/properties/…?unit=…`)
- **Occupancy comes from leases**: a unit is occupied in a month when a lease that isn't cancelled covers any day of it; an active lease past its end date counts through today. The unit status field no longer drives occupancy figures, so they can be lower than before this change if statuses were set by hand

### Properties & units
- Property cards with type, address, color tag, occupancy snapshot
- Per-property page with summary tiles, unit grid, a **Financials** card (income, expenses, and NOI linking to that property's P&L), and the property's work orders (open / completed / all, filterable by unit)
- Units track bedrooms, bathrooms, square footage, market rent, and status (vacant / occupied / turnover / unavailable)

### Tenants
- Searchable list showing each tenant's active unit and contact info
- Detail page with active lease, contact, employer, income, emergency contact, lease history

### Applications
- Leasing pipeline for manually recorded applications, linked to a property · unit
- Filters for active / new / screening / approved / declined / withdrawn / all, plus search by name, email, or phone
- Guided status changes (start screening, approve, decline, withdraw, reopen) and a follow-up date
- **Create tenant** from an approved application (prefills the tenant form; no lease is created automatically)

### Leases
- One row per lease with tenant, property · unit, term, monthly rent, and status
- Filters for active / expiring / upcoming / ended / all — "expiring" covers the configurable renewal window plus leases past their end date that are still active
- Edit-in-dialog with start / end / rent / deposit / due day / late fee / status
- **Renew** opens a new lease prefilled from the current one (starting the day after it ends); the original lease is left unchanged
- Move-in and move-out **checklists** per lease, seeded with default items and editable, with progress shown on the list

### Rent ledger
- One charge per active lease per month, generated idempotently with one click
- Period navigator (◀ / today / ▶) and totals: charged, collected, outstanding, overdue
- Record payments by amount, method, date, and reference. Status auto-updates as payments roll in
- Past payments visible per charge with one-click removal

### Maintenance
- Work orders with title, description, priority (urgent / high / normal / low), and status (open / assigned / in progress / completed / cancelled)
- Tabs: open / unassigned / assigned / in progress / completed / all, plus schedule (overdue / due in 7 days / unscheduled), property, and unit filters
- Link work orders to a property, unit, and vendor; track scheduled date, estimated cost, and actual cost
- Overdue work is labeled with days overdue; completion date is recorded automatically
- **Recurring tasks** — weekly or monthly preventive-maintenance templates. "Generate due tasks" creates work orders for the next 14 days without duplicates; a missed stretch yields one overdue work order, not a backlog
- **Approval threshold** — work orders whose estimate exceeds the threshold (Settings) need approval before they can be in progress or completed
- **Record as expense** — a completed work order with a cost opens a prefilled bill linked to it; each work order can be billed once

### Expenses
- Bills from vendors, each with one or more lines coded to the chart of accounts (operating, below-NOI, or capital) and optionally to a unit
- Tabs for unpaid / overdue / paid / all with counts and totals, plus property, vendor, account, and date-range filters
- Record payments by date, method, and reference; voiding a payment keeps it on record. A bill with live payments is read-only, and one with any payment history can't be deleted
- CSV export with a totals row
- Properties and vendors with bills can't be deleted, so financial records are kept

### Reports
- Rent roll, delinquency, occupancy, and maintenance spend, each filterable by property
- **Income** — rent charged and collected by charge period, filterable by property
- **Profit & loss** — monthly income and expenses by account, with operating, below-NOI, and capital groups and NOI. Expenses come from bill lines only (record work orders as expenses to include them)
- **Budget** — annual amounts per property and account, edited inline, with actual, variance, and percent used
- CSV export on each report

### Team, history & documents
- **Sign-in through Cloudflare Access** (email code, Google, or Microsoft). The app stores no passwords; it checks Access's signed token on every API request and refuses everything when sign-in isn't configured
- **Three roles**, enforced by the API: **Admin** (everything, including users and settings), **Manager** (all day-to-day work, including money), **Maintenance** (work orders, recurring tasks, vendors, and read-only properties; no rent, tenants, leases, bills, reports, or applications). Any new API route is admin-only until it's given a role
- **Users** (Settings → Users, admins): add people by email, change roles, deactivate. Users are never deleted, and there's always at least one active admin
- **Activity history**: every change records who, when, and which fields changed (old → new). Admins browse it in Settings → Activity; admins and managers see a History list on leases, tenants, work orders, and bills. History can't be edited or deleted, even in SQL
- **Documents** on leases, tenants, work orders, and bills: PDF, JPEG, PNG, or WebP up to 10 MB, checked by content. Files live in a private R2 bucket and open only through the API, for users whose role can see the record. Maintenance can add photos to work orders. Records with documents can't be deleted until the documents are

### Vendors & policy
- Vendor directory by category (plumber / electrician / HVAC / handyman / cleaning / landscaping / general)
- Rent policy defaults: due day, late fee, grace days, currency
- Lease renewal window (days before end date that a lease is flagged)
- Maintenance approval threshold (empty = approval off)

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4 + shadcn/ui (Radix primitives)
- Hono on Cloudflare Workers (D1-native — same code locally and in production)
- `lucide-react` for icons
- pushState URL routing

## Develop

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then put your email in both lines
pnpm dev          # Vite at :5173, Wrangler at :8787 (D1 schema applied automatically)
pnpm typecheck
pnpm build
```

**Local sign-in.** Without `.dev.vars` every API call returns 401 and the app shows "Sign-in required". `AUTH_DEV_USER` signs you in as that email, but only on `localhost` and only when Cloudflare Access isn't configured; `ADMIN_EMAIL` makes that email the first admin. To try another role, add a user in Settings → Users and change `AUTH_DEV_USER` to their email (restart `pnpm dev`).

**Checking auth and access.** `scripts/check-auth.mjs` signs test tokens with a local key and checks sign-in, every route for every role, activity history, and documents. Run it against a throwaway local database (it creates records):

```bash
wrangler dev --port 8812 --var ACCESS_TEAM_DOMAIN:http://127.0.0.1:8899 --var ACCESS_AUD:check-aud --var ADMIN_EMAIL:admin@check.test
node scripts/check-auth.mjs http://127.0.0.1:8812
```

The dev script applies `src/server/schema.sql` (the baseline schema) and then any pending migrations in `migrations/` to the local D1 database, then runs Vite and Wrangler in parallel. The schema seeds 3 sample properties, 5 units, and 3 vendors so the app is usable on first boot.

Schema changes after the baseline go in a new numbered file in `migrations/` (applied once and tracked by Wrangler in `d1_migrations`), not in `schema.sql`.

For the repository's Claude Code AI-native SDLC workflow and change templates, see [docs/sdlc/README.md](docs/sdlc/README.md).

## Deploy

One Cloudflare Worker serves both the built app (`dist`, via `[assets]` in `wrangler.toml`) and the API (`/api/*`). You need a Cloudflare account and Wrangler logged in (`wrangler login`).

**1. Create the database and file bucket** (first deploy only):

```bash
wrangler d1 create open-property-db      # copy the database_id it prints into wrangler.toml
wrangler r2 bucket create open-property-docs
```

**2. Set up Cloudflare Access** (Zero Trust dashboard → Access → Applications → Add a self-hosted application):

- Application domain: your Worker's hostname (custom domain or `*.workers.dev`).
- Add a policy that allows the people who should sign in (for example their emails, or your email domain).
- Copy the application's **Application Audience (AUD) tag**, and note your team domain (`https://<team>.cloudflareaccess.com`).

Access must cover the whole hostname. The app only checks the token Access adds; a request that skips Access has no token and gets 401.

**3. Set the Worker's variables** (dashboard → the Worker → Settings → Variables, or `[vars]` in a private copy of `wrangler.toml`):

| Variable | Value |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | the Application Audience tag |
| `ADMIN_EMAIL` | the first admin's email (they add everyone else in Settings → Users) |

Never set `AUTH_DEV_USER` on a deployed Worker. It's ignored off `localhost` and whenever Access is configured, but it doesn't belong there.

**4. Apply the schema, then build and deploy:**

```bash
wrangler d1 execute open-property-db --remote --file=src/server/schema.sql   # first deploy only
wrangler d1 migrations apply open-property-db --remote
pnpm build
wrangler deploy
```

**Upgrading.** Apply new migrations **before** deploying the new code — the API reads new tables (for example, sign-in reads `users`) and fails until they exist. Upgrading to the Phase 5 release also needs steps 1 (the R2 bucket), 2 and 3 first: until `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, the deployed app refuses every request.

## Project layout

```
src/
  server/
    index.ts        Hono routes for every entity
    db.ts           D1 adapter (query / get / run)
    schema.sql      Baseline tables + seed data
migrations/         Numbered schema changes applied after the baseline
  client/
    app.tsx         Shell + routing
    components/
      dashboard/    Portfolio + month-at-a-glance
      properties/   List, property detail, property + unit dialogs
      tenants/      List, tenant detail, tenant dialog
      applications/ Applications pipeline + application dialog
      leases/       Leases page, lease dialog, move-in/out checklist dialog
      rent/         Rent ledger + payment dialog
      maintenance/  Work orders board, work-order dialog, recurring tasks
      expenses/     Bills list + bill dialog
      reports/      Report tabs (rent roll, income, P&L, budget, ...)
      settings/     Vendors, rent policy, users, activity
      documents/    Documents panel + record history list
      ui/           Vendored shadcn primitives
    hooks/          use-router, use-app-state
    lib/utils.ts    cn helper, color palette, date / money / period helpers
    lib/permissions.ts  What each role is shown (the API enforces the same rules)
scripts/
  check-auth.mjs    Sign-in, role, history, and document checks against a local Worker
```

## What's intentionally not included

To keep this template self-hostable with no third-party SaaS dependencies and no public-facing endpoints, these features are out of scope:

- Listing syndication to external rental sites
- Real credit / background screening (placeholder application records only)
- 2-way SMS, email blasts, automated texting
- Online card / ACH payment processing
- Public tenant or owner portals

These can all be layered on top once you fork the template.

## License

MIT
