# Gen Clover Portal: goal, tools and roadmap

*Working document, kept high level. Update it whenever a feature ships, a flow changes or a decision is made. Last updated: 1 Oct 2026 (end-to-end system: clients, delivery, people, finance with GST and pay runs, governance). How to test all of it: `end-to-end-test-guide.md`.*

## Goal

Automate as much of Gen Clover's work as possible in one internal portal: finding clients, reaching out, closing, onboarding, delivering, billing and caring for their sites. Each tool is a separate module in the portal, and all of them share one login, one database and the same IDs.

**Current focus:** make the Lead Finder automate as much of finding and contacting clients as possible. After that, build the other tools in the order below.

## Tools

```
                                   ┌──────────────────────────────┐
                                   │   PORTAL  (one login, roles) │
                                   │ home = KPIs + a tile per tool│
                                   └──────────────┬───────────────┘
   ┌───────────────┬───────────────┬──────────────┼──────────────┬───────────────┬───────────────┐
   ▼               ▼               ▼              ▼              ▼               ▼               ▼
 🔍 LEAD        🤝 CLIENTS &    🛠 DELIVERY &   👥 PEOPLE      💰 FINANCE     🏛 GOVERNANCE   🎨 DEMO GEN /
   FINDER         AGREEMENTS      RESOURCES                                                   🌐 CARE
   ✅ local+B2B    ✅ built         ✅ built        ✅ built        ✅ built        ✅ built         ⏳ later
```

| Tool | Status | What it automates |
|---|---|---|
| Lead Finder | ✅ Built | Local businesses from Google Maps, and **company (B2B) accounts** entered by hand, from LinkedIn or by CSV import; contacts, opportunities (`GO-…`), outreach, pipeline |
| Clients & Agreements | ✅ Built | Onboarding a won deal into a client (GST details, checklist), contacts, agreements: NDA, MSA, SOW, change requests, acceptance, with versions and renewal reminders |
| Delivery & Resources | ✅ Built (moved out of Finance) | Projects, milestones with client acceptance, team and capacity, resource requests, weekly timesheets with approval |
| People | ✅ Built | Employees and contractors, pay models (salary, hourly, retainer, fixed fee), documents, work orders, onboarding / offboarding checklists |
| Finance | ✅ Built, extended | Pricing, commercials, GST invoices, payments with TDS, pay runs, maker-checker approvals, funds, reports, **accountant pack for Zoho** |
| Governance | ✅ Built | Compliance calendar with reminders, issues with escalation levels, decision register |
| Demo Generator | ⏳ Later | A personal preview homepage for each hot lead |
| Care (site care) | ⏳ Later | Site templates, uptime and form checks, monthly care invoices |

Status key: ✅ built · 🔨 in progress or partly built · ⏳ planned

## Flow of one customer

IDs are shown in brackets.

```
  Google Maps search ─► Lead [GL-2026-09-000068] ─► website check + score for each service
        │
        ▼
  Demo homepage for that business ─► first message (WhatsApp / email) ─► follow-ups day 1·3·7
        │
        ▼
  Reply ─► call ─► proposal ─► WON (Lead Finder) ─► Client Onboarding ─► Client [GC-2026-0007 · code DRS]
        │                                   │
        │                                   ▼
        │                  Onboarding form: logo, photos, content, domain, access details
        │                                   │
        │                                   ▼
        │        Project [DRS-P01] Growth ₹40K ─► site built from site-starter template
        │                                   │         repo: gc-2026-0007-drs-…
        │                                   ▼
        │        Invoices [GCI/26-27/0001] 50% upfront + 50% before go-live ─► payment ─► funds
        │                                   │
        │                                   ▼
        │        Care plan [DRS-P02] monthly invoice ◄── uptime, backups, monthly form test,
        │                                   │           monthly report
        ▼                                   ▼
  Lost / Not now (snoozed) ──► back on a date      Upsell (booking, WhatsApp bot, SEO) and
                                                   referrals ──► new leads
```

For company (B2B) work the flow is:

