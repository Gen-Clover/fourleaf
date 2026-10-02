# Gen Clover Portal: end-to-end test guide

*How to test the whole system in the browser, one role at a time, from a new company account to the accountant's export. Last updated: 1 Oct 2026.*

The whole flow takes about 45 minutes. Each step names the role to log in as, the menu to open, what to do, and what you should see. The steps build on each other, so do them in order.

## Before you start

1. Start the database: `npm run db:local` (leave it running).
2. Start the portal and the worker: `npm run dev`. Open http://localhost:3000.
3. Use a separate browser profile or a private window for each role, so you can stay logged in as several people at once.

### Logins (local test accounts only)

These accounts are created by `npm run db:seed` in local databases only. Change the owner password before going live, and create real users on **Users & Roles**.

| Role | Email | Password | What they can see |
|---|---|---|---|
| Owner | admin@genclover.local | ChangeMe@2026 | Everything |
| CFO | cfo@genclover.local | Cfo@Gc2026 | All of Finance, approvals, people costs, compliance |
| Sales | sales@genclover.local | Sales@Gc2026 | Lead Finder, rate card, calculator. No costs or company totals |
| Onboarding | onboarding@genclover.local | Onboard@Gc2026 | Won deals, clients, agreements, new projects. No amounts |
| Delivery manager | delivery@genclover.local | Delivery@Gc2026 | Projects, milestones, team, timesheets, resources, issues. No money |
| HR | hr@genclover.local | Hr@Gc2026 | People, documents, work orders, pay, pay runs, people issues |
| Team member | team@genclover.local | Team@Gc2026 | Their own timesheet only |
| Accountant (CA) | ca@genclover.local | Ca@Gc2026 | Finance read-only, compliance, the accountant pack |

## The flow

```
 SALES                     ONBOARDING                 OWNER / HR                 DELIVERY
 ─────                     ──────────                 ──────────                 ────────
 1 Company account         3 Onboard the deal         5 SOW with value           7 Assign team
   (hand / LinkedIn /        → Client GC-…, code        (ABR-P01-S01)              + milestones
   CSV import)               checklist, GST details   6 Contractor GCT-…         │
 2 Opportunity GO-…        4 MSA (ABR-A01)              MCA, work order          │
   → mark Won ───────────►   Project ABR-P01 ───────►   ABR-P01-W01 ───────────► │
                                                        employee salary          │
                                                                                 ▼
 FINANCE (OWNER / CFO)                                  TEAM + DELIVERY
 ─────────────────────                                  ───────────────
 8  Billing basis: contractor billed 8 h/day ◄───────── 9  Log 4 h/day, submit
 10 Milestone amounts → GST invoice GCI/26-27/…            Delivery approves the weeks
    → payment with TDS                                      (only approved hours are paid
 11 Pay run PR-YYYY-MM: CFO prepares → owner approves       and billed)
    → paid → becomes expenses
 12 Big expense → held → second person approves → paid
                     │
                     ▼
 ACCOUNTANT (CA)                  GOVERNANCE (OWNER)
 ───────────────                  ──────────────────
 13 Accountant pack: ZIP of       14 Mark a filing done (ARN), raise an issue
    12 CSVs for Zoho / Tally         ISS-…, escalate, decide, record DEC-…
                     │
                     ▼
 15 Home dashboards: owner sees every area; each role sees only its own
```

## Steps

### 1. Sales: add a company account

Log in as **Sales**. Open **Lead Finder → Add a lead → Company (B2B)**.

- Company name `Acme Health Pvt Ltd`, industry Healthcare, website `acmehealth.in`.
- Services: Web application, Data migration.
- Main contact: Priya Shah, Operations Director, her email and LinkedIn profile link.
- Click **Add company**.

**Check:** the lead page opens with a **Company account** panel. In the message composer you can pick **LinkedIn**: it copies the message and opens her profile; you confirm once it's sent. LinkedIn is never scraped.

**Also try the import:** **Lead Finder → Import a list**, upload a CSV (for example a LinkedIn Sales Navigator or Apollo export), check the column mapping, then import. Companies already in the portal get the new contacts added instead of a duplicate. **Undo** next to an import removes the whole batch.

### 2. Sales: opportunity and won

On the Acme lead page, click **+ Opportunity**.

- What is the work: `Patient portal and data migration`.
- How it's sold: Fixed scope. Stage: Negotiation. Deal value ₹5,00,000.
- **Create opportunity**, then **Mark won**.

**Check:** it gets an ID like `GO-2026-0001` and says "it's in the onboarding queue". It is listed on **Opportunities → Won**. Sales sees their own deal values, but not the company pipeline total on the dashboard.

### 3. Onboarding: turn the deal into a client

Log in as **Onboarding**. Open **Clients → Onboarding**.

