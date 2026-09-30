import Link from "next/link";
import { PageHeader, Stat } from "@genclover/ui";
import { requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { isMarket, MARKETS, MARKET_KEYS } from "../../lib/markets";
import { OUTREACH_TYPES } from "../../lib/outreach";
import { isService, SERVICE, STEP_LABEL } from "../../lib/services";
import { getLfSettings } from "../../lib/settings";
import MarketToggle from "../MarketToggle";

const PERIODS: [string, string][] = [["30", "30 days"], ["90", "90 days"], ["365", "12 months"], ["0", "All time"]];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

type Row = { label: string; leads?: number; contacted: number; replied: number; won: number };

function Table({ title, rows, firstCol, showLeads }: { title: string; rows: Row[]; firstCol: string; showLeads?: boolean }) {
  return (
    <section className="card min-w-0">
      <div className="card-h"><div className="card-t">{title}</div></div>
      <table className="tbl">
        <thead>
          <tr>
            <th>{firstCol}</th>
            {showLeads && <th className="num">Leads</th>}
            <th className="num">Contacted</th>
            <th className="num hidden sm:table-cell">Replied</th>
            <th className="num">Reply rate</th>
            <th className="num hidden sm:table-cell">Won</th>
            <th className="num">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              {showLeads && <td className="num">{r.leads}</td>}
              <td className="num">{r.contacted}</td>
              <td className="num hidden sm:table-cell">{r.replied}</td>
              <td className="num font-medium">{pctOf(r.replied, r.contacted)}</td>
              <td className="num hidden sm:table-cell">{r.won}</td>
              <td className="num">{pctOf(r.won, r.contacted)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={showLeads ? 7 : 6} className="py-6 text-center text-neutral-500">No outreach in this period yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

/** Where outreach works: reply and win rates by niche, service, message, channel and day; Google spend per result. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ market?: string; days?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const market = isMarket(sp.market) ? sp.market : undefined;
  const days = PERIODS.some(([d]) => d === sp.days) ? Number(sp.days) : 90;
  const since = days ? new Date(Date.now() - days * 86_400_000) : new Date(0);
  const s = await getLfSettings();

  const [leads, niches, activities, emails, usage] = await Promise.all([
    prisma.lead.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { firstContactAt: { gte: since } }], ...(market ? { market } : {}) },
      select: { id: true, nicheKey: true, createdAt: true, firstContactAt: true, repliedAt: true, stage: true, firstService: true, contactCount: true },
    }),
    prisma.leadNiche.findMany({ select: { key: true, label: true } }),
    prisma.leadActivity.findMany({
      where: { at: { gte: since }, OR: [{ type: { in: OUTREACH_TYPES } }, { type: "REPLY" }], ...(market ? { lead: { market } } : {}) },
      select: { leadId: true, type: true, step: true, at: true },
      orderBy: { at: "asc" },
    }),
    prisma.emailMessage.findMany({ where: { sentAt: { gte: since }, ...(market ? { lead: { market } } : {}) }, select: { status: true, auto: true } }),
    prisma.apiUsage.findMany(),
  ]);
  const nicheLabel = Object.fromEntries(niches.map((n) => [n.key, n.label]));
  const contacted = leads.filter((l) => l.firstContactAt && l.firstContactAt >= since);
  const isWon = (l: (typeof leads)[number]) => l.stage === "WON";
  const group = (keyOf: (l: (typeof leads)[number]) => string, pool = contacted, all = false): Row[] => {
    const m = new Map<string, Row>();
    for (const l of pool) {
      const k = keyOf(l);
      const r = m.get(k) ?? { label: k, leads: 0, contacted: 0, replied: 0, won: 0 };
      r.leads = (r.leads ?? 0) + 1;
      if (!all || l.contactCount > 0) r.contacted++;
      if (l.repliedAt) r.replied++;
      if (isWon(l)) r.won++;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.contacted - a.contacted || (b.leads ?? 0) - (a.leads ?? 0));
  };

  // Which message got the reply: the last message before the lead's first reply.
  const byLead = new Map<string, typeof activities>();
  for (const a of activities) byLead.set(a.leadId, [...(byLead.get(a.leadId) ?? []), a]);
  const steps = STEP_LABEL.map((label) => ({ label, contacted: 0, replied: 0, won: 0 }));
  const channels = new Map<string, Row>();
  for (const [, acts] of byLead) {
    const firstReply = acts.find((a) => a.type === "REPLY");
    const sends = acts.filter((a) => a.type !== "REPLY");
    for (const a of sends) if (a.step != null && steps[a.step]) steps[a.step].contacted++;
    const answered = firstReply ? sends.filter((a) => a.at <= firstReply.at).at(-1) : null;
    if (answered?.step != null && steps[answered.step]) steps[answered.step].replied++;
    const first = sends[0];
    if (first) {
      const label = first.type === "WHATSAPP" ? "WhatsApp" : first.type === "EMAIL" ? "Email" : first.type === "CALL" ? "Call" : "Visit";
      const r = channels.get(label) ?? { label, contacted: 0, replied: 0, won: 0 };
      r.contacted++;
      if (firstReply) r.replied++;
      channels.set(label, r);
    }
  }

  // Google spend per month, and per new lead / won client that month.
  const price: Record<string, [number, number]> = {
    SEARCH: [s.searchPricePer1000, s.searchFreePerMonth],
    AREA: [s.areaPricePer1000, s.areaFreePerMonth],
    DETAILS: [s.detailsPricePer1000, s.detailsFreePerMonth],
  };
  const spendByMonth = new Map<string, number>();
  for (const u of usage) {
    const [month, sku] = u.key.split(":");
    const [p, free] = price[sku] ?? [0, 0];
    spendByMonth.set(month, (spendByMonth.get(month) ?? 0) + (Math.max(0, u.count - free) * p) / 1000);
  }
  const monthRows = [...new Set([...spendByMonth.keys(), ...leads.map((l) => l.createdAt.toISOString().slice(0, 7))])]
    .sort()
    .reverse()
    .slice(0, 12)
    .map((month) => {
      const newLeads = leads.filter((l) => l.createdAt.toISOString().slice(0, 7) === month).length;
      const won = leads.filter((l) => isWon(l) && l.createdAt.toISOString().slice(0, 7) === month).length;
      const spend = spendByMonth.get(month) ?? 0;
      return { month, spend, newLeads, won };
    });

  const replied = contacted.filter((l) => l.repliedAt).length;
  const won = contacted.filter(isWon).length;
  const dayLink = (d: string) => `/leads/reports?${new URLSearchParams({ ...(market ? { market } : {}), days: d })}`;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Where outreach works: reply and win rates by niche, service, message, channel and day, and what Google costs per result."
        actions={<MarketToggle markets={MARKET_KEYS.map((k) => ({ key: k, label: MARKETS[k].label }))} />}
      />
      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        {PERIODS.map(([d, label]) => (
          <Link key={d} href={dayLink(d)} className={`rounded-full border px-3 py-1 ${String(days) === d ? "border-brand bg-brand-soft text-brand-fg" : "border-neutral-200 text-neutral-600"}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Leads contacted" value={contacted.length} hint={`${leads.filter((l) => l.createdAt >= since).length} new leads found`} />
        <Stat label="Replied" value={replied} hint={`Reply rate ${pctOf(replied, contacted.length)}`} accent />
        <Stat label="Won" value={won} hint={`Win rate ${pctOf(won, contacted.length)}`} />
        <Stat label="Emails sent" value={emails.length} hint={`${emails.filter((e) => e.auto).length} automatic · ${emails.filter((e) => e.status === "BOUNCED").length} bounced · ${emails.filter((e) => e.status === "REPLIED").length} replied`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Table title="By niche (leads found or contacted in the period)" firstCol="Niche" showLeads rows={group((l) => (l.nicheKey ? (nicheLabel[l.nicheKey] ?? l.nicheKey) : "No niche"), leads, true)} />
        <Table title="By service (first message)" firstCol="Service" rows={group((l) => (isService(l.firstService) ? SERVICE[l.firstService].label : "Not recorded"))} />
        <Table title="By message in the sequence" firstCol="Message" rows={steps} />
        <Table title="By channel (first message)" firstCol="Channel" rows={[...channels.values()]} />
        <Table title="By day of first message" firstCol="Day" rows={group((l) => WEEKDAYS[(l.firstContactAt ?? l.createdAt).getDay()])} />
        <section className="card min-w-0">
          <div className="card-h"><div className="card-t">Google spend</div><span className="text-xs text-neutral-500">Estimated from requests and your price settings</span></div>
          <table className="tbl">
            <thead><tr><th>Month</th><th className="num">Spend</th><th className="num hidden sm:table-cell">New leads</th><th className="num">Per lead</th><th className="num hidden sm:table-cell">Won</th><th className="num">Per won client</th></tr></thead>
            <tbody>
              {monthRows.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td className="num">${r.spend.toFixed(2)}</td>
                  <td className="num hidden sm:table-cell">{r.newLeads}</td>
                  <td className="num">{r.newLeads ? `$${(r.spend / r.newLeads).toFixed(3)}` : "—"}</td>
                  <td className="num hidden sm:table-cell">{r.won}</td>
                  <td className="num">{r.won ? `$${(r.spend / r.won).toFixed(2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