```
  Company account (hand / LinkedIn / CSV) ─► Opportunity [GO-2026-0001] ─► Won ─► Onboarding ─► Client [GC-… · ABR]
        ─► MSA [ABR-A01] ─► Project [ABR-P01] + SOW [ABR-P01-S01] ─► team: employees [GCE-…], contractors [GCT-…]
        with work orders [GCT-0001-W01] ─► weekly timesheets, approved ─► milestone / monthly GST invoices
        ─► payments (TDS) ─► pay run [PR-2026-10], approved ─► accountant pack for the CA
```

Shared by every tool: MongoDB, `packages/ids`, the background worker, Google Places and PageSpeed, and (optionally) the Claude API.

## IDs

| Record | Format | Set by |
|---|---|---|
| Lead | `GL-YYYY-MM-XXXXXX` | System, the month the lead was first found (IST) |
| Client ID | `GC-YYYY-NNNN` | System, the year the client registered |
| Client code | e.g. `ABR`, 2–10 letters and digits | The person onboarding the client; locked afterwards. Also the Jira project key. |
| Project | `<code>-Pnn`, e.g. `ABR-P01` | System, numbered per client. A care plan is a project of type "Care plan". |
| Invoice | `GCI/26-27/0001` | System, one consecutive series per Indian financial year (GST) |
| Opportunity (B2B deal) | `GO-YYYY-NNNN` | System |
| Agreement (NDA, MSA) | `<code>-Ann`, e.g. `ABR-A01` | System, numbered per client |
| SOW / change request / acceptance | `ABR-P01-S01` / `ABR-P01-CR01` / `ABR-P01-AC01` | System, numbered per project |
| Employee / contractor | `GCE-0001` / `GCT-0001` | System |
| Work order | `GCT-0001-W01` | System, numbered per contractor |
| Issue / decision | `ISS-YYYY-NNNN` / `DEC-YYYY-NNN` | System |
| Pay run | `PR-YYYY-MM` | System, one per month |

Full rules: `docs/lead-generation/gen-clover-website-leads-strategy.md`, section 10.

## Access: who sees what

One role per person, set on **Users & Roles**. The rules live in one file (`packages/auth/src/access.ts`) that the pages, menus, APIs and portal home all read. Pages only load the figures a role may see, so hidden figures never reach the browser.

