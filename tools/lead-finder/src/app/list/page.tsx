import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { NO_DEAL } from "../../lib/dealAccess";
import { baseWhere, listWhere, orderBy, parseFilters, scoreField } from "../../lib/query";
import { MARKETS, MARKET_KEYS } from "../../lib/markets";
import { SERVICES } from "../../lib/services";
import { getLfSettings } from "../../lib/settings";
import FilterBar from "./FilterBar";
import LeadTable from "./LeadTable";
import MarketToggle from "../MarketToggle";

const PAGE_SIZE = 50;

export default async function LeadListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = parseFilters(sp, user.id);
  const settings = await getLfSettings();
  const base = baseWhere(f, settings);
  const where = listWhere(f, settings);

  const [total, leads, niches, search, tabCounts, withBranches, users] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, omit: NO_DEAL, orderBy: orderBy(f), skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.leadNiche.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, label: true } }),
    f.search ? prisma.leadSearch.findUnique({ where: { id: f.search }, select: { nicheLabel: true, areaLabel: true } }) : null,
    Promise.all([prisma.lead.count({ where: base }), ...SERVICES.map((s) => prisma.lead.count({ where: { AND: [base, { [s.field]: { gt: 0 } }] } }))]),
    // Same filters with every branch shown: the difference is how many other branches the list hides.
    f.branches ? null : prisma.lead.count({ where: listWhere({ ...f, branches: "show" }, settings) }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const hiddenBranches = withBranches == null ? 0 : withBranches - total;

  const link = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) q.set(k, v);
    for (const [k, v] of Object.entries(patch)) if (v) q.set(k, v); else q.delete(k);
    q.delete("page");
    if (patch.page) q.set("page", patch.page);
    const s = q.toString();
    return `/leads/list${s ? `?${s}` : ""}`;
  };
  const exportQuery = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1] && e[0] !== "page")).toString();
  const nicheLabel = Object.fromEntries(niches.map((n) => [n.key, n.label]));
  const field = scoreField(f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={search ? `From the search ${search.nicheLabel} · ${search.areaLabel}` : "Ranked by how much they need what you sell and how well they can pay."}
        actions={
          <>
            <MarketToggle markets={MARKET_KEYS.map((k) => ({ key: k, label: MARKETS[k].label }))} />
            {can(user.role, "leads.edit") && <a href={`/api/leads/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">Export CSV</a>}
            {can(user.role, "leads.edit") && <Link href="/leads/find" className="btn-primary">+ New search</Link>}
          </>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Services">
        {[{ key: "", label: "All services" }, ...SERVICES.map((s) => ({ key: s.key, label: s.label }))].map((t, i) => {
          const active = (f.service?.key ?? "") === t.key;
          return (
            <Link
              key={t.key || "all"}
              href={link({ service: t.key || null })}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${active ? "border-brand bg-brand-soft font-medium text-brand-fg" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
            >
              {t.label} <span className="tabular-nums text-neutral-500">{tabCounts[i]}</span>
            </Link>
          );
        })}
      </nav>

      <FilterBar
        filters={{ stage: f.stage, temp: f.temp, niche: f.niche, site: f.site, q: f.q, followUp: f.followUp, sort: f.sort, search: f.search, gFrom: f.gFrom, gTo: f.gTo, gOlder: f.gOlder, branches: f.branches, claude: f.claude, owner: f.owner, stuck: f.stuck }}
        niches={niches}
        users={users}
        meId={user.id}
      />

      <LeadTable
        canEdit={can(user.role, "leads.edit")}
        users={users}
        showService={!f.service}
        query={exportQuery}
        total={total}
        hot={settings.hotScore}
        warm={settings.warmScore}
        leads={leads.map((l) => ({
          id: l.id,
          code: l.code,
          name: l.name,
          sub: [l.nicheKey ? nicheLabel[l.nicheKey] : null, l.area].filter(Boolean).join(" · "),
          website: l.website,
          siteState: l.siteState,
          auditStatus: l.auditStatus,
          rating: l.rating,
          reviewCount: l.reviewCount,
          stage: l.stage,
          doNotContact: l.doNotContact,
          nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
          score: l[field],
          bestService: l.bestService,
          branchCount: l.branchCount,
          claudeFit: l.claudeFit,
          googleFetchedAt: l.googleFetchedAt?.toISOString() ?? null,
          market: l.market,
          ownerName: l.ownerName,
        }))}
      />

      {/* Pinned to the bottom of the screen, so paging is always in reach on a long page. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-surface/95 px-4 py-2.5 text-sm text-neutral-500 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <span>
          {total === 0 ? "No leads match." : `Showing ${(f.page - 1) * PAGE_SIZE + 1}–${Math.min(total, f.page * PAGE_SIZE)} of ${total}`}
          {hiddenBranches > 0 && (
            <>
              {" · "}
              {hiddenBranches} other branch{hiddenBranches === 1 ? "" : "es"} of these businesses hidden{" "}
              <Link href={link({ branches: "show" })} className="text-brand-fg underline">Show</Link>
            </>
          )}
        </span>
        {pages > 1 && (
          <div className="flex gap-2">
            {f.page > 1 && <Link href={link({ page: String(f.page - 1) })} className="btn-secondary btn-sm">← Previous</Link>}
            <span className="px-2 py-1">Page {f.page} of {pages}</span>
            {f.page < pages && <Link href={link({ page: String(f.page + 1) })} className="btn-secondary btn-sm">Next →</Link>}
          </div>
        )}
      </div>
    </>
  );
}
