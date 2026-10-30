<img src="readme-banner.png" alt="ResiQ Property preview" width="100%" />

# ResiQ Property

[![Deploy with Clawnify](https://app.clawnify.com/deploy-button.svg)](https://app.clawnify.com/deploy?repo=clawnify/open-property)

**ResiQ Property management software** — a self-hosted, cloud-based alternative to TenantCloud, AppFolio, Buildium, and Propertyware for landlords, small property managers, and apartment / multi-family back-office teams.

Rental property management with everything you need to run a portfolio: properties and units, tenants and leases, rent collection and a ledger, maintenance work orders, and a vendor directory.

> Built on the [Clawnify](https://clawnify.com) template format. Deploy your own copy in minutes, customize freely, own the data.

## Features

### Dashboard
- **At-a-glance KPIs** — occupancy rate, active leases, outstanding rent, open work orders
- **This month's rent** — collected, outstanding, overdue at a glance
- **Open work orders** (overdue first, with an overdue count) + **lease expirations** — expired-but-still-active leases and those inside the renewal window
- **Application follow-ups due** — active applications whose follow-up date has arrived

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
- Rent roll, delinquency, occupancy, and maintenance spend
- **Income** — rent charged and collected by charge period, filterable by property
- **Profit & loss** — monthly income and expenses by account, with operating, below-NOI, and capital groups and NOI. Expenses come from bill lines only (record work orders as expenses to include them)
- **Budget** — annual amounts per property and account, edited inline, with actual, variance, and percent used
- CSV export on each report

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
pnpm dev          # Vite at :5173, Wrangler at :8787 (D1 schema applied automatically)
pnpm typecheck
pnpm build
```

The dev script applies `src/server/schema.sql` (the baseline schema) and then any pending migrations in `migrations/` to the local D1 database, then runs Vite and Wrangler in parallel. The schema seeds 3 sample properties, 5 units, and 3 vendors so the app is usable on first boot.

Schema changes after the baseline go in a new numbered file in `migrations/` (applied once and tracked by Wrangler in `d1_migrations`), not in `schema.sql`.

For the repository's Claude Code AI-native SDLC workflow and change templates, see [docs/sdlc/README.md](docs/sdlc/README.md).

## Deploy

If you have the Clawnify CLI installed:

```bash
clawnify deploy
```

Or wire it up to Cloudflare Workers + D1 directly using the bindings in `wrangler.toml` (binding `DB`, database name `open-property-db`).

After deploying, apply the baseline schema and migrations to the remote database. When upgrading an existing deployment, apply new migrations **before** deploying the new code — the API reads new tables (for example, work orders read `bill_lines`) and fails until they exist:

```bash
wrangler d1 execute open-property-db --remote --file=src/server/schema.sql
wrangler d1 migrations apply open-property-db --remote
```

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
      settings/     Vendors + rent policy defaults
      ui/           Vendored shadcn primitives
    hooks/          use-router, use-app-state
    lib/utils.ts    cn helper, color palette, date / money / period helpers
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