Money has three layers:
1. **Price**: what the client pays (rate card, packages, a deal's value). Seen by whoever quotes it: Sales, owners, CFO.
2. **Cost**: salaries, cost rates, pay, the internal allocation split. Owners, CFO and HR.
3. **Company totals**: revenue, pipeline value, forecast, margins, cash. Owners, CFO and the accountant.

The **client billing basis** (for example 8 hours billed per day while the person works 4) is finance-only: the person, the delivery manager and the client never see it. It must match the client contract (a per-day engagement in the SOW).

| Role | Sees and does |
|---|---|
| Owner | Everything, including users, roles, the audit log and all settings; final approvals; CEO / board level issues |
| CFO | All of Finance (invoices, payments, costs, margins, pay runs, approvals, reports, settings); Lead Finder read-only with every deal value; people costs; compliance |
| Sales | Lead Finder (local and B2B accounts, opportunities, import); rate card and calculator prices; deal values on their own deals. No costs, no company totals |
| Onboarding | Won deals waiting for onboarding; clients, contacts, agreements; creating projects. No amounts |
| Delivery manager | Projects, milestones, team, resources, everyone's hours and approvals, issues. No money and no billing basis |
| HR | People, documents, work orders, pay and pay runs, people issues. No revenue |
| Team member | Logs their own hours (their People record has their login email) |
| Accountant (CA) | Finance read-only, compliance calendar, the accountant pack. Can't create or change anything |

## Lead Finder

### What it does today

- **Search:** Google Maps by niche and area, for **India or the USA**. A map grid gets past Google's 60-results-per-search limit; quick searches that hit the limit offer to **go deeper** on just those areas; searches can **repeat weekly**. Monthly spend cap.
- **Website check:** missing site, social page only, site down, HTTPS, built for phones, WhatsApp, forms, phone, booking, chat assistant, FAQ, SEO basics, ad tracking. The contact page is checked too. **Contact details are collected:** emails, WhatsApp number, social links, the doctor's or owner's name.
- **Scores:** 0–100 per service, with the reasons shown. Seven services: new website, redesign, WhatsApp & lead capture, Google Business Profile, SEO & speed, booking & payments, **AI automation**. Branches of one business are grouped (shared website or phone).
- **Automation:** leads with a high score and a way to reach them are **qualified automatically**; big chains are marked not a fit; **speed tests run nightly** on the best leads; leads with no reply after the last follow-up are closed as Lost (No reply).
- **Today queue:** replies first, then follow-ups due, then first messages to the best qualified leads, one at a time.
- **Messages:** per market (India WhatsApp style, USA email style) and per step (first message, follow-ups on day 1, 3 and 7), written from each lead's own findings.
- **Email from the portal** (SMTP): threaded follow-ups, business address and opt-out line in every email, daily limit. The inbox is read every 10 minutes: **replies, unsubscribes and bounces update leads automatically**. Automatic email follow-ups can be turned on in Settings.
- **Claude review without the API:** copy a brief (instructions + lead details) into Claude, paste the answer back; each lead gets a fit rating, the best service, AI ideas and a message.
- **Google data:** "last updated" date on every lead, a date-range filter, and bulk refresh (selected, or everything matching the filters) with the cost shown first. Automatic refresh or clearing under Google's 30-day rule continues.
- **Reports:** reply and win rates by niche, service, message step, channel and day; email results; Google spend per lead and per won client.
- **Pipeline stages:** every stage change is recorded (who, when, why), so each lead shows how long it has been in its stage.
  - **Replied:** sort the reply (Interested, Asked for price, Not now, Not interested, Wrong person); suggested answers follow; 1-hour answer timer.
  - **Call / meeting:** schedule calls, meetings and visits with an assignee (email when booked and 30 minutes before, one-click add to Google / Outlook / Apple calendar); a notes template (needs, budget, who decides, when) and an outcome that moves the lead on.
  - **Won:** package, care plan, add-ons and why we won. **No client is created**: won leads wait on **Pipeline → Won** for Client Onboarding.
  - **Lost:** reason required; competitor and a "try again" date optional (the lead comes back as a fresh lead on that date).
  - **Not a fit:** reason required; never re-added by searches.
  - **Not now (snoozed):** out of every queue until a date, then back in Today; listed on **Pipeline → Snoozed**.
  - **Across stages:** lead owner (and bulk assign), "stuck" alerts, deal value and expected close date (**owners only**) with a weighted pipeline forecast on the dashboard.

### Phase 1: now

| # | Enhancement | Status |
|---|---|---|
| 1 | Bulk "Refresh Google data" with a last-updated date filter and the cost shown first | ✅ |
| 2 | US market: USD prices, email-first messages with the CAN-SPAM footer, 7 more US niches, US local time, client country on Convert | ✅ |
| 3 | Contact details collected from each website | ✅ |
| 4 | AI automation as a seventh service | ✅ |
| 5 | "Today" outreach queue | ✅ |
| 6 | Written follow-up messages for day 1, 3 and 7 | ✅ |
| 7 | Automatic qualifying rules | ✅ |
| 8 | Better scoring (rating and niche count less; reviews and ad spend more) | ✅ |
| 9 | Nightly speed tests | ✅ |
| 10 | Branch detection | ✅ |
| 11 | Worker status on the dashboard (waiting, paused, failed, Retry, Resume) | ✅ |

### Phase 2: more automation

| # | Enhancement | Status |
|---|---|---|
| 12 | Scheduled (weekly) searches | ✅ |
| 13 | Quick searches offer to go deeper where they hit the 60 cap | ✅ |
| 14 | Claude review: manual copy/paste with a Claude subscription now; the API later when there's budget | ✅ manual · ⏳ API |
| 15 | Email from the portal: follow-ups, opt-out, reply and bounce detection | ✅ (needs SMTP details in `.env`) |
| 16 | Editable message templates with two versions compared by reply rate | ⏳ to discuss |
| 17 | Reports | ✅ |
| 18 | Daily digest | ⏳ |
| 19 | Won → full setup | ↪ Replaced: Won only marks the lead; Client Onboarding creates the client (see Phase 2b) |

### Phase 2b: pipeline stages

| # | Enhancement | Status |
|---|---|---|
| 20 | Reply sorting, suggested answers, 1-hour answer timer | ✅ |
| 21 | Calls, meetings and visits: assignee, email reminders, calendar links, notes template, outcome; Tasks page and "My calls today" on Today | ✅ in the portal · ⏳ Google / Microsoft calendar sync |
| 22 | Won details (package, care plan, add-ons, reason) and a "Won, waiting for onboarding" list | ✅ |
| 23 | Lost with optional competitor and try-again date; Not a fit with a required reason | ✅ |
| 24 | Not now (snoozed) stage with its own list | ✅ |
| 25 | Stage history, stage age, stuck alerts, lead owner, deal value and forecast (owners only) | ✅ |
| 26 | Reports: days from first message to won, reply answer time, stages reached, win / loss reasons | ✅ |
| 27 | Advance payment status on Won | ⏳ to discuss (belongs to Client Onboarding / Finance) |
| 28 | Proposal builder | ⏳ to discuss |

### Phase 3: with the next tools

- A demo link in every message (Demo Generator).
- Daily targets per person, if a salesperson joins.
- An exclude list of existing clients and competitors.

## Operations: how the team works the Lead Finder

**Every morning (15–30 minutes of setup, then outreach)**
1. Open **Lead Finder → Dashboard**. If "Background work" shows a red warning, start the worker (`npm run dev` or `npm run worker`).
2. Open **Today**. Work top to bottom:
   - **Replies** (within the hour): sort what they said, then send the suggested answer. Book a call or meeting from the lead page. "Not now" snoozes the lead until the date they gave.
   - **Follow-ups due**: read the message, adjust if needed, send. If they already answered on WhatsApp or by phone, click **They replied** instead.
   - **My calls & meetings today** are listed at the top. After each one click **Done: how did it go?**, fill in the notes and pick the outcome.
   - **First messages**: read the findings and the message, then **Open in WhatsApp**, press send in WhatsApp, and come back and click **Yes, I sent it** (or **Send email**, which is logged automatically when the portal sends it). Use **Not a fit** or **Skip for today** when it doesn't fit.
3. India leads: WhatsApp first. USA leads: email first, within their business hours (shown on the card).

**Rules**
- WhatsApp is always sent by a person, from their own WhatsApp, one message at a time. Never bulk.
- Email replies, unsubscribes and bounces are handled by the system. WhatsApp and phone replies are not: always click **They replied**.
- Anyone who asks not to be contacted: click **Do not contact** on the lead. They never appear again.
- A lead with branches: contact the main one only (the list hides the others).
- Logged something by mistake? Click **Undo** next to it on the lead's timeline; follow-up dates are recalculated.

**Closing a lead**
- **Proposal sent** after the proposal goes out (follow-up in 2 days).
- **Won**: pick the package, care plan, add-ons and why. Then tell the onboarding team; the lead waits on **Pipeline → Won** until the client is created in Client Onboarding.
- **Lost**: pick the reason; add who got the work only if you know; set a try-again date if it makes sense.
- **Not a fit**: pick the reason.

**Weekly**
- Check **Pipeline → Stuck deals** and **Snoozed**; owners also review the pipeline value on the dashboard.
- Check **Reports**: which niche, service, message step and day get replies. Shift effort there.
- Run or schedule searches for the next niche or area. Check the estimate first.
- Optional: **Claude review** of the next 20 best leads (copy out, paste back).

**Monthly**
- Check Google spend on **Lead Finder Settings**. Refresh Google data for open leads older than 25 days (Leads → filter → Refresh).

**Automatic (no action needed)**
- New high-scoring leads with a phone or email are qualified; big chains are marked not a fit.
- Speed tests run at 2 AM IST on the best leads with websites.
- Weekly searches run on their schedule.
- Email follow-ups are sent automatically only if turned on in Settings; the sequence stops on reply, unsubscribe or bounce.
- Leads with no reply 7 days after the last follow-up are closed as Lost (No reply).
- Snoozed leads come back into Today on their date; lost leads with a try-again date come back as fresh leads.
- Reminders are emailed 30 minutes before each call or meeting (when email is set up).

## Order of the other tools

Built on 1 Oct 2026: Clients & Agreements (including onboarding), Delivery & Resources, People, Governance, and the Finance extensions (GST, TDS, pay runs, approvals, accountant pack). Still to come:

1. **Demo Generator:** a preview homepage from each lead's name, services, photos and reviews.
2. **Care:** site-starter templates, client site repos, uptime and form checks, monthly care invoices and reports.
3. **Later, to discuss:** client portal (clients see their milestones and invoices), e-signature for agreements, direct Zoho Books sync instead of the CSV pack, leave and holiday tracking, PF / ESI payroll calculations.

## Decisions

| Date | Decision |
|---|---|
| 30 Sep 2026 | One repo and one portal; each tool is a separate module sharing one login and one database |
| 30 Sep 2026 | MongoDB: Atlas for hosting, `npm run db:local` for local work |
| 30 Sep 2026 | IDs: lead `GL-…`, Client ID `GC-YYYY-NNNN` plus a client code, project `<code>-Pnn`, invoice `GCI/26-27/0001` |
| 30 Sep 2026 | Portal home shows one tile per tool; each tool has a top navigation bar grouped by task, with no sidebar |
| 30 Sep 2026 | Lead Finder searches by niche and area, and ranks leads per service; you pick the service after the search |
| 30 Sep 2026 | Google Places (New) for business data, with a monthly spend cap; only place IDs are kept indefinitely (Google's terms) |
| 30 Sep 2026 | WhatsApp messages are sent by a person (one click), never in bulk |
| 30 Sep 2026 | US leads are part of Phase 1 |
| 30 Sep 2026 | Claude review is manual (copy/paste with a Claude subscription) until there is budget for the API |
| 30 Sep 2026 | Email follow-ups: manual review by default; automatic sending is a setting. Email replies, unsubscribes and bounces are detected automatically; WhatsApp replies are marked by a person |

| 30 Sep 2026 | Won only marks the lead in the Lead Finder; the client is created in Client Onboarding, which links the lead |
| 30 Sep 2026 | Money in the Lead Finder (deal values, won value, forecast) is visible to owners (Admin) only |
| 30 Sep 2026 | Calls and meetings live in the portal for now (email + calendar links); two-way calendar sync later |
| 1 Oct 2026 | Six roles: Owner, CFO, Sales, Onboarding, Delivery manager, Team member. Sales sees prices (they quote them) but never costs, margins or company totals |
| 1 Oct 2026 | Two more roles: HR (people and pay, no revenue) and Accountant (finance read-only, compliance, export pack) |
| 1 Oct 2026 | Keep Gen Clover's own IDs, extended for opportunities, agreements, SOWs, people, work orders, issues, decisions and pay runs |
| 1 Oct 2026 | Zoho Books stays with the CA: everything Zoho needs is kept in the portal and exported as one accountant pack (CSVs) |
| 1 Oct 2026 | B2B accounts come from manual entry, LinkedIn (manual or CSV export, never scraped) and CSV imports, with de-duplication and undo |
| 1 Oct 2026 | People are paid on salary, hourly, retainer or fixed fee. The client is billed per a finance-only billing basis per assignment (hours worked, fixed hours per day, or a multiplier), which must match the client contract |
| 1 Oct 2026 | Projects, milestones and timesheets moved out of Finance into Delivery & Resources; Finance keeps the commercials |
| 2 Oct 2026 | Pages are built to fit the screen: navigation and actions first, figures dense, only what needs action highlighted, long settings in tabs. No scrollbars inside menus or panes |
| 1 Oct 2026 | Final revenue allocation: Delivery 40, Growth / Talent / R&D 7, Corporate Ops 7, Technology 4, Sales / Marketing 5, Working Capital / Risk 9, Survival Reserve 5, Ventures 3, BD & Founder Ops 5, Retained Profit 15. Each bucket has subcategories (the expense categories) for what the money is actually spent on |
| 1 Oct 2026 | Only approved timesheet weeks are paid and billed; pay runs, expenses above the limit (₹25,000) and below-floor prices need a second person's approval |

## Change log

| Date | Change |
|---|---|
| 30 Sep 2026 | Portal moved to MongoDB; readable IDs built (`packages/ids`) |
| 30 Sep 2026 | Portal home with tool tiles; Financial System moved to `/finance` with a top navigation bar |
| 30 Sep 2026 | Lead Finder built: searches, website checks, scores, messages, follow-ups, convert to client, background worker |
| 30 Sep 2026 | Fixes: dashboard tiles open the matching Leads list (same counts); Leads page has Clear all, a pinned paging footer and a "N other branches hidden" note; niche report shows leads and contacted; WhatsApp/email-app sends are logged only after "Yes, I sent it"; Undo for anything logged by mistake |
| 30 Sep 2026 | Lead Finder Phase 1 and most of Phase 2 built: markets, contacts, AI automation, Today queue, follow-ups, auto-qualify, nightly speed tests, branches, weekly searches, go deeper, email with reply detection, Claude review, reports, bulk refresh |
| 30 Sep 2026 | First live search: 152 dental clinics in the tricity for 18 Google requests (within the free allowance). The website check was improved afterwards (WhatsApp plugins, contact pages, phone numbers, town from address). |
| 30 Sep 2026 | Pipeline stages built: reply sorting and timer, calls and meetings, won details, lost / not a fit reasons, snoozed stage, stage history, stuck alerts, owners, deal value and forecast (owners only), new Tasks / Snoozed / Won pages and reports. Convert to client removed from the Lead Finder. |
| 1 Oct 2026 | Roles and permissions across the portal (see Access). Old accounts renamed: Admin → Owner, Editor → Sales, Viewer → Team member. Test accounts for each role in local databases. |
| 2 Oct 2026 | Responsive portal: every page fits phones, tablets and laptops (checked at 360, 390, 768, 1024, 1280 and 1440 px) with no sideways scrolling and no scrollbars inside panes. Tables that do not fit become stacked cards (column name beside each value); the top bar and its menu adapt to small screens; card headers, filters and forms wrap; the timesheet grid comes first on phones. |
| 2 Oct 2026 | Portal UI: one top bar on every page with an app switcher (jump between tools) and page search (Ctrl+K, only the pages the role can open). Home fits one screen: tools launcher, a compact overview per area and a "Needs attention" list (all figures kept). Denser KPI tiles on every dashboard; Settings & formula in tabs; compliance calendar one row per filing. |
| 1 Oct 2026 | Final allocation live and applied to existing projects. Settings & formula: "Where the money goes" (purpose, subcategories, exclusions, examples) and a subcategory editor; expenses are picked by subcategory, grouped by bucket. Financial Policies: "Apply to existing projects and receipts". One deal value per deal (the lead-level Deal card removed). Client tax fields by country (GSTIN / PAN for India only; export under LUT abroad); GST no longer skipped for Indian clients billed in USD; invoices need the client's billing address. Forms keep what was typed after an error. |
| 1 Oct 2026 | End-to-end system built. New tools: Clients & Agreements, Delivery & Resources, People, Governance. Lead Finder: B2B accounts, contacts, opportunities, CSV import, LinkedIn channel. Finance: GST (CGST+SGST / IGST / export under LUT), TDS on receipts, milestone invoicing, pay runs, approvals, accountant pack, overhead in profit. Home page KPIs per role. Indian compliance calendar seeded (to confirm with the CA). Tested end to end in the browser across all 8 roles. |