- Click **Onboard** next to the Acme deal.
- Legal name `Acme Health Private Limited`, state **Punjab**, city Mohali, currency **INR**, GSTIN `03ABCDE1234F1Z5` (PAN fills in from the GSTIN), billing address.
- The "Invoices:" line under the form shows the tax that will apply: CGST + SGST here, because Punjab is Gen Clover's state.
- Try a GSTIN starting `07` (Delhi) with state Punjab: it is refused. Change the country to USA: GSTIN and PAN disappear, and the line says export of services with no GST.
- **Create client**.

**Check:** the client page shows its Client ID (`GC-2026-…`), a client code (e.g. `ACM`) and the status **Onboarding**. Tick NDA, MSA and Billing details on the checklist; it shows "3 of 12".

### 4. Onboarding: MSA and project

On the client page, click **+ Agreement**: type MSA, status Signed, signed today, expires in a year. **Create agreement**.

**Check:** the code is `ACM-A01`. The renewal date is tracked, and a reminder email goes out before it expires.

Then click **+ Project** on the client page and choose the won deal. The name fills in from the deal.

- Engagement model: Fixed price. Delivery manager: Test Delivery Manager. Start: today.
- **Create project**.

**Check:** the project ID is `ACM-P01`. Onboarding never sees an amount anywhere.

### 5. Owner: SOW with a value

Log in as **Owner**. On the project, open the **Agreements** tab and click **+ SOW**.

- Title, status Signed, scope (in and out), estimated hours 200, contract value ₹5,00,000.

**Check:** the code is `ACM-P01-S01`. The contract value is shown only to owners and finance roles. Change requests (`ACM-P01-CR01`) and acceptance certificates (`ACM-P01-AC01`) are added the same way.

### 6. HR: a contractor, a document, a work order and a salary

Log in as **HR**. Open **People → People → + Add person** and choose Contractor.

- Name Ravi Kumar, title Full-stack developer, PAN, pay model **Hourly**, ₹500 per hour.

**Check:** the code is `GCT-0001` (employees get `GCE-0001`).

- **Documents** tab: add the Master contractor agreement, status Signed, with a link to the file.
- **Work orders** tab: **+ Work order** for `ACM-P01`, role Backend developer, 80 hours a month, pay for this work Hourly. Save.

**Check:** the work order code is `GCT-0001-W01`. Issuing it adds Ravi to the project team automatically.

Then open **Test Team Member**: pay model Salary, monthly salary ₹50,000. Save.

The pay models are:
- **Salary:** fixed monthly, pro-rated for joining or leaving mid-month.
- **Hourly:** approved hours × rate.
- **Retainer:** a fixed monthly fee.
- **Fixed fee:** paid per work order when it's due.

### 7. Delivery manager: team and milestones

Log in as **Delivery**. Open the project.

- **Team** tab: Ravi is already there from the work order. Click **+ Assign person**, add Test Team Member at 80 hours a month. **Save**.
- **Milestones** tab: add `Advance 50%` and `Portal go-live`. **Save**.

**Check:** the delivery manager sees hours, never rates, prices or the client billing basis.

### 8. Owner: bill Ravi's time at 8 hours a day

Log in as **Owner**. Open the project's **Team** tab. In the **Client billed for (finance only)** column, set Ravi to **Fixed hours per day** (8). **Save**.

How it works:
- Ravi is paid for the hours he logs.
- The client is billed 8 hours for every day he logs time.
- Only owners and finance roles see this column and the billed hours. Ravi, the delivery manager and the client never see them.

> The billing basis must match the client contract, for example a per-day engagement written into the SOW. Invoices show the billed hours. Make sure what the client signed is a per-day rate, not hours worked.

The other bases are **Hours worked** (the default) and **Multiplier** (hours × a factor).

### 9. Team member and delivery manager: timesheets

Log in as **Team member**. Open **Timesheets**. Log 4 hours a day, Monday to Friday, on `ACM-P01`. **Save week**, then **Submit for approval**.

**Check:** the team member sees only their own timesheet and nothing else in the portal.

Log in as **Delivery**. Open **Timesheets**, pick Ravi, log 4 hours a day, save and submit. (Contractors normally log their own hours if they have a login.) Then open **Delivery → Approve** and click **Approve** on both weeks.

**Check:** submitted weeks are locked. Only approved hours are paid and billed. **Send back…** asks for a reason.

As **Owner**, open the project's **Hours** tab:
- Ravi shows **worked 20**, **billed to client 40** for the week.
- The two figures are split by month if the week crosses one.

### 10. Owner or CFO: invoice with GST, payment with TDS

Open **Finance → Projects (commercials)** → the project → **Milestones** tab.

- Set ₹2,50,000 on each milestone. **Save amounts**.
- Tick **Advance 50%** and click **Invoice 1 selected**.

