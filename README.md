# Gen Clover Portal

One internal web app that hosts every Gen Clover tool behind a single login, on one MongoDB database. The design follows genclover.com (dark by default, light on toggle).

| Tool | Folder | What it does |
|---|---|---|
| **Finance** | `tools/finance` | Rate card and pricing, projects and delivery, invoicing, expenses, payroll, reports, treasury and CFO dashboard |
| **Lead Finder** | `tools/lead-finder` | Google Maps searches by niche and area, website checks, lead scores per service, outreach messages, follow-ups, convert to client |

## Layout

```
genclover-portal/                one git repo, npm workspaces
├── apps/portal/                 the Next.js app: login, portal home (a tile per tool), each tool's top navigation, one-line route files that point at tool pages
├── apps/workers/                background worker: runs every tool's jobs from the Job table (searches, website checks)
├── tools/<name>/                one self-contained folder per tool (pages, server actions, logic, nav.ts)
├── packages/db/                 MongoDB schema (prisma/schema/*.prisma), Prisma client, seed, scripts
├── packages/auth/               login sessions and role checks
├── packages/ids/                readable IDs: lead GL-…, client GC-2026-0001 + code ABR, project ABR-P01, invoice GCI/26-27/0001
├── packages/ui/                 shared components, formatting, theme (styles.css), logo, theme toggle
└── docs/                        roadmap (genclover-portal/), finance docs, lead-generation strategy and plans
```

Rules that keep tools independent:
1. A tool never imports another tool. Tools only use `packages/*`.
2. Each tool owns its tables in its own schema file (`packages/db/prisma/schema/<tool>.prisma`). Shared tables (`User`, `Setting`, `Client`, `AuditLog`, `Sequence`) are in `core.prisma`.
3. Long-running work goes in a background worker, not a web request: add a job with `enqueue()` from `@genclover/db/jobs` and register its handler in `apps/workers/src/index.ts`.

**Adding a tool:** create `tools/<name>` with a `package.json` named `@genclover/<name>`, put its pages under `src/app/`, export its menu from `src/nav.ts` (with its `home` URL), add a tile to `TOOLS` in `apps/portal/src/app/(home)/page.tsx`, create a route group `apps/portal/src/app/(<name>)/` whose `layout.tsx` wraps pages in `ToolShell` with the tool's menu, add a one-line route file per page in it, and add the package to `transpilePackages` in `apps/portal/next.config.ts`.

## Run it

Needs Node 22+ (24 recommended) and a MongoDB **replica set**. Transactions need one: MongoDB Atlas always is, and a local server must be started as a single-node replica set.

**Local database, no install:** `npm run db:local` downloads MongoDB on first run and starts a single-node replica set on `127.0.0.1:27017`, keeping data in `.mongo-data/` (ignored by git). Keep it running in its own terminal and point `.env` at it with the local `DATABASE_URL` line in `.env.example`. Stop it with Ctrl+C.

```bash
npm install          # installs every workspace and generates the Prisma client
npm run setup        # creates collections and indexes, seeds rate card, formula, admin user, sample project
npm run dev          # portal + worker; http://localhost:3000: portal home, Financial System at /finance, Lead Finder at /leads
```

For daily use, run the production build. It's much faster than dev mode: `npm run build && npm start`, plus `npm run worker` in a second terminal for background jobs.

`.env` lives at the repo root and needs `DATABASE_URL` (MongoDB connection string with the database name, for example `mongodb+srv://user:pass@cluster.mongodb.net/genclover`) and a long random `AUTH_SECRET`. The Lead Finder also needs `GOOGLE_MAPS_API_KEY` (Places API (New) and PageSpeed Insights API enabled) to search Google Maps. To send outreach email from the portal and detect replies, add the `SMTP_*`, `EMAIL_FROM` and (optionally) `IMAP_*` settings. See `.env.example`. For the lowest latency from India, create the Atlas cluster in **Mumbai (ap-south-1)**.

