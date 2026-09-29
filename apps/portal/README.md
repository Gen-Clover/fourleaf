# Gen Clover Portal

Gen Clover's financial control system: rate card and pricing, projects and delivery (milestones, team, timesheets), finance (invoices, payments, expenses, payroll, P&L, cash flow, receivables, project profitability), and treasury (cash-based allocation into live funds, commitments, runway, hire planning, sales pipeline, CFO dashboard with alerts). Books are kept in ₹; clients are billed in US$.

Plain-language overview for the team: [`docs/Gen-Clover-Portal-Overview.md`](docs/Gen-Clover-Portal-Overview.md).
Source of truth for all defaults: [`docs/Gen-Clover-Rate-Card-2026.md`](docs/Gen-Clover-Rate-Card-2026.md) (Final v2), loaded by `prisma/seed.ts`.

## Run it

```bash
npm install          # also generates the Prisma client
npm run setup        # creates prisma/dev.db and seeds rate card, formula, admin user, sample project
npm run dev          # http://localhost:3000
```

Sign in with `admin@genclover.local` / `ChangeMe@2026` (set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env` before seeding to change them), then change the password under **Admin → Users & Roles**.

`.env` needs `DATABASE_URL` and a long random `AUTH_SECRET` — see `.env.example`.

For production: `npm run build && npm start`.

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
6. **Issue** the invoice. It gets the next consecutive GST number `GC/26-27/0001` (per Indian FY), and the month is locked. **Print** it as an export-of-services invoice under LUT.
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
- **Projects**: auto IDs (`GC-YYYY-0001`), client, resource plan from the rate card (Standard / Floor / Premium / Custom tiers, headcount, hours), quoted vs agreed rates, below-floor warnings, package alternatives, **Agreement** (T&M, Retainer, Blended or Fixed monthly), **Milestones**, **Team & Cost** (assignments, people cost, margin), **Monthly Billing** (actual hours from timesheets, adjustments, one-click invoice; status follows the invoice) and a printable **client quote** that never shows the internal allocation.
- **Timesheets / People**: weekly hours per person, utilisation, ₹ cost (admin only) and the monthly payroll run.
- **Invoices / Expenses / Reports**: GST export invoices and payments, spend by bucket, P&L vs plan, cash flow, receivables aging, project profitability and CSV exports.
- **Quick Calculator**: price a team instantly, compare commercial models, see the US onsite comparison, and save it as a project.
- **Rate Card**: live view with floor, premium, per-bucket split, savings vs US, market position and cost coverage.
- **Admin Panel**: edit the rate card; edit the formula parameters (FX, hours, US load factor, coverage target, floor rule, premium %, rounding, packages); edit the allocation buckets (must total 100%); manage users; view the audit log.

## Design notes

- All formulas live in `src/lib/calc.ts` (pricing) and `src/lib/finance.ts` (FY, FX, aging, cost rates, budget variance). Both are pure functions shared by server and client. `src/lib/ledger.ts` builds the P&L, cash flow and project profitability, and `src/lib/invoicing.ts` keeps invoice totals and statuses and the linked months in sync.
- Revenue is booked in ₹ at the invoice's booking FX (settings FX for months not yet invoiced). Bucket budgets use each project's own allocation snapshot. Bank charges on receipts count as Corporate Ops spend.
- Treasury lives in `src/lib/treasury.ts` (fund balances, obligations, burn, runway, forecast) and `src/lib/alerts.ts` (alert rules); the pure maths (`allocateCash`, `occurrences`, `simulateHire`) is in `src/lib/finance.ts`. Allocations are stored per payment and cascade-delete with it; expense debits are computed live, so editing an expense never leaves a fund out of sync.
- Draft invoices carry a temporary `DRAFT-…` number, and the real consecutive number is assigned on issue, so deleted drafts never leave gaps. Issued invoices can't be edited or deleted, only voided (admin). Voiding releases the month and pass-through costs for re-billing.
- Projects store a **snapshot** of the allocation buckets, and resources store standard/floor rate snapshots, so later rate-card or formula changes never rewrite history. An admin can apply the current model to a project from its Overview tab.
- Monthly records store the computed hours and revenue at save time.
- Every change is written to the audit log.
- The database is SQLite for simple local use. To move to Postgres, change `provider` in `prisma/schema.prisma` and `DATABASE_URL`.
