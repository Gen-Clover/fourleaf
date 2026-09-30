# Lead Finder

`@genclover/lead-finder`: finds local businesses that need what Gen Clover sells, and tracks them until they become clients. Opens from the Lead Finder tile on the portal home, at `/leads`.

Full feature list and the team's daily routine: `docs/genclover-portal/genclover-portal-roadmap.md`.

## How it works

1. **Search** (`/leads/find`): pick what you're selling (or all services), a niche preset and one or more places. *Estimate* looks up each place's boundary and shows the Google requests and cost; *Run search* queues one job per map cell and phrase.
2. **Collect** (worker, `LF_SEARCH_CELL`): Google Text Search returns at most 60 places per query, so a thorough search covers the area with a grid (`lfCellKm`) and splits any cell that hits 60 into four. Places are matched on Google's place ID: a business is one lead (`GL-YYYY-MM-XXXXXX`, from `packages/ids`) however often it's found. Permanently closed places are skipped.
3. **Audit** (`LF_AUDIT`): fetches the home page (public addresses only, redirects checked hop by hop) and records HTTPS, phone-friendliness, WhatsApp / form / tap-to-call, booking, title and description, sitemap, copyright year, platform and ad pixels. PageSpeed runs when the search is for a redesign or SEO, or on demand.
4. **Score** (`lib/scoring.ts`): per service, need (up to 60, from the audit) + ability to pay (up to 40: reviews, rating, niche value, ad spend). Every point has a reason; the reasons become the outreach message.
5. **Work the lead** (`/leads/list`, `/leads/[id]`): service tabs rank the same leads per service; bulk qualify / not a fit / re-check; message composer opens WhatsApp or email with the text filled in (sent by a person, never in bulk) and schedules follow-ups on day 1, 3 and 7; stages, lost reasons, do-not-contact, timeline, CSV export.
6. **Convert**: creates the client (`GC-YYYY-NNNN` + client code), marks the lead won, and opens a new project for it in the Financial System.

## Spend and Google's rules

- Every paid Google request is counted (`ApiUsage`) and checked against the monthly cap in Lead Finder Settings. A search that would pass the cap pauses and can be resumed after raising it.
- Google Maps Platform terms allow keeping only place IDs indefinitely. Every 6 hours the worker refreshes Google data for leads still being worked once it's 30 days old, and clears it from closed leads (won, lost, not a fit, do not contact). Our own data (audits, notes, history) stays.

## Code

- `src/lib/`: services and stages, scoring, website audit, Google client with spend cap, map grid, lead data, messages, list filters
- `src/jobs.ts`: background job handlers and maintenance (registered in `apps/workers`)
- `src/app/`: pages and server actions; routes in `apps/portal/src/app/(lead-finder)/`
- Tables: `packages/db/prisma/schema/lead-finder.prisma`; job queue: `Job` in `core.prisma`
