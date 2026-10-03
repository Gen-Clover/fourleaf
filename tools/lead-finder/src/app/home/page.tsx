import Link from "next/link";
import { PageHeader, Stat } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { NO_DEAL } from "../../lib/dealAccess";
import { OPEN_OPP_STAGES, OPP_STAGES } from "../../lib/b2b";
import { stuckWhere } from "../../lib/query";
import { CLOSED_STAGES, isService, OPEN_STAGES, SERVICE, STAGE_LABEL, STAGES, TASK_TYPES } from "../../lib/services";
import { getLfSettings, googleKeyConfigured } from "../../lib/settings";
import { endOfTodayIst, startOfMonthIst } from "../../lib/time";
import { Score, StageBadge } from "../bits";
import { SearchStatus } from "../searches/SearchStatus";
import WorkerStatus from "./WorkerStatus";
import { canGenerateLeads, leadRelationScope, leadScope } from "../../lib/scope";

/** A dashboard tile that opens the Leads page with its filter applied. */
const Tile = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block rounded-xl transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand" title="Open these leads">
    {children}
  </Link>
);

const FUNNEL = ["NEW", "QUALIFIED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON"];

export default async function LeadFinderHome() {
  const user = await requireUser();
  const s = await getLfSettings();
  const endOfToday = endOfTodayIst();
  const monthStart = startOfMonthIst();
  // Everyone's dashboard counts only the leads they may see: their own, their team's, or all for owners.
  const sc = await leadScope(user);
  const gen = await canGenerateLeads(user);
  const open = { ...sc, stage: { in: [...OPEN_STAGES] }, doNotContact: false, branchOfId: null };

  // Tile counts use the same rules as the Leads page filters they link to (open = being worked, not
  // do-not-contact, main branch only), so the tile and the list always show the same number.
  const isOwner = can(user.role, "deals.all");
  const weekAhead = new Date(endOfToday.getTime() + 7 * 86_400_000);
  const [byStage, hotCount, due, hotNew, searches, wonThisMonth, niches, byNiche, openCount, dueCount, wonTotal, wonWaiting, stuckCount, snoozedCount, upcoming, deals] = await Promise.all([
    prisma.lead.groupBy({ by: ["stage"], where: sc, _count: { _all: true } }),
    prisma.lead.count({ where: { ...open, bestScore: { gte: s.hotScore } } }),
    prisma.lead.findMany({ where: { ...open, nextFollowUpAt: { not: null, lte: endOfToday } }, omit: NO_DEAL, orderBy: { nextFollowUpAt: "asc" }, take: 10 }),
    prisma.lead.findMany({ where: { ...sc, stage: { in: ["NEW", "QUALIFIED"] }, doNotContact: false, branchOfId: null, bestScore: { gte: s.hotScore } }, omit: NO_DEAL, orderBy: [{ bestScore: "desc" }, { reviewCount: "desc" }], take: 10 }),
    prisma.leadSearch.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.lead.count({ where: { ...sc, stage: "WON", wonAt: { not: null, gte: monthStart } } }),
    prisma.leadNiche.findMany({ select: { key: true, label: true } }),
    prisma.lead.groupBy({ by: ["nicheKey", "stage"], where: sc, _count: { _all: true } }),
    prisma.lead.count({ where: open }),
    prisma.lead.count({ where: { ...open, nextFollowUpAt: { not: null, lte: endOfToday } } }),
    prisma.lead.count({ where: { ...sc, stage: "WON", branchOfId: null } }),
    prisma.lead.count({ where: { ...sc, stage: "WON", clientId: null } }),
    prisma.lead.count({ where: { AND: [sc, stuckWhere(s), { branchOfId: null }] } }),
    prisma.lead.count({ where: { ...sc, stage: "SNOOZED" } }),
    // The team's calls and meetings: anything missed, and the next 7 days.
    prisma.leadTask.findMany({
      where: { status: "OPEN", dueAt: { lte: weekAhead }, ...(await leadRelationScope(user)) },
      orderBy: { dueAt: "asc" },
      take: 8,
      include: { lead: { select: { id: true, name: true } } },
    }),
    // Open deals with a value. Company totals are for owners and the CFO only: not even queried for anyone else.
    isOwner
      ? prisma.opportunity.findMany({
          where: { stage: { in: OPEN_OPP_STAGES }, value: { not: null } },
          select: { stage: true, value: true, currency: true, probability: true, expectedCloseAt: true },
        })
      : Promise.resolve([]),
  ]);
  // Pipeline value by currency: the total, weighted by how likely each stage is to close, and what's expected this month.
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const pipeline = Object.entries(
    deals.reduce<Record<string, { count: number; total: number; weighted: number; thisMonth: number }>>((acc, d) => {
      const c = d.currency ?? "INR";
      const weighted = ((d.value ?? 0) * (d.probability ?? OPP_STAGES[d.stage]?.probability ?? 0)) / 100;
      acc[c] ??= { count: 0, total: 0, weighted: 0, thisMonth: 0 };
      acc[c].count += 1;
      acc[c].total += d.value ?? 0;
      acc[c].weighted += weighted;
      if (d.expectedCloseAt && d.expectedCloseAt < monthEnd) acc[c].thisMonth += weighted;
      return acc;
    }, {}),
  );
  const money = (c: string, n: number) => `${c === "USD" ? "$" : "₹"}${Math.round(n).toLocaleString(c === "USD" ? "en-US" : "en-IN")}`;
  const time = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const stageCount = Object.fromEntries(byStage.map((g) => [g.stage, g._count._all]));
  const total = byStage.reduce((sum, g) => sum + g._count._all, 0);
  // Funnel: how many leads reached each stage or went further (lost / not-a-fit leads count where they stopped: at "New").
  const reached = (i: number) => FUNNEL.slice(i).reduce((sum, st) => sum + (stageCount[st] ?? 0), 0) + (i === 0 ? (stageCount.LOST ?? 0) + (stageCount.NOT_A_FIT ?? 0) + (stageCount.SNOOZED ?? 0) : 0);
  const funnelMax = Math.max(1, reached(0));
  const nicheLabel = Object.fromEntries(niches.map((n) => [n.key, n.label]));
  const nicheRows = Object.entries(
    byNiche.reduce<Record<string, { total: number; contacted: number; won: number }>>((acc, g) => {
      const k = g.nicheKey ?? "";
      acc[k] ??= { total: 0, contacted: 0, won: 0 };
      acc[k].total += g._count._all;
      if (!["NEW", "QUALIFIED", "NOT_A_FIT"].includes(g.stage)) acc[k].contacted += g._count._all;
      if (g.stage === "WON") acc[k].won += g._count._all;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].total - a[1].total);
  const canEdit = can(user.role, "leads.edit");

  return (
    <>
      <PageHeader
        title="Lead Finder"
        subtitle="Find businesses that need what you sell, reach out, follow up, and hand the won ones to Client Onboarding."
        actions={
          canEdit && (
            <>
              <Link href="/leads/new" className="btn-secondary">+ Add a lead</Link>
              <Link href="/leads/find" className="btn-secondary">+ New search</Link>
              <Link href="/leads/today" className="btn-primary">Open today&apos;s queue →</Link>
            </>
          )
        }
      />
      {!googleKeyConfigured() && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Google Maps isn&apos;t connected yet: add <span className="font-mono">GOOGLE_MAPS_API_KEY</span> to <span className="font-mono">.env</span> to run searches. Leads you add by hand work
          already.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile href="/leads/list?stage=OPEN"><Stat label="Open leads" value={openCount} hint={`${total} in total, incl. closed and other branches`} /></Tile>
        <Tile href="/leads/list?stage=OPEN&temp=HOT"><Stat label="🔥 Hot open leads" value={hotCount} accent hint={`Score ${s.hotScore}+ for some service`} /></Tile>
        <Tile href="/leads/list?stage=OPEN&followUp=DUE&sort=followup"><Stat label="Follow-ups due" value={dueCount} hint="Today or overdue" /></Tile>
        <Tile href="/leads/won"><Stat label="Won" value={wonTotal} hint={`${wonThisMonth} this month · ${wonWaiting} waiting for onboarding`} /></Tile>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile href="/leads/list?stage=REPLIED"><Stat label="Replied" value={stageCount.REPLIED ?? 0} hint="Answer within the hour" /></Tile>
        <Tile href="/leads/list?stuck=1&stage=ALL"><Stat label="Stuck deals" value={stuckCount} hint="Replied, meeting or proposal gone quiet" /></Tile>
        <Tile href="/leads/tasks?who=all"><Stat label="Calls & meetings" value={upcoming.length >= 8 ? "8+" : upcoming.length} hint="Missed or in the next 7 days" /></Tile>
        <Tile href="/leads/snoozed"><Stat label="Snoozed" value={snoozedCount} hint="“Not now”: back on their date" /></Tile>
      </div>

      {isOwner && (
        <section className="card mb-6 min-w-0">
          <div className="card-h">
            <div className="card-t">Pipeline value</div>
            <Link href="/leads/opportunities" className="text-xs underline">Open deals</Link>
          </div>
          {pipeline.length === 0 ? (
            <p className="px-5 py-4 text-sm text-neutral-500">No open deals with a value yet. Add a deal (+ Opportunity) on a lead once a price is being discussed.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Currency</th><th className="num">Deals</th><th className="num">Total</th><th className="num">Weighted</th><th className="num hidden sm:table-cell">Expected this month</th></tr>
              </thead>
              <tbody>
                {pipeline.map(([c, p]) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td className="num">{p.count}</td>
                    <td className="num">{money(c, p.total)}</td>
                    <td className="num font-semibold">{money(c, p.weighted)}</td>
                    <td className="num hidden sm:table-cell">{money(c, p.thisMonth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-5 py-2 text-xs text-neutral-500">
            Open deals (opportunities). Weighted = value × each deal&apos;s chance of winning (default by stage: {OPEN_OPP_STAGES.map((st) => `${OPP_STAGES[st].label.split(" (")[0]} ${OPP_STAGES[st].probability}%`).join(", ")}).
          </p>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="card mb-6 min-w-0">
          <div className="card-h">
            <div className="card-t">Calls & meetings coming up</div>
            <Link href="/leads/tasks?who=all" className="text-xs text-brand-fg hover:underline">All →</Link>
          </div>
          <ul className="divide-y divide-neutral-100">
            {upcoming.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className={t.dueAt.getTime() < Date.now() ? "font-medium text-red-700" : "font-medium"}>{time(t.dueAt)}</span>
                  {" · "}
                  {TASK_TYPES[t.type] ?? t.type} with <Link href={`/leads/${t.lead.id}`} className="text-brand-fg hover:underline">{t.lead.name}</Link>
                </span>
                <span className="text-xs text-neutral-500">{t.assigneeName ?? "Unassigned"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0">
          <div className="card-h">
            <div className="card-t">Follow up today</div>
            <Link href="/leads/list?followUp=DUE&sort=followup" className="text-xs text-brand-fg hover:underline">All due →</Link>
          </div>
          <ul className="divide-y divide-neutral-100">
            {due.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/leads/${l.id}`} className="min-w-0 truncate font-medium text-brand-fg hover:underline">{l.name}</Link>
                <span className="flex shrink-0 items-center gap-2">
                  <StageBadge stage={l.stage} />
                  <span className="text-xs text-neutral-500">{date(l.nextFollowUpAt)}</span>
                </span>
              </li>
            ))}
            {due.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-500">Nothing due. Nice.</li>}
          </ul>
        </section>

        <section className="card min-w-0">
          <div className="card-h">
            <div className="card-t">Hot leads not contacted yet</div>
            <Link href="/leads/list?temp=HOT" className="text-xs text-brand-fg hover:underline">All hot →</Link>
          </div>
          <ul className="divide-y divide-neutral-100">
            {hotNew.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <Link href={`/leads/${l.id}`} className="font-medium text-brand-fg hover:underline">{l.name}</Link>
                  <span className="text-neutral-500">{isService(l.bestService) ? ` · ${SERVICE[l.bestService].short}` : ""}</span>
                </span>
                <Score score={l.bestScore} hot={s.hotScore} warm={s.warmScore} />
              </li>
            ))}
            {hotNew.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-500">No hot leads waiting. Run a search to find more.</li>}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0">
          <div className="card-h"><div className="card-t">Pipeline</div><span className="text-xs text-neutral-500">Leads that reached each stage</span></div>
          <div className="space-y-2 p-5">
            {FUNNEL.map((st, i) => (
              <Link key={st} href={`/leads/list?stage=${st}`} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm hover:opacity-80">
                <span className="text-neutral-600">{STAGE_LABEL[st]}</span>
                <span className="h-2.5 rounded-full bg-neutral-100">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(reached(i) / funnelMax) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{reached(i)}</span>
              </Link>
            ))}
            <p className="pt-2 text-xs text-neutral-500">
              {STAGES.filter((st) => (CLOSED_STAGES.includes(st) && st !== "WON") || st === "SNOOZED").map((st) => `${STAGE_LABEL[st]}: ${stageCount[st] ?? 0}`).join(" · ")}
            </p>
          </div>
        </section>

        <section className="min-w-0 space-y-6">
          <WorkerStatus canEdit={canEdit} />
          {/* Searches are for the owner and managers allowed to generate leads. */}
          {gen && (
          <div className="card">
            <div className="card-h">
              <div className="card-t">Recent searches</div>
              <Link href="/leads/searches" className="text-xs text-brand-fg hover:underline">All →</Link>
            </div>
            <ul className="divide-y divide-neutral-100">
              {searches.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <Link href={`/leads/searches/${x.id}`} className="min-w-0 truncate text-brand-fg hover:underline">{x.nicheLabel} · {x.areaLabel}</Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-neutral-500">{x.newLeads} new</span>
                    <SearchStatus status={x.status} done={x.cellsDone} total={x.cellsTotal} />
                  </span>
                </li>
              ))}
              {searches.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-500">No searches yet.</li>}
            </ul>
          </div>
          )}

          {nicheRows.length > 0 && (
            <div className="card">
              <div className="card-h"><div className="card-t">By niche</div></div>
              <table className="tbl">
                <thead><tr><th>Niche</th><th className="num">Leads</th><th className="num">Contacted</th><th className="num">Won</th></tr></thead>
                <tbody>
                  {nicheRows.map(([k, r]) => (
                    <tr key={k || "none"}>
                      <td>{k ? <Link href={`/leads/list?niche=${k}&stage=ALL`} className="hover:underline">{nicheLabel[k] ?? k}</Link> : "No niche"}</td>
                      <td className="num">{r.total}</td>
                      <td className="num">{r.contacted}</td>
                      <td className="num font-semibold">{r.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
