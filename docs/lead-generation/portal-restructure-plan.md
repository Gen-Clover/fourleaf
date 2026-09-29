# Gen Clover Portal: Restructure Plan (Step 0)

*Prepared: 30 Sep 2026 · Status: **done, 30 Sep 2026** (on branch `restructure/monorepo`) · Related: [gen-clover-website-leads-strategy.md](gen-clover-website-leads-strategy.md), section 10*

This plan turns `genclover-portal` into one repo with `apps/`, `tools/` and `packages/`, as decided in the strategy doc. It lists every move, the order to do them in, how each phase is checked, and what you need to decide before it starts.

## Outcome (read this first)

The restructure is done. Where the result differs from the plan below, this section is what was actually built.

| Plan said | What was done, and why |
|---|---|
| Keep SQLite, move to Postgres afterwards | **Moved to MongoDB (Atlas)**, as decided on 30 Sep. All data was copied with ids kept, and 1,413 of 1,413 field values were checked identical. SQLite files are kept in `D:\2026\gen-clover\backups\genclover-portal-2026-09-30\sqlite-final\`. |
| No look-and-feel changes | **genclover.com theme** applied across the portal: fonts, palette, clover logo, dark by default with a light toggle. Printed invoices and quotes stay light. |
| Decide what `site/` is | Removed (it was empty). |
| `lead-generation` docs to `docs/` | Done. The empty `tools/lead-finder` folder is ready for the Lead Finder once its design is decided. |
| `.env` at the root | Done. The Next.js middleware now runs on the Node.js runtime so it reads the root `.env`. |
| `packages/db/src/settings.ts` for the company name | Not needed. The sidebar shows the Gen Clover wordmark, so the shell makes one database query fewer per page. |

**MongoDB differences that were handled** (details in the root `README.md`):
- Empty fields: Prisma on MongoDB omits unset optional fields, so `where: { x: null }` missed them. For example, a payroll bill wasn't counted as unpaid. `packages/db/src/sql-nulls.ts` now stores them as explicit nulls.
- Date filters on optional fields: MongoDB treats empty as smaller than any date. People with no review date showed as "review due", and milestones with no due date showed as late. Fixed with `not: null`.
- "An expense is billed once": now a partial unique index, because MongoDB's plain unique index would reject a second empty value.
- Project search ignores upper/lower case, as SQLite did.
- Added indexes on every link field (project → client, invoice → client, and so on) so page loads stay fast.

**Speed** (measured on this PC, with the build cache present):

| | Before | After |
|---|---|---|
| Dev server to first page | 16.5 s | 7.6 s |
| First open of Dashboard / Projects / CFO in dev | 4.7 / 2.0 / 1.5 s | 1.7 / 0.5 / 1.0 s |
| Any page in production build | ~0.1 s | ~0.1 s |

Changes behind this: Turbopack for dev, middleware on the Node.js runtime, one user lookup per request instead of two, one fewer query in the page shell, `optimizePackageImports` for charts, and an instant loading screen on navigation. Once Atlas is connected, each query adds network time, so choose the Mumbai region.

**Verified:**
- Typecheck and production build pass.
- All 26 main pages, 4 detail pages (project, invoice, client, person) and 3 CSV exports load with no errors, both on the migrated data and on data with invoices and payments. Key pages (login, dashboard, projects, CFO, reports, expenses, invoice, printed invoice, admin) were checked by screenshot in both themes.
- A 61-check business-flow test passes against MongoDB. It covers clients, projects, rates, agreement, people, assignments, milestones, timesheets, monthly billing, invoices (draft, edit, issue with FY numbering, part-pay, pay, void), fund allocation, "billed once", payroll (idempotent), fund transfers, commitments, rate card, allocation buckets, policies, users, role checks, delete protections and cascades.

---

## 1. Ground rules

1. **Nothing is deleted.** Files are moved with `git mv`, so git records them as renames. The only exceptions are generated folders (`node_modules`, `.next`, `tsconfig.tsbuildinfo`), which are rebuilt by `npm install` and `next build`.
2. **Git history is kept.** The existing repo in `financial-control-system/.git` becomes the repo for the whole `genclover-portal` folder. Its 2 commits and their history carry over.
3. **The app keeps working after every phase.** Each phase ends with `typecheck`, `build`, a login and a click-through of the main pages, then a commit. If a phase fails, we roll back to the previous commit.
4. **No behaviour changes.** Same pages, same URLs, same data, same login. This is only a reorganisation. New features (Client ID, Lead Finder) come afterwards.
5. **The database files are handled by hand.** `dev.db` holds real client and salary data. It is never committed, and it's backed up before anything moves.

---

## 2. What's there today

```
genclover-portal\
├── financial-control-system\        ← git repo (2 commits, clean), Next.js 15.5 + Prisma 6.19 + SQLite
│   ├── .git\
│   ├── .env, .env.example
│   ├── docs\                        ← Portal overview, Rate card
│   ├── prisma\                      ← schema.prisma (22 models), seed.ts, dev.db + 2 backup .db files
│   ├── src\app\(portal)\…           ← 20 route folders (projects, clients, invoices, admin, …)
│   ├── src\app\(print)\…            ← invoice print, project quote
│   ├── src\app\login, logout, api\export
│   ├── src\components\              ← Sidebar, ui, StatusBadgeClient
│   ├── src\lib\                     ← 13 files (auth, session, db, audit, calc, finance, ledger, …)
│   └── src\middleware.ts
├── lead-generation\
│   └── doc\                         ← strategy doc, this plan (not in git)
└── site\                            ← empty folder
```

Environment: Node 24.20, npm 11.19.

---

## 3. Target layout

```
genclover-portal\                          ← git repo root (history from financial-control-system)
├── package.json                           ← npm workspaces: apps/*, tools/*, packages/*
├── .gitignore  .env  .env.example  .nvmrc  README.md
├── docs\
│   ├── finance\                           ← Portal overview, Rate card
│   └── lead-generation\                   ← strategy doc, this plan
├── apps\
│   ├── portal\                            ← @genclover/portal: the one Next.js app
│   │   ├── src\app\layout.tsx, globals.css
│   │   ├── src\app\login\, logout\        ← core
│   │   ├── src\app\(portal)\layout.tsx    ← shell: login check + sidebar
│   │   ├── src\app\(portal)\admin\users\, admin\audit\   ← core admin
│   │   ├── src\app\(portal)\…\page.tsx    ← one-line files that re-export tool pages
│   │   ├── src\components\Sidebar.tsx     ← builds its menu from each tool's nav.ts
│   │   ├── src\middleware.ts
│   │   └── next.config.ts, tsconfig.json, postcss, eslint
│   └── workers\                           ← created later with the Lead Finder (not in this step)
├── tools\
│   └── finance\                           ← @genclover/finance
│       ├── src\app\…                      ← the actual pages, actions and forms (same tree as today)
│       ├── src\lib\                       ← calc, finance, invoicing, ledger, treasury, alerts, settings
│       └── src\nav.ts                     ← its sidebar sections
└── packages\
    ├── db\                                ← @genclover/db
    │   ├── prisma\schema\core.prisma      ← generator, datasource, User, Setting, Client, AuditLog
    │   ├── prisma\schema\finance.prisma   ← the other 18 models
    │   ├── prisma\seed.ts, dev.db (+ backups, ignored by git)
    │   └── src\index.ts (prisma client), audit.ts, settings.ts (company name)
    ├── auth\                              ← @genclover/auth: session (edge-safe), auth (server)
    ├── ui\                                ← @genclover/ui: ui, StatusBadgeClient, format, result, styles.css
    └── ids\                               ← created in build step 1 (Client ID), not in this step
```

---

## 4. The moves, phase by phase

### Phase A: backup and branch

| # | Action |
|---|---|
| A1 | Copy the whole `genclover-portal` folder to `D:\2026\gen-clover\backups\genclover-portal-2026-09-30\`. This includes `.env` and all `.db` files, which git doesn't track. |
| A2 | Confirm `git status` is clean. It is today. |
| A3 | `git switch -c restructure/monorepo` |

### Phase B: make `genclover-portal` the repo root and move the app to `apps/portal`

| # | From | To | How |
|---|---|---|---|
| B1 | `financial-control-system/.git` | `genclover-portal/.git` | Move the folder. Git then sees every file as moved, until B2 fixes that. |
| B2 | Every tracked file in `financial-control-system/` | `apps/portal/…` (same relative path) | `git mv`, one folder at a time |
| B3 | `financial-control-system/docs/*` | `docs/finance/` | `git mv` |
| B4 | `lead-generation/doc/*` | `docs/lead-generation/` | Move, then `git add` (these files are new to git) |
| B5 | `financial-control-system/.env` | `genclover-portal/.env` | Move (ignored by git) |
| B6 | `financial-control-system/prisma/*.db` | `apps/portal/prisma/` | Move (ignored by git) |
| B7 | new | root `package.json` (`"workspaces": ["apps/*", "tools/*", "packages/*"]`, scripts `dev`, `build`, `typecheck`, `db:*` that call into the workspaces) | Create |
| B8 | `apps/portal/.gitignore` | root `.gitignore` (made to work from the root, keeps the `*.db` and `.env*` rules) | `git mv` + edit |
| B9 | new | `.nvmrc` (24), root `README.md` | Create |
| B10 | `financial-control-system/node_modules`, `.next`, `tsconfig.tsbuildinfo` | — | Rebuilt by `npm install` at the root |

`site/` and the then-empty `financial-control-system/` and `lead-generation/` folders are left alone until you decide (section 6).

**Check:** `npm install`, `npm run dev`, log in, open Dashboard, Projects, Invoices, Admin. `npm run typecheck` and `npm run build`. **Commit.**

### Phase C: pull out the shared packages

Shared packages are plain TypeScript with no build step. The portal compiles them through `transpilePackages` in `next.config.ts`. Each has a `package.json` with `exports` for its entry points.

| # | From (`apps/portal/…`) | To | Notes |
|---|---|---|---|
| C1 | `prisma/schema.prisma` | `packages/db/prisma/schema/core.prisma` + `finance.prisma` | Uses Prisma's multi-file schema (supported in 6.19). Split: `User`, `Setting`, `Client`, `AuditLog` go in core, everything else in finance. The models don't change. |
| C2 | `prisma/seed.ts` | `packages/db/prisma/seed.ts` | |
| C3 | `prisma/*.db` | `packages/db/prisma/` | `DATABASE_URL` stays `file:./dev.db`, relative to the schema folder. Checked by comparing row counts before and after. |
| C4 | `src/lib/db.ts` | `packages/db/src/index.ts` | Exports `prisma` and the Prisma types |
| C5 | `src/lib/audit.ts` | `packages/db/src/audit.ts` | Every tool writes to the audit log |
| C6 | new | `packages/db/src/settings.ts`: `getCompanyName()` | The portal layout currently gets the company name through finance's `getParams()`. The shell shouldn't depend on a tool. |
| C7 | `src/lib/session.ts` | `packages/auth/src/session.ts` (export `@genclover/auth/session`) | Kept edge-safe (jose only) because `middleware.ts` uses it |
| C8 | `src/lib/auth.ts` | `packages/auth/src/server.ts` (export `@genclover/auth`) | `requireRole`, `assertRole`, `getCurrentUser`, … |
| C9 | `src/components/ui.tsx`, `StatusBadgeClient.tsx` | `packages/ui/src/` | |
| C10 | `src/lib/format.ts` | `packages/ui/src/format.ts` | `inr`, `usd`, `date`, … |
| C11 | `src/lib/result.ts` | `packages/ui/src/result.ts` | Form and action result helpers (zod) |
| C12 | shared part of `src/app/globals.css` (brand colours, `.card`, `.btn-primary`, `.tbl`, …) | `packages/ui/src/styles.css` | The portal's `globals.css` imports it and adds `@source` lines for `tools/` and `packages/`. **Without these, Tailwind v4 won't generate classes used in tool code.** |
| C13 | `db:push`, `db:seed`, `db:reset`, `postinstall: prisma generate` | `packages/db/package.json` | The root keeps aliases, so the commands work as before |
| C14 | all `@/lib/db`, `@/lib/auth`, `@/components/ui`, … imports | `@genclover/db`, `@genclover/auth`, `@genclover/ui` | Find-and-replace, then typecheck |

**Check:** same as Phase B, plus `npm run db:push` shows no schema changes. **Commit.**

### Phase D: move finance into `tools/finance`

Next.js only finds routes inside `apps/portal/src/app`. The real page code moves to the tool, and the portal keeps a one-line route file per page:

```ts
// apps/portal/src/app/(portal)/projects/page.tsx
export { default } from "@genclover/finance/app/projects/page";
```

This works for every current page, because only `(portal)/layout.tsx` and the root `layout.tsx` export route settings (`dynamic`, `metadata`), and both of those stay in the portal.

| # | From (`apps/portal/src/…`) | To | Notes |
|---|---|---|---|
| D1 | `lib/calc, finance, invoicing, ledger, treasury, alerts, settings` | `tools/finance/src/lib/` | Only finance uses these |
| D2 | `app/(portal)/` route folders: `projects, clients, calculator, rate-card, cfo, funds, commitments, planner, pipeline, timesheets, people, billing, invoices, expenses, reports` | `tools/finance/src/app/…` (same tree) | Pages, `actions.ts`, forms and editors. Relative imports between them (`../invoices/actions`) keep working because the tree is unchanged. |
| D3 | `app/(portal)/page.tsx` + `DashboardCharts.tsx` (dashboard) | `tools/finance/src/app/dashboard/` | `/` still shows this dashboard. It can become a portal home page later. |
| D4 | `app/(print)/invoices/…`, `app/(print)/projects/…` | `tools/finance/src/app/print/…` | Route files stay in `apps/portal/src/app/(print)/` |
| D5 | `app/api/export/route.ts` | `tools/finance/src/api/export.ts` | Portal keeps `app/api/export/route.ts` re-exporting `GET` |
| D6 | `app/(portal)/admin/rate-card, formula, policies` + overview page | `tools/finance/src/app/admin/…` | Finance settings |
| D7 | `app/(portal)/admin/users`, `admin/audit` | **stay in `apps/portal`** | Users and the audit log belong to the whole portal |
| D8 | `app/(portal)/admin/actions.ts` | Split: `createUser`, `updateUser`, `resetPassword` stay in the portal. `saveSettings`, `saveBuckets`, `saveRateCard` move to finance. | This file currently mixes both |
| D9 | `components/Sidebar.tsx` menu lists | `tools/finance/src/nav.ts` | The Sidebar stays in the portal and builds its menu from each tool's `nav.ts`. The Admin section keeps Users and Audit from the core. |
| D10 | About 30 route stubs | `apps/portal/src/app/…` | One per moved page or route (35 exist today; login, logout and core admin pages stay as they are). Generated by script, then reviewed. |

**Check:** every sidebar link opens, and I test one save action on each page type (project, client, invoice, expense, timesheet, user). Invoice print and quote print render. CSV export downloads. Non-admin users are still redirected away from `/admin`. `typecheck` and `build` pass. **Commit.**

### Phase E: finish up

| # | Action |
|---|---|
| E1 | Update `docs/finance/Gen-Clover-Portal-Overview.md` and the root `README.md` with the new layout and commands |
| E2 | Merge `restructure/monorepo` into `main` |
| E3 | Once you've checked it: push to the private GitHub organisation (open decision 2 in the strategy doc) |

---

## 5. What is *not* in this step

- **Postgres.** It's a separate step right after this one. Changing structure and database at the same time would make any problem hard to trace. It needs a data copy script for the real data in `dev.db`, with row counts checked. One thing to watch: the projects search uses `contains`, which ignores case on SQLite but not on Postgres. It needs `mode: "insensitive"`.
- **`packages/ids`, the Client ID and the `Sequence` table.** These are build step 1.
- **`apps/workers` and `tools/lead-finder`.** These are build step 2.
- **URL changes.** Finance keeps its current URLs (`/projects`, `/invoices`, …). New tools get their own prefix (`/leads`, `/demos`, …).
- **Moving Clients out of finance.** The Clients pages stay in `tools/finance` for now. They move to a client-onboarding tool in build step 1, when the `GC-…` code is added.

---

## 6. Decisions needed before starting

| # | Question | My recommendation |
|---|---|---|
| 1 | Keep finance's current URLs, or move them under `/finance/…`? | **Keep them.** Nothing breaks, and bookmarks still work. |
| 2 | Keep git history by moving `.git` up to `genclover-portal` (B1)? | **Yes** |
| 3 | What is the empty `site/` folder for? Keep it, move it, or remove it? | Your call. The public genclover.com site should be its own repo (strategy doc, section 11). |
| 4 | Backup location for Phase A | `D:\2026\gen-clover\backups\` |
| 5 | Postgres as a separate step straight after this one? | **Yes** |
| 6 | Package scope name `@genclover/…` | **Yes** |

---

## 7. Risks and how they're handled

| Risk | Handling |
|---|---|
| Losing data in `dev.db` | Backed up in Phase A. Moved by hand, never committed. Row counts checked after Phase C. |
| Tailwind styles missing on tool pages | `@source` lines in `globals.css` (C12). Visual check of every page in Phase D. |
| Server actions inside workspace packages | `transpilePackages` in `next.config.ts`. One save action tested on each page type in Phase D. |
| Edge middleware pulling in Prisma | `@genclover/auth/session` is its own export with only jose (C7) |
| Prisma picking up the wrong `.env` or database path | A single root `.env`. `DATABASE_URL` is checked with `prisma db push` (expecting no changes) and row counts. |
| A phase goes wrong | Each phase is its own commit on a branch, plus the Phase A backup |
