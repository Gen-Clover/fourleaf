import Link from "next/link";
import { Empty, PageHeader } from "@genclover/ui";
import { requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { BANDS, bandLabel, distLeads, holdingReport, parseDistFilters, ROTATABLE_STAGES, rotationPeople, rotationSettings, stageLabel } from "../../lib/distribution";
import { distAccessFor, moveTargets } from "../../lib/scope";
import { SOURCES } from "../../lib/services";
import { DistributeTable, RotationSettingsForm } from "./DistributeControls";

const SHOWN = 300;

/**
 * Distribute: the pool of leads nobody owns yet (from searches and imports), handed out fairly by rotation, and the
 * owner's view of who holds what and what is sitting idle, with bulk moves. Managers see their team (and the pool if
 * the owner allows them to hand it out).
 */
export default async function DistributePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const a = await distAccessFor(user);
  if (!a.owner && !a.canPool && !a.canMove) {
    return (
      <>
        <PageHeader title="Distribute leads" />
        <div className="card"><Empty>Handing out and moving leads needs the owner&apos;s permission (Lead Finder → Sales team).</Empty></div>
      </>
    );
  }
  const f = parseDistFilters({ view: a.canPool ? "pool" : "assigned", ...sp });
  if (f.view === "pool" && !a.canPool) f.view = "assigned";
  const [s, leads, people, targets, owners] = await Promise.all([
    rotationSettings(),
    distLeads(f, { canPool: a.canPool, team: a.team }),
    rotationPeople(),
    moveTargets(user),
    a.owner ? prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : prisma.user.findMany({ where: { id: { in: a.team ?? [] } }, select: { id: true, name: true } }),
  ]);
  const report = await holdingReport(s.idleDays, a.team);
  // The filters as a query string (checkbox groups repeat a key), for links and the "all matching" actions.
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))).toString();
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) if (v) q.set(k, v); else q.delete(k);
    return `/leads/distribute?${q}`;
  };
  const tabs: [DistView, string][] = [
    ...(a.canPool ? [["pool", "Pool (nobody yet)"] as [DistView, string]] : []),
    ["assigned", a.owner ? "Assigned" : "My team"],
    ...(a.owner ? [["all", "All"] as [DistView, string]] : []),
  ];

  return (
    <>
      <PageHeader
        title="Distribute leads"
        subtitle="Hand out the pool fairly (by score band, evened out over runs), see whose leads are sitting idle, and move them."
        actions={<Link href="/leads/incentives/team" className="btn-secondary">Sales team →</Link>}
      />

      <section className="card mb-6 overflow-x-auto">
        <div className="card-h">
          <div className="card-t">Who holds what</div>
          <span className="text-xs text-neutral-500">Open leads, and how many nobody has worked lately (messages, calls, meetings, notes, replies)</span>
        </div>
        <table className="tbl">
          <thead><tr><th>Person</th><th className="num">Open</th><th className="num">Idle 7+ days</th><th className="num">Idle {s.idleDays}+ days</th><th className="num">Longest idle</th><th className="num">Won (90 days)</th><th /></tr></thead>
          <tbody>
            {report.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td className="num">{r.open}</td>
                <td className="num">{r.idle7}</td>
                <td className={`num ${r.idleLimit ? "font-medium text-red-600" : ""}`}>{r.idleLimit}</td>
                <td className="num">{r.oldestIdle ? `${r.oldestIdle} d` : "—"}</td>
                <td className="num">{r.won90}</td>
                <td className="text-right"><Link className="text-xs text-brand-fg hover:underline" href={link({ view: "assigned", owner: r.id, idle: "7" })}>Idle leads →</Link></td>
              </tr>
            ))}
            {report.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-500">Nobody in the rotation yet: mark people active on the Sales team page.</td></tr>}
          </tbody>
        </table>
      </section>

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label]) => <Link key={k} href={link({ view: k, owner: "" })} className={f.view === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{label}</Link>)}
      </div>

      <form className="card mb-4 grid gap-3 p-4 text-sm md:grid-cols-6" action="/leads/distribute">
        <input type="hidden" name="view" value={f.view} />
        {f.view !== "pool" && (
          <label className="block">
            <span className="label">Owner</span>
            <select name="owner" defaultValue={f.owner} className="input">
              <option value="">Anyone</option>
              {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">Idle at least (days)</span>
          <input name="idle" type="number" min={0} defaultValue={f.idle || ""} className="input" placeholder="any" />
        </label>
        <label className="block">
          <span className="label">Added by</span>
          <select name="added" defaultValue={f.added} className="input">
            <option value="">Everyone</option>
            <option value="self">Added by hand (self-sourced)</option>
            <option value="noself">From searches and imports</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Market</span>
          <select name="market" defaultValue={f.market} className="input">
            <option value="">All</option>
            <option value="IN">India</option>
            <option value="US">USA</option>
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="label">Search</span>
          <input name="q" defaultValue={f.q} className="input" placeholder="name, ID, area, phone, website" />
        </label>
        <fieldset className="md:col-span-3">
          <legend className="label">Stages (none ticked = all open stages)</legend>
          <div className="flex flex-wrap gap-3">
            {[...ROTATABLE_STAGES, ...(a.owner ? ["WON"] : [])].map((st) => (
              <label key={st} className="flex items-center gap-1.5"><input type="checkbox" name="stage" value={st} defaultChecked={f.stages.includes(st)} /> {stageLabel(st)}</label>
            ))}
          </div>
        </fieldset>
        <fieldset className="md:col-span-3">
          <legend className="label">Score bands (none ticked = all)</legend>
          <div className="flex flex-wrap gap-3">
            {BANDS.map((b) => <label key={b.key} className="flex items-center gap-1.5"><input type="checkbox" name="band" value={b.key} defaultChecked={f.bands.includes(b.key)} /> {b.label}</label>)}
          </div>
        </fieldset>
        <div className="flex items-end gap-2 md:col-span-6">
          <button className="btn-primary btn-sm">Filter</button>
          <Link href={`/leads/distribute?view=${f.view}`} className="btn-secondary btn-sm">Clear</Link>
        </div>
      </form>

      <DistributeTable
        total={leads.length}
        query={query}
        canPool={a.canPool}
        canMove={a.canMove}
        owner={a.owner}
        poolView={f.view === "pool"}
        people={people.map((p) => ({ id: p.id, name: p.name, open: p.open }))}
        targets={targets}
        leads={leads.slice(0, SHOWN).map((l) => ({
          id: l.id,
          code: l.code,
          name: l.name,
          area: l.area,
          stage: stageLabel(l.stage),
          won: l.stage === "WON",
          score: l.bestScore,
          band: bandLabel(l.band),
          owner: l.ownerName,
          idleDays: l.idleDays,
          warned: !!l.rotationWarnedAt,
          addedBy: l.createdByName,
          source: SOURCES[l.source] ?? l.source,
          assigned: l.assignedAt ? date(l.assignedAt) : null,
        }))}
        shown={Math.min(SHOWN, leads.length)}
      />

      {a.owner && <RotationSettingsForm initial={s} stages={ROTATABLE_STAGES.map((st) => ({ key: st, label: stageLabel(st) }))} />}
    </>
  );
}

type DistView = "pool" | "assigned" | "all";