Sign in with `admin@genclover.local` / `ChangeMe@2026` (set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env` before seeding to change them), then change the password under **Admin → Users & Roles**.

| Command | What it does |
|---|---|
| `npm run db:local` | Start the local MongoDB (single-node replica set, data in `.mongo-data/`) |
| `npm run db:push` | Apply schema changes (collections and indexes), then run `packages/db/scripts/after-push.ts` and `packages/ids/scripts/backfill.ts` (gives any record without a readable ID one) |
| `npm run db:seed` | Seed defaults (safe to re-run: existing rows are kept) |
| `npm run db:migrate-sqlite -- <path/to/dev.db>` | One-off copy of the old SQLite database into an **empty** MongoDB database. Keeps every id and checks row counts |
| `npm run dev:portal` / `npm run worker` | Start only the portal (dev) / only the background worker |
| `npm run typecheck` | Type-check the portal and every tool and package |

### MongoDB notes

- IDs are the same cuid strings as before, stored as `_id`, so links and URLs didn't change.
- **Empty fields behave like SQL.** Prisma on MongoDB normally leaves out optional fields you don't set, so `where: { paidOn: null }` would miss them. `packages/db/src/sql-nulls.ts` stores every omitted optional field as an explicit `null`, and `after-push.ts` backfills `null` into documents that are missing a field, for example after a new optional field is added.
- MongoDB compares a missing or null value as *smaller* than any date or number. A range filter such as `{ dueDate: { lt: today } }` on an optional field must also say `not: null`, or empty values match.
- `InvoiceLine.expenseId` must be unique when set (an expense is billed once). It's a partial unique index created by `after-push.ts`, because Prisma can't express one.
- Text search that should ignore case needs `mode: "insensitive"` (SQLite ignored case by default).

---

# Finance tool

Rate card and pricing, projects and delivery (milestones, team, timesheets), finance (invoices, payments, expenses, payroll, P&L, cash flow, receivables, project profitability), and treasury (cash-based allocation into live funds, commitments, runway, hire planning, sales pipeline, CFO dashboard with alerts). Books are kept in ₹; clients are billed in US$.

Plain-language overview for the team: [`docs/finance/Gen-Clover-Portal-Overview.md`](docs/finance/Gen-Clover-Portal-Overview.md).
Source of truth for all defaults: [`docs/finance/Gen-Clover-Rate-Card-2026.md`](docs/finance/Gen-Clover-Rate-Card-2026.md) (Final v2), loaded by `packages/db/prisma/seed.ts`.

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything, plus the Admin Panel: rate card, formula & allocation buckets, financial policies, users, audit log, deleting projects/clients. Only admins see and edit people's salaries/cost, run payroll, record fund openings/transfers/adjustments, void invoices and delete payments/expenses |
| **Editor** | Create/edit clients, projects (incl. pipeline probability), resource plans, agreements, milestones, team, timesheets, monthly billing, invoices, payments, expenses and commitments; view CFO dashboard, funds, hire planner, pipeline, reports and CSV exports |
| **Viewer** | Read-only access to dashboard, projects, clients, timesheets, billing, invoices, rate card and calculator. No access to People, Expenses, Reports or any Financial Control page |

## End-to-end flow

1. **Price** a team in the Quick Calculator or a project's *Resources & Quote* tab → print the client quote.
2. **Agree** terms on the *Agreement* tab (T&M, Retainer, Blended or Fixed) → project becomes Active.
3. **Plan delivery**: *Milestones* tab (owner, due date, status) and *Team & Cost* tab (assign people to quote lines).
4. **Log time** weekly on **Timesheets**. Each entry snapshots the person's ₹/hr, so salary changes never rewrite history.
5. **Bill the month**: *Monthly Billing* → *Load hours from timesheets* → save → **Create invoice**. The draft invoice gets services lines for the engagement model plus any unbilled pass-through costs.
6. **Issue** the invoice. It gets the next consecutive GST number `GCI/26-27/0001` (per Indian FY), and the month is locked. **Print** it as an export-of-services invoice under LUT.
7. **Record payments** as they land: US$ settled, ₹ credited and bank charges. Realised FX gain/loss is computed against the invoice's booking FX. Part payments are supported, and the invoice and month move to Paid automatically.
8. **Book spend** on **Expenses**. Each category maps to a 65/10/25 bucket, and client pass-through costs sit outside the model and are re-billed at cost. **People → Run payroll** creates the month's salary and contractor expenses.
9. **Review** on **Reports**: P&L with budget vs actual per bucket, cash flow, receivables aging and project profitability, plus CSV exports for the CA (sales register, payments/FIRC, purchase register, timesheets, P&L).

Fill in **Admin → Formula & Allocation → Invoicing** (legal name, address, GSTIN, LUT ARN, bank details, invoice prefix, payment terms) before issuing the first invoice.

## Financial control (treasury)

Revenue is not cash: funds are filled only when a client **pays**.

1. **Policy** (Admin → Financial Policies): the live allocation % per fund. Seeded: *Rate Card v2 (65/10/25)* (active), *Base allocation*, and *Startup / Growth / Mature* proposals. Activating a policy writes its % onto the allocation buckets.
2. **Allocation engine**: recording a payment splits the ₹ credited into funds by the live policy (`FundEntry` rows of type `ALLOCATION`, tagged with the policy name). The invoice's pass-through share goes to the *Client pass-through (clearing)* fund.
3. **Funds**: balance = allocations + opening/transfer/adjustment entries − paid expenses (amount + GST) of categories mapped to the fund. Admins record opening balances (split the real bank balance) and transfers such as an emergency withdrawal from Survival.
4. **Commitments**: payroll (derived from People), unpaid bills, and scheduled commitments (rent, tax, subscriptions, loans, contractors; one-off/monthly/quarterly/yearly). Those due within the horizon (default 30 days) are *committed*; **available = balance − committed**.
5. **Runway**: monthly unavoidable burn = payroll + essential commitments; survival runway = survival fund available ÷ burn (target 12, minimum 6 months).
6. **CFO Dashboard**: cash, committed, available to spend, funds table, runway, 6-month cash forecast, and alerts ranked critical / warning / attention / healthy. Thresholds live under *Formula & Allocation → Treasury & alerts*.
7. **Hire Planner**: simulates a hire (contract → funds → delivery surplus → expected profit, cash needed before the first payment, burn and runway impact) and gives a verdict.
8. **Sales Pipeline**: draft/quoted/negotiation projects with win probability and expected close; weighted pipeline vs payroll. Feeds the cash forecast.

## What's in it

- **Dashboard**: run-rate, pipeline, billed this month, outstanding invoices, YTD revenue/delivery/profit, 12-month revenue by allocation bucket, revenue by client, alerts (below-floor rates, unrecorded months, overdue invoices, late milestones); for editors and admins also spend this month, unpaid bills and overdue receivables.
- **Projects**: auto IDs from the client code (`ABR-P01`), type (project or care plan), client, resource plan from the rate card (Standard / Floor / Premium / Custom tiers, headcount, hours), quoted vs agreed rates, below-floor warnings, package alternatives, **Agreement** (T&M, Retainer, Blended or Fixed monthly), **Milestones**, **Team & Cost** (assignments, people cost, margin), **Monthly Billing** (actual hours from timesheets, adjustments, one-click invoice; status follows the invoice) and a printable **client quote** that never shows the internal allocation.
- **Timesheets / People**: weekly hours per person, utilisation, ₹ cost (admin only) and the monthly payroll run.
- **Invoices / Expenses / Reports**: GST export invoices and payments, spend by bucket, P&L vs plan, cash flow, receivables aging, project profitability and CSV exports.
- **Quick Calculator**: price a team instantly, compare commercial models, see the US onsite comparison, and save it as a project.
- **Rate Card**: live view with floor, premium, per-bucket split, savings vs US, market position and cost coverage.
- **Admin Panel**: edit the rate card; edit the formula parameters (FX, hours, US load factor, coverage target, floor rule, premium %, rounding, packages); edit the allocation buckets (must total 100%); manage users; view the audit log.

## Design notes

- All formulas live in `tools/finance/src/lib/calc.ts` (pricing) and `tools/finance/src/lib/finance.ts` (FY, FX, aging, cost rates, budget variance). Both are pure functions shared by server and client. `lib/ledger.ts` builds the P&L, cash flow and project profitability, and `lib/invoicing.ts` keeps invoice totals and statuses and the linked months in sync.
- Revenue is booked in ₹ at the invoice's booking FX (settings FX for months not yet invoiced). Bucket budgets use each project's own allocation snapshot. Bank charges on receipts count as Corporate Ops spend.
- Treasury lives in `lib/treasury.ts` (fund balances, obligations, burn, runway, forecast) and `lib/alerts.ts` (alert rules); the pure maths (`allocateCash`, `occurrences`, `simulateHire`) is in `lib/finance.ts`. Allocations are stored per payment and cascade-delete with it; expense debits are computed live, so editing an expense never leaves a fund out of sync.
- Draft invoices carry a temporary `DRAFT-…` number, and the real consecutive number is assigned on issue, so deleted drafts never leave gaps. Issued invoices can't be edited or deleted, only voided (admin). Voiding releases the month and pass-through costs for re-billing.
- Projects store a **snapshot** of the allocation buckets, and resources store standard/floor rate snapshots, so later rate-card or formula changes never rewrite history. An admin can apply the current model to a project from its Overview tab.
- Monthly records store the computed hours and revenue at save time.
- Every change is written to the audit log.
- The database is MongoDB (see *MongoDB notes* above). The finance tables are in `packages/db/prisma/schema/finance.prisma`.
