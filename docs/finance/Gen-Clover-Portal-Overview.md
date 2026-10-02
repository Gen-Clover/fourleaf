# Gen Clover Portal: Financial Control System

**One system to price, deliver, bill, collect and control every rupee at Gen Clover.**
Clients are billed in US$. Our books and funds are kept in ₹.

> The core question it answers: **"What can Gen Clover safely spend, hire or invest right now, and what happens if we do?"**

---

## 1. The big idea

**Revenue is not cash.** A signed $100K contract is not $100K in the bank.

```
Contract → Invoice → Payment received → Allocation engine → Funds → Spending → Real-time position → Alerts → CFO decision
```

Only when a client **actually pays** does the money get split into **funds**. Every fund is a live balance: it goes up when cash arrives and down when money is spent.

Two separate ideas:

| Concept | Question it answers | Where |
|---|---|---|
| **Allocation %** (rules) | "When $100 arrives, where should it go?" | Admin → Financial Policies |
| **Fund balance** (actuals) | "How much do we actually have for this purpose?" | Funds, CFO Dashboard |

And every fund shows **Balance − Committed = Available**. Money already promised doesn't count as spendable.

## 2. The funds

| Fund | Pays for |
|---|---|
| Delivery | Salaries and contractors doing client work |
| Growth / Talent / R&D | Hiring, training, AI R&D, incentives |
| Corporate Operations | CA, audit, legal, compliance, taxes, rent, banking |
| Technology / Infrastructure | AI tools, M365, GitHub, cloud, security |
| Sales / Marketing | Leads, website, CRM, proposals |
| Working Capital / Risk | Payment delays, FX, bench, bad debt |
| **Survival Reserve** | Runway: target 12 months of unavoidable burn |
| **Ventures & Investments** | New products, companies, investments, acquisitions |
| **Business Development & Founder Ops** | Client meetings, travel, conferences, networking, memberships, market exploration (an operating expense, not lifestyle) |
| Retained Profit | Profit kept, reinvested or distributed |
| Client pass-through (clearing) | Hosting, APIs, SaaS billed back to clients at cost (outside the model) |

## 3. Financial policies (allocation by company stage)

One policy is live at a time. An admin can switch it in one click.

| Policy | Delivery | Talent | Ops | Tech | Sales | Working cap. | Survival | Ventures | BD | Profit |
|---|---|---|---|---|---|---|---|---|---|---|
| **Final allocation (Oct 2026)** *(live)* | 40 | 7 | 7 | 4 | 5 | 9 | 5 | 3 | 5 | 15 |
| Rate Card v2 | 65 | 10 | 8 | 4 | 4 | 4 | 0 | 0 | 0 | 5 |
| Base allocation | 55 | 5 | 7 | 3 | 4 | 4 | 10 | 4 | 2 | 6 |
| Startup *(proposal)* | 56 | 4 | 7 | 3 | 6 | 4 | 12 | 1 | 2 | 5 |
| Growth *(proposal)* | 56 | 8 | 6 | 3 | 6 | 4 | 8 | 2 | 3 | 4 |
| Mature *(proposal)* | 52 | 5 | 6 | 3 | 4 | 4 | 8 | 7 | 2 | 9 |

- The final allocation (October 2026) is live. Its purpose, subcategories (what each bucket is spent on), exclusions and examples are on **Settings & formula → Where the money goes**. The 2026 rates were priced on 65% delivery: at 40% the rate card's cost-coverage check shows 6 roles under cost and 10 tight, so review the rates.
- Startup, Growth and Mature are starting proposals following the research's direction (startup = survival and sales, growth = talent and sales, mature = profit and ventures). Review them before use.
- A policy change affects **future** receipts and new projects. **Apply to existing projects and receipts** (Financial Policies) brings existing project snapshots and past receipts' fund split onto the live policy; fund transfers and spends are not touched.

## 4. How money flows through the system

| Step | Where | What happens |
|---|---|---|
| 1. Pipeline | **Sales Pipeline** | Opportunities (draft, quoted or negotiating projects) with win probability and expected close. Shows weighted revenue vs payroll. |
| 2. Can we afford it? | **Hire Planner** | Simulates a hire before onboarding (see §5). |
| 3. Price & agree | Project → *Resources & Quote*, *Agreement* | Rate-card pricing, floor warnings, then the agreed model: T&M, Retainer, Blended or Fixed. |
| 4. Deliver | *Milestones*, *Team & Cost*, **Timesheets** | People assigned to quote lines. Weekly hours carry each person's ₹/hr cost. |
| 5. Bill | *Monthly Billing* → **Invoices** | Hours come from timesheets. One click creates the invoice, and issuing it assigns GST number `GCI/26-27/0001`. |
| 6. Get paid | invoice page | Record US$ settled and ₹ credited. **The allocation engine splits the ₹ into funds automatically.** FX gain/loss is calculated. |
| 7. Spend | **Expenses**, **People → Run payroll** | Each category belongs to a fund. Paid spending leaves that fund. Unpaid bills count as commitments. |
| 8. Commit | **Commitments** | Rent, taxes, subscriptions, loans, contractor retainers. Payroll is added automatically from People. |
| 9. Control | **CFO Dashboard**, **Funds** | Cash, committed, available, runway, 6-month forecast, alerts. Fund transfers (e.g. an emergency withdrawal from Survival) are logged with a reason. |
| 10. Report | **Reports** | P&L vs plan, cash flow, receivables aging, project profitability, CSV exports for the CA. |

