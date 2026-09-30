# Gen Clover Portal: goal, tools and roadmap

*Working document, kept high level. Update it whenever a feature ships, a flow changes or a decision is made. Last updated: 30 Sep 2026 (Lead Finder phase 1).*

## Goal

Automate as much of Gen Clover's work as possible in one internal portal: finding clients, reaching out, closing, onboarding, delivering, billing and caring for their sites. Each tool is a separate module in the portal, and all of them share one login, one database and the same IDs.

**Current focus:** make the Lead Finder automate as much of finding and contacting clients as possible. After that, build the other tools in the order below.

## Tools

```
                               ┌──────────────────────────────┐
                               │   PORTAL  (one login, roles) │
                               │   home = one tile per tool   │
                               └──────────────┬───────────────┘
        ┌────────────────┬──────────────┬─────┴─────────┬────────────────┬──────────────────┐
        ▼                ▼              ▼               ▼                ▼                  ▼
  🔍 LEAD FINDER    🎨 DEMO          ✉ OUTREACH     🧾 CLIENT         💰 FINANCIAL      🛠 CARE &
     ✅ built         GENERATOR        (inside LF      ONBOARDING         SYSTEM            DELIVERY
                      ⏳ next          for now) 🔨     🔨 partly          ✅ built           ⏳ later
```

| Tool | Status | What it automates |
|---|---|---|
| Lead Finder | ✅ Built, being enhanced | Finding, checking, scoring and following up prospects |
| Demo Generator | ⏳ After the Lead Finder | A personal preview homepage for each hot lead |
| Outreach | 🔨 Inside the Lead Finder for now | Messages, sequences, reply tracking |
| Client Onboarding | 🔨 IDs done; onboarding form still to build | Collecting logo, content, domain and access details in one go |
| Financial System | ✅ Built | Pricing, projects, invoices, payments, funds, reports |
| Care & Delivery | ⏳ Later | Site templates, uptime and form checks, monthly care invoices |

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
  Reply ─► call ─► proposal ─► WON ─► Client [GC-2026-0007 · code DRS]
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
  Lost (reason recorded) ──► re-contact later      Upsell (booking, WhatsApp bot, SEO) and
                                                   referrals ──► new leads
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

Full rules: `docs/lead-generation/gen-clover-website-leads-strategy.md`, section 10.

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
- **Convert to client:** creates the client and opens a new project in the Financial System.

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
| 19 | Won → full setup (project from the package, care plan, 50% invoice draft) | ⏳ needs a Financial System change first: one-off fixed-price projects and INR invoices with GST |

### Phase 3: with the next tools

- A demo link in every message (Demo Generator).
- Lead owners, assignment and daily targets, if a salesperson joins.
- An exclude list of existing clients and competitors.

## Operations: how the team works the Lead Finder

**Every morning (15–30 minutes of setup, then outreach)**
1. Open **Lead Finder → Dashboard**. If "Background work" shows a red warning, start the worker (`npm run dev` or `npm run worker`).
2. Open **Today**. Work top to bottom:
   - **Replies**: answer them (call or message), then set the stage on the lead page: Call / meeting, Proposal sent, Lost or Not a fit.
   - **Follow-ups due**: read the message, adjust if needed, send. If they already answered on WhatsApp or by phone, click **They replied** instead.
   - **First messages**: read the findings and the message, then **Open in WhatsApp**, press send in WhatsApp, and come back and click **Yes, I sent it** (or **Send email**, which is logged automatically when the portal sends it). Use **Not a fit** or **Skip for today** when it doesn't fit.
3. India leads: WhatsApp first. USA leads: email first, within their business hours (shown on the card).

**Rules**
- WhatsApp is always sent by a person, from their own WhatsApp, one message at a time. Never bulk.
- Email replies, unsubscribes and bounces are handled by the system. WhatsApp and phone replies are not: always click **They replied**.
- Anyone who asks not to be contacted: click **Do not contact** on the lead. They never appear again.
- A lead with branches: contact the main one only (the list hides the others).
- Logged something by mistake? Click **Undo** next to it on the lead's timeline; follow-up dates are recalculated.

**Weekly**
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

## Order of the other tools

1. **Lead Finder enhancements** (above), current focus.
2. **Demo Generator:** a preview homepage from each lead's name, services, photos and reviews.
3. **Client Onboarding:** one form for logo, content, photos, domain and access details, linked to the Client ID.
4. **Care & Delivery:** site-starter templates, client site repos, uptime and form checks, monthly care invoices and reports.

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

## Change log

| Date | Change |
|---|---|
| 30 Sep 2026 | Portal moved to MongoDB; readable IDs built (`packages/ids`) |
| 30 Sep 2026 | Portal home with tool tiles; Financial System moved to `/finance` with a top navigation bar |
| 30 Sep 2026 | Lead Finder built: searches, website checks, scores, messages, follow-ups, convert to client, background worker |
| 30 Sep 2026 | Fixes: dashboard tiles open the matching Leads list (same counts); Leads page has Clear all, a pinned paging footer and a "N other branches hidden" note; niche report shows leads and contacted; WhatsApp/email-app sends are logged only after "Yes, I sent it"; Undo for anything logged by mistake |
| 30 Sep 2026 | Lead Finder Phase 1 and most of Phase 2 built: markets, contacts, AI automation, Today queue, follow-ups, auto-qualify, nightly speed tests, branches, weekly searches, go deeper, email with reply detection, Claude review, reports, bulk refresh |
| 30 Sep 2026 | First live search: 152 dental clinics in the tricity for 18 Google requests (within the free allowance). The website check was improved afterwards (WhatsApp plugins, contact pages, phone numbers, town from address). |