**Check:** the draft invoice shows CGST 9% + SGST 9%, because the client is in Punjab like Gen Clover, for a total of **₹2,95,000**. GST is set automatically:
- a client in another state: IGST 18%;
- a client outside India: export under LUT, no GST.

Click **Issue invoice**. It gets the next number, `GCI/26-27/0001`.

Record the payment: settled ₹2,95,000, ₹ credited to bank ₹2,70,000, **TDS deducted ₹25,000**. Click **Record**.

**Check:**
- The invoice is **Paid**, and the TDS is not counted as a loss.
- **Print** shows a tax invoice with the client's GSTIN, the place of supply and the SAC code.
- The GST part of the receipt is set aside in the GST fund.

For time-and-materials projects, **Monthly Billing** fills each month from the approved **billed** hours.

### 11. Pay run: CFO prepares, owner approves

Log in as **CFO**. Open **Finance → Pay runs → Prepare pay run** for this month.

**Check:**
- Ravi: "approved hrs × ₹500", with 10% TDS withheld (GST is added if he is GST registered).
- Test Team Member: salary.
- Every line can be edited before it is sent.

Click **Send for approval**.

Log in as **Owner**. Open **Approvals** and **Approve** the pay run. Then open the pay run and click **Mark paid**.

**Check:**
- Each line becomes an expense with the reference `PR-YYYY-MM`.
- The person who prepares a pay run can't approve it. An owner can approve their own, with a note.

### 12. Expense above the approval limit

As **Owner**, open **Finance → Expenses**. Add Laptop Store, category Technology, ₹60,000.

**Check:** it is saved as unpaid and sent to **Approvals**, because the limit is ₹25,000 (set on **Settings & formula**).

As **CFO**, approve it. As **Owner**, mark it paid.

### 13. Accountant (CA): the export pack

Log in as **Accountant**. Open **Finance → Accountant pack**. Pick the period and click **Download ZIP for the CA**.

The ZIP contains:
- customers and vendors;
- invoices and customer payments;
- bills and vendor payments;
- payroll;
- GST outward supplies (B2B / B2C / export);
- TDS receivable and TDS to deposit;
- receivables;
- an account mapping, plus a README.

This is everything Zoho Books (or Tally) needs. The CA imports it, or you share the ZIP. Each file can also be downloaded on its own.

**Check:** the GST file lists the Acme invoice as B2B with its GSTIN. The accountant can read Finance but can't create or change anything; opening **New invoice** is refused.

> Before the first real export, ask the CA to check the account names in `12_account_mapping.csv` against their Zoho chart of accounts.

### 14. Owner: compliance, issues and decisions

Open **Governance → Compliance calendar**.

- Click **Mark filed** on any item and enter an ARN, e.g. `ARN-TEST-001`. **Save**.
- **Check:** the due date moves to the next period, and the filing is listed with its ARN.

The calendar is pre-filled with about 19 Indian filings:
- GST, TDS, advance tax and ITR;
- ROC and MCA filings, AGM and board meetings;
- PF / ESI, professional tax and insurance.

> Confirm with your CA which of these apply to Gen Clover, and their exact dates. Edit or switch off the ones that don't apply.

Reminders are emailed before each due date.

Then open **Governance → Issues → New issue**. Link it to `ACM-P01`, describe it ("Ravi needed on two projects next week") and add the impact. **Raise issue**.

**Check:**
- The code is `ISS-2026-0001`.
- **Escalate to level 2** asks for a reason.
- **Record decision** closes the loop.
- Level 3+ (CEO / board) decisions are owners only.
- People issues are visible only to owners and HR.

Board and management decisions can also be recorded directly on **Decisions** (`DEC-2026-001`).

### 15. Home dashboards

- **Owner:** the home page shows every area. Sales: weighted pipeline. Clients: renewals. Delivery: late milestones, timesheets to approve, resource clashes. Finance: cash, receivables, runway, approvals waiting. People. Governance: overdue filings and CEO-level issues.
- **Team member:** only "My timesheet this week".
- **Other roles:** only the areas they can see.

## Quick checks of who sees what

| Try this | Expected |
|---|---|
| Team member opens /finance or /projects | Sent back to home with "no access" |
| Sales opens /expenses or /cfo | No access |
| Delivery opens a project's Team tab | No billing column, no rates, no amounts |
| Onboarding opens a client or agreement | No contract values |
| HR opens /invoices | No access; HR sees pay, not revenue |
| Accountant clicks any edit or create button | Refused (read-only) |

## If something goes wrong

- **"Background work" warning on the Lead Finder dashboard:** the worker isn't running. `npm run dev` starts it.
- **No emails (renewals, compliance reminders, call reminders):** set the SMTP details in `.env`.
- **A week can't be edited:** it was submitted or approved. Ask the approver to **Send back…** or **Reopen** it.
- **The pay run is missing someone's hours:** their week isn't approved yet. Approve it, then **Rebuild** the draft pay run.