## 5. Hire Planner: "Can we afford this resource?"

Enter the role, client rate, hours, contract length, salaried or contractor, monthly cost, bench months after the contract, onboarding cost and months until the first payment.

It shows:
- **Contract → funds:** how the contract revenue splits under the live policy
- **Delivery economics:** delivery allocation − resource cost − bench − onboarding = delivery surplus, plus the profit fund = **expected profit**, and delivery coverage vs the 1.25× target
- **Future obligations:** cash needed before the first payment vs available cash, monthly burn before → after, survival runway before → after
- **Verdict:** 🟢 Affordable · 🟠 Tight · 🔴 Not affordable as structured, with the reasons

## 6. CFO Dashboard

- **Bank cash** (the sum of all funds) − **committed** (payroll, bills, tax, rent… due in the next 30 days) = **available to spend**
- **Funds table:** balance, committed and available for each fund, flagged when it's over-committed
- **Monthly unavoidable burn** = payroll + essential commitments
- **Survival runway** = survival fund ÷ burn, against a 12-month target (6-month minimum)
- **6-month cash forecast:** expected receipts (open invoices, active projects, weighted pipeline) vs obligations, giving projected cash
- **Alerts**, ranked:

| Level | Examples |
|---|---|
| 🔴 Critical | Payroll can't be covered · cash below minimum · a fund negative or unable to meet its commitments · obligations exceed cash · forecast goes negative · survival runway below minimum |
| 🟠 Warning | Bench above 10% · pipeline under 1.3× payroll · survival below target · fund 80%+ committed · project people cost above its delivery share · receivables 60+ days late |
| 🟡 Attention | Utilisation falling · project margin under 20% · client payment overdue · salary review due in 30 days · late milestones · pass-through awaiting reimbursement |
| 🟢 Healthy | Runway target achieved · utilisation ≥ 75% · profit above plan · cash covers all near-term obligations |

All thresholds are editable: **Admin → Formula & Allocation → Treasury & alerts**.

## 7. Who can do what

| Role | Access |
|---|---|
| **Admin** | Everything: salaries, payroll, policies, fund opening balances and transfers, voiding invoices |
| **Editor** | Day-to-day work plus CFO dashboard, funds (view), commitments, hire planner, pipeline, reports |
| **Viewer** | Read-only projects, billing and invoices. No money-control pages |

## 8. Getting started

```powershell
cd "D:\2026\gen-clover\code\genclover-portal"
npm run build; npm start   # then open http://localhost:3000 (use `npm run dev` while changing code)
```

1. Change the admin password: **Admin → Users & Roles**.
2. Company and invoice details: **Admin → Formula & Allocation → Invoicing**.
3. Choose the live policy: **Admin → Financial Policies**.
4. **Funds → Opening balance:** split today's actual bank balance across the funds.
5. **People:** add the team with monthly cost (this is your payroll commitment).
6. **Commitments:** add rent, taxes, subscriptions, loans.
7. Check the **CFO Dashboard**. From then on, every recorded payment fills the funds automatically.

## 9. Under the hood

- **Stack:** Next.js 15, React 19, Prisma, MongoDB (Atlas), Tailwind, Recharts. The finance tool is one of the tools in the Gen Clover Portal (`tools/finance` in the `genclover-portal` repo).
- **Engine files** (in `tools/finance/src/lib/`): `finance.ts` (allocation, commitment schedules, hire simulation, FX, FY), `treasury.ts` (fund balances, obligations, burn, runway, forecast), `alerts.ts` (alert rules), `ledger.ts` (P&L and reports), `invoicing.ts` (invoice numbering and sync).
- **Integrity:** allocations are stored per payment with the policy name, so deleting a payment removes its allocations. Paid expenses are debited live from the Expenses table. Rates, costs and allocation snapshots are never rewritten. Every change is in the audit log.
- **Tested:** 100 end-to-end checks against the running app, plus unit checks of the allocation and hire-simulation maths.

## 10. Not yet built

- Leads before a client exists (today a lead is a draft project under a client)
- Multi-milestone billing schedules and multi-currency bank accounts
- Profit distribution workflow (use a transfer or the "Profit distribution" expense category for now)
- Timesheet approval, TDS and GST return filing, emailing invoices, hosted deployment with backups
