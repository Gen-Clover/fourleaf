import Link from "next/link";
import { Empty, PageHeader, Stat } from "@genclover/ui";
import { requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, inr, money } from "@genclover/ui/format";
import { ownerReport } from "@genclover/incentives";
import { FLAGS, STAGE_LABEL, statusLabel } from "@genclover/incentives/rules";

const PERIODS: [string, string, number][] = [["30", "30 days", 30], ["90", "90 days", 90], ["365", "12 months", 365]];
const LEVEL_COLOR = { high: "bg-red-50 text-red-700", medium: "bg-amber-50 text-amber-700", low: "bg-neutral-100 text-neutral-600" };

/**
 * The owner's report: every won deal, what it looked like at Won, what onboarding decided and what has happened
 * since, with flags for anything to check (a forgotten decision, a changed seller or value, a business that isn't
 * new, someone deciding their own incentive). Fix anything from the deal's page.
 */
export default async function IncentiveReviewPage({ searchParams }: { searchParams: Promise<{ p?: string; flagged?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const period = PERIODS.find(([k]) => k === sp.p) ?? PERIODS[1];
  const since = new Date(Date.now() - period[2] * 86_400_000);
  const { rows, missing, changes } = await ownerReport(since);
  const flaggedOnly = sp.flagged === "1";
  const shown = flaggedOnly ? rows.filter((r) => r.flags.length) : rows;
  const waiting = rows.filter((r) => ["DRAFT", "PENDING_APPROVAL"].includes(r.status));
  const high = rows.filter((r) => r.flags.some((f) => FLAGS[f]?.level === "high")).length + missing.length;
  const userIds = [...new Set(changes.flatMap((c) => [c.fromValue, c.toValue]).filter((x): x is string => !!x && /^c[a-z0-9]{20,}$/.test(x)))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const show = (v: string | null) => (v == null ? "—" : (names.get(v) ?? (v.length > 90 ? `${v.slice(0, 90)}…` : v)));
  const link = (patch: Record<string, string>) => `/leads/incentives/review?${new URLSearchParams({ p: period[0], ...(flaggedOnly ? { flagged: "1" } : {}), ...patch })}`;

  return (
    <>
      <PageHeader title="Incentive review" subtitle="What changed between the Lead Finder, Won, onboarding and payment, and anything to check. Correct any deal from its page." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {PERIODS.map(([k, label]) => <Link key={k} href={link({ p: k })} className={period[0] === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{label}</Link>)}
        <Link href={link({ flagged: flaggedOnly ? "" : "1" })} className={flaggedOnly ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Flagged only</Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting for a decision" value={waiting.length} accent={waiting.length > 0} />
        <Stat label="To check" value={high} hint="High flags + won deals with no record" />
        <Stat label="Earned in period" value={inr(rows.reduce((s, r) => s + r.earnedInr, 0))} />
        <Stat label="Paid in period" value={inr(rows.reduce((s, r) => s + r.paidInr, 0))} />
      </div>

      {missing.length > 0 && (
        <section className="card mb-6 overflow-x-auto border-red-200">
          <div className="card-h"><div className="card-t text-red-700">Won deals with no incentive record</div><span className="text-xs text-neutral-500">Onboarding creates one; open the deal to start it</span></div>
          <table className="tbl">
            <thead><tr><th>Deal</th><th>Account</th><th>Won</th><th>Owner</th></tr></thead>
            <tbody>
              {missing.map((o) => (
                <tr key={o.id}>
                  <td><Link className="text-brand-fg hover:underline" href={`/leads/opportunities/${o.id}`}>{o.code}</Link><div className="text-xs text-neutral-500">{o.title}</div></td>
                  <td className="text-sm">{o.lead?.name ?? "—"}</td>
                  <td className="text-sm">{date(o.wonAt)}{o.onboardedAt && <div className="text-xs text-neutral-500">onboarded {date(o.onboardedAt)}</div>}</td>
                  <td className="text-sm">{o.ownerName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card mb-6 overflow-x-auto">
        <div className="card-h"><div className="card-t">Deals: at Won → decided → now</div><span className="text-xs text-neutral-500">{shown.length}</span></div>
        {shown.length === 0 ? (
          <Empty>{flaggedOnly ? "Nothing flagged in this period." : "No won deals in this period."}</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Deal</th><th>Seller</th><th className="hidden lg:table-cell">At Won</th><th>Decided</th><th className="num hidden md:table-cell">Paid by client</th>
                <th className="num hidden md:table-cell">Earned / paid out</th><th>Check</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/leads/incentives/${r.id}`} className="font-medium text-brand-fg hover:underline">{r.account?.name ?? r.code}</Link>
                    <div className="font-mono text-xs text-neutral-500">{r.code}{r.opportunity && ` · ${r.opportunity.code}`} · won {date(r.wonAt)}</div>
                    <div className="text-xs">{statusLabel(r.status)}{r.decidedBy ? ` by ${r.decidedBy}` : r.proposedBy ? ` (proposed by ${r.proposedBy})` : ""}</div>
                  </td>
                  <td className="text-sm">
                    {r.seller ?? <span className="text-red-600">none</span>}
                    {r.manager && <div className="text-xs text-neutral-500">manager {r.manager}</div>}
                    {r.leadOwnerAtWon && r.leadOwnerAtWon !== r.seller && <div className="text-xs text-amber-700">lead owner at Won: {r.leadOwnerAtWon}</div>}
                  </td>
                  <td className="hidden text-xs lg:table-cell">{r.wonSummary}{r.wonValue != null && <div className="text-neutral-500">{money(r.wonValue, r.wonCurrency)}</div>}</td>
                  <td className="text-xs">{r.qualifying ?? "—"}{r.base != null && <div className="text-neutral-500">{money(r.base, r.currency)}</div>}</td>
                  <td className="num hidden text-sm md:table-cell">{r.base ? `${money(r.collected, r.currency)}` : "—"}</td>
                  <td className="num hidden text-sm md:table-cell">{inr(r.earnedInr)}<div className="text-xs text-neutral-500">{inr(r.paidInr)} paid</div></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {r.flags.map((f) => <span key={f} className={`badge ${LEVEL_COLOR[FLAGS[f]?.level ?? "low"]}`} title={FLAGS[f]?.label}>{FLAGS[f]?.label ?? f}</span>)}
                      {r.flags.length === 0 && <span className="text-xs text-emerald-700">OK</span>}
                    </div>
                    {r.duplicateNote && <div className="mt-1 text-xs text-neutral-500">{r.duplicateNote}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">Recent changes</div><span className="text-xs text-neutral-500">Every step, every person</span></div>
        {changes.length === 0 ? (
          <Empty>No changes in this period.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>When</th><th>Deal</th><th>Step</th><th>Who</th><th>What</th><th className="hidden md:table-cell">Why</th></tr></thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap text-sm">{date(c.at)}</td>
                  <td className="text-sm"><Link className="hover:underline" href={`/leads/incentives/${c.incentiveId}`}>{c.incentive.code}</Link></td>
                  <td className="text-xs">{STAGE_LABEL[c.stage] ?? c.stage}</td>
                  <td className="text-sm">{c.byName}</td>
                  <td className="text-xs"><span className="font-medium">{c.field}</span>: {c.field === "created" ? show(c.toValue) : `${show(c.fromValue)} → ${show(c.toValue)}`}</td>
                  <td className="hidden text-xs md:table-cell">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
