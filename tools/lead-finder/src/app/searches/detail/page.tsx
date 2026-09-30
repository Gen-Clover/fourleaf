import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Stat } from "@genclover/ui";
import { hasRole, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { isService, SERVICE } from "../../../lib/services";
import { getLfSettings } from "../../../lib/settings";
import AutoRefresh from "../../AutoRefresh";
import { Score, StageBadge, WebsiteState } from "../../bits";
import { deepenSearch, resumeSearch, stopSearch } from "../../actions";
import { grid } from "../../../lib/geo";
import { SearchStatus } from "../SearchStatus";

export default async function SearchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const search = await prisma.leadSearch.findUnique({ where: { id } });
  if (!search) notFound();
  const service = isService(search.service) ? SERVICE[search.service] : null;
  const [settings, auditsLeft, hits] = await Promise.all([
    getLfSettings(),
    prisma.job.count({ where: { group: `audit:${id}`, status: { in: ["QUEUED", "RUNNING"] } } }),
    prisma.searchHit.findMany({
      where: { searchId: id, isNew: true },
      include: { lead: true },
      take: 500,
    }),
  ]);
  const score = (l: (typeof hits)[number]["lead"]) => (service ? l[service.field] : l.bestScore);
  const top = hits.map((h) => h.lead).sort((a, b) => score(b) - score(a)).slice(0, 25);
  const running = ["QUEUED", "RUNNING"].includes(search.status);
  const canEdit = hasRole(user.role, "EDITOR");
  const deeperCells = search.saturated.reduce((n, x) => n + grid(JSON.parse(x).rect, settings.cellKm).length, 0);

  return (
    <>
      <AutoRefresh active={running || auditsLeft > 0} />
      <PageHeader
        title={`${search.nicheLabel} · ${search.areaLabel}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/leads/searches" className="hover:underline">← Searches</Link>·<SearchStatus status={search.status} done={search.cellsDone} total={search.cellsTotal} />·
            <span>{service ? `Selling: ${service.label}` : "All services"}</span>·<span>{search.depth === "QUICK" ? "Quick" : "Thorough"}</span>·
            <span>{search.createdBy}, {date(search.createdAt)}</span>
          </span>
        }
        actions={
          canEdit && (
            <>
              {running && <form action={stopSearch.bind(null, id)}><button className="btn-secondary">Stop</button></form>}
              {search.status === "PAUSED" && <form action={resumeSearch.bind(null, id)}><button className="btn-primary">Resume</button></form>}
              <Link href={`/leads/list?search=${id}${service ? `&service=${service.key}` : ""}`} className="btn-primary">Open these leads →</Link>
            </>
          )
        }
      />
      {search.status === "PAUSED" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Paused: the monthly Google spend cap was reached. Raise it under Lead Finder Settings, then Resume.
        </div>
      )}
      {search.saturated.length > 0 && !running && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>
            {search.saturated.length} of {search.cellsTotal} quick queries hit Google&apos;s 60-result limit, so there are more businesses there. Go thorough on just those
            areas (about {deeperCells} map cells, each 1–3 requests).
          </span>
          {canEdit && (
            <form action={deepenSearch.bind(null, id)}>
              <button className="btn-primary btn-sm">Go deeper on these areas</button>
            </form>
          )}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Map cells searched" value={`${search.cellsDone} / ${search.cellsTotal}`} hint={`Phrases: ${search.phrases.join(", ")}`} />
        <Stat label="Businesses found" value={search.found} hint="Including ones you already had" />
        <Stat label="New leads" value={search.newLeads} accent hint={auditsLeft ? `Checking ${auditsLeft} website(s)…` : "Websites checked"} />
        <Stat label="Google requests" value={search.requests} hint={`Estimated ${search.estimateMin}–${search.estimateMax}`} />
      </div>

      <div className="card overflow-x-auto">
        <div className="card-h">
          <div className="card-t">Top new leads{service ? ` for ${service.label.toLowerCase()}` : ""}</div>
          <span className="text-xs text-neutral-500">{running ? "Filling in as the search runs" : `${hits.length} new`}</span>
        </div>
        <table className="tbl">
          <thead><tr><th>Lead</th><th className="hidden sm:table-cell">Website</th><th className="num hidden md:table-cell">Google</th><th>Stage</th><th className="num">Score</th></tr></thead>
          <tbody>
            {top.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/leads/${l.id}`} className="font-medium text-brand-fg hover:underline">{l.name}</Link>
                  <div className="font-mono text-[11px] text-neutral-500">{l.code}</div>
                </td>
                <td className="hidden text-sm sm:table-cell"><WebsiteState website={l.website} siteState={l.siteState} auditStatus={l.auditStatus} /></td>
                <td className="num hidden text-sm md:table-cell">{l.rating ? `${l.rating}★ · ${l.reviewCount ?? 0}` : "—"}</td>
                <td><StageBadge stage={l.stage} /></td>
                <td className="num"><Score score={score(l)} hot={settings.hotScore} warm={settings.warmScore} /></td>
              </tr>
            ))}
            {top.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-neutral-500">{running ? "Searching…" : "No new leads in this search."}</td></tr>}
          </tbody>
        </table>
      </div>
      {search.error && search.status !== "PAUSED" && <p className="mt-3 text-sm text-red-600">{search.error}</p>}
    </>
  );
}
