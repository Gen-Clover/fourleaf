import Link from "next/link";
import { Empty, PageHeader, Stat } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { date, inr, money } from "@genclover/ui/format";
import { getSettings, members, visibleUserIds, wallet } from "@genclover/incentives";
import { BUCKET_LABEL, bucketOf, STATUS, statusLabel } from "@genclover/incentives/rules";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  NOT_ELIGIBLE: "bg-neutral-100 text-neutral-500",
};
const BUCKET_COLOR: Record<string, string> = { HOLDING: "text-amber-700", READY: "text-emerald-700", IN_PAY_RUN: "text-blue-700" };

/**
 * Incentives: each won deal, where it is (onboarding, client paying), what the person has earned on it and where
 * that money is (held for the refund period, ready for the next salary, in this month's pay run). Paid money leaves
 * the list; only the total paid to date stays. Nobody can withdraw or change anything here: Finance pays it.
 */
export default async function IncentivesPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const seeAll = can(user.role, "incentives.approve") || can(user.role, "incentives.manage");
  const allowed = seeAll ? null : await visibleUserIds(user.id);
  const team = await members();
  const people = seeAll ? team.map((m) => ({ id: m.userId, name: m.userName })) : team.filter((m) => allowed!.includes(m.userId)).map((m) => ({ id: m.userId, name: m.userName }));
  if (!people.some((p) => p.id === user.id) && (allowed ?? []).includes(user.id)) people.unshift({ id: user.id, name: user.name });
  // Whose money is shown: one person, or everyone this viewer may see.
  const pick = sp.u && (seeAll || allowed!.includes(sp.u)) ? sp.u : !seeAll && allowed!.length === 1 ? user.id : "all";
  const viewed = pick === "all" ? (seeAll ? null : allowed!) : [pick];
  const [{ deals }, s] = await Promise.all([wallet(viewed ?? "ALL"), getSettings()]);
  const isViewed = (uid: string | null) => !!uid && (viewed == null || viewed.includes(uid));
  const now = new Date();

  const lines = deals.flatMap((d) => d.entries.filter((e) => isViewed(e.userId)).map((e) => ({ ...e, deal: d })));
  const open = lines.filter((l) => !l.paidOn);
  const sum = (xs: { amountInr: number }[]) => xs.reduce((t, x) => t + x.amountInr, 0);
  const byBucket = (b: string) => sum(open.filter((l) => bucketOf(l, now) === b));
  const paid = sum(lines.filter((l) => l.paidOn));
  const expected = deals.filter((d) => d.status === "APPROVED").reduce((t, d) => t + [d.seller.id, d.manager?.id].filter((id): id is string => isViewed(id ?? null)).reduce((x, id) => x + d.expectedFor(id), 0), 0);
  const pendingDeals = deals.filter((d) => ["DRAFT", "PENDING_APPROVAL"].includes(d.status)).length;
  const link = (u: string) => `/leads/incentives${u === "all" ? "" : `?u=${u}`}`;

  return (
    <>
      <PageHeader
        title="Incentives"
        subtitle={`${s.sellerPct}% to the seller and ${s.managerPct}% to their manager, on the first service a new client buys (excluding GST). Earned as the client pays, held ${s.holdDays} days, then paid with the next salary.`}
        actions={seeAll && <Link href="/leads/incentives/review" className="btn-secondary">Review & changes →</Link>}
      />

      {people.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link href={link("all")} className={pick === "all" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{seeAll ? "Everyone" : "Me and my team"}</Link>
          {people.map((p) => (
            <Link key={p.id} href={link(p.id)} className={pick === p.id ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{p.id === user.id ? "Me" : p.name}</Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Expected" value={inr(expected)} hint="Approved deals, as the client pays" />
        <Stat label="Holding" value={inr(byBucket("HOLDING"))} hint={`${s.holdDays}-day refund period`} />
        <Stat label="Ready" value={inr(byBucket("READY"))} hint="Paid with the next salary" accent />
        <Stat label="In pay run" value={inr(byBucket("IN_PAY_RUN"))} hint="This month's pay run" />
        <Stat label="Paid to date" value={inr(paid)} hint={pendingDeals ? `${pendingDeals} deal(s) awaiting a decision` : "Paid lines leave the list"} />
      </div>

      <section className="card mb-6 overflow-x-auto">
        <div className="card-h"><div className="card-t">Deals</div><span className="text-xs text-neutral-500">{deals.length}</span></div>
        {deals.length === 0 ? (
          <Empty>No incentive deals yet. A deal appears here when it&apos;s marked Won in the Lead Finder.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Deal</th><th>Status</th><th className="hidden md:table-cell">Qualifying service</th><th>Client has paid</th>
                <th className="num">Earned</th><th className="num hidden sm:table-cell">Still to come</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const ids = [d.seller.id, d.manager?.id].filter((id): id is string => isViewed(id ?? null));
                const earned = ids.reduce((t, id) => t + d.earnedBy(id), 0);
                const toCome = ids.reduce((t, id) => t + d.expectedFor(id), 0);
                const role = ids.map((id) => (id === d.seller.id ? `seller ${d.seller.ratePct}%` : `manager ${d.manager?.ratePct}%`)).join(", ");
                return (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/leads/incentives/${d.id}`} className="font-medium text-brand-fg hover:underline">{d.client?.name ?? d.lead?.name ?? d.code}</Link>
                      <div className="font-mono text-xs text-neutral-500">{d.code} · won {date(d.wonAt)}</div>
                      <div className="text-xs text-neutral-500">{d.seller.name ?? "no seller"}{d.manager ? ` · ${d.manager.name}` : ""}{viewed?.length === 1 && role ? ` · you: ${role}` : ""}</div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[d.status] ?? "bg-neutral-100 text-neutral-700"}`} title={STATUS[d.status as keyof typeof STATUS]?.hint}>{statusLabel(d.status)}</span>
                      {d.client && <div className="mt-1 text-xs text-neutral-500">Client {d.client.status === "ONBOARDING" ? "onboarding" : d.client.status.toLowerCase()}{d.project ? ` · ${d.project.code} ${d.project.status.toLowerCase()}` : ""}</div>}
                    </td>
                    <td className="hidden text-sm md:table-cell">
                      {d.qualifying ?? "—"}
                      {d.base != null && <div className="text-xs text-neutral-500">{money(d.base, d.currency)}{d.qualifyingKind === "MONTHLY" ? " (first month)" : ""}</div>}
                    </td>
                    <td className="min-w-32">
                      {d.status === "APPROVED" && d.base ? (
                        <>
                          <div className="h-1.5 w-full rounded bg-neutral-100"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${d.collectedPct}%` }} /></div>
                          <div className="mt-1 text-xs text-neutral-500">{d.collectedPct}% · {money(d.collected, d.currency)}{d.invoices.length ? ` · ${d.invoices.map((i) => i.number).join(", ")}` : " · not invoiced yet"}</div>
                        </>
                      ) : (
                        <span className="text-xs text-neutral-500">{d.status === "NOT_ELIGIBLE" ? "—" : "after approval"}</span>
                      )}
                    </td>
                    <td className="num">{inr(earned)}</td>
                    <td className="num hidden sm:table-cell">{toCome ? inr(toCome) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">Money not paid yet</div><span className="text-xs text-neutral-500">Managed by Finance: paid in the pay run, then it leaves this list</span></div>
        {open.length === 0 ? (
          <Empty>Nothing waiting. Money appears here when a client pays for a deal with an approved incentive.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>Client paid</th><th>Deal</th><th className="hidden md:table-cell">For</th><th className="num">Amount</th><th>Where it is</th></tr></thead>
            <tbody>
              {open
                .sort((a, b) => a.availableOn.getTime() - b.availableOn.getTime())
                .map((l) => {
                  const b = bucketOf(l, now);
                  return (
                    <tr key={l.id}>
                      <td className="text-sm">{date(l.date)}{l.invoiceNumber && <div className="font-mono text-xs text-neutral-500">{l.invoiceNumber}</div>}</td>
                      <td className="text-sm"><Link className="hover:underline" href={`/leads/incentives/${l.deal.id}`}>{l.deal.code}</Link><div className="text-xs text-neutral-500">{l.deal.client?.name}</div></td>
                      <td className="hidden text-xs md:table-cell">
                        {l.userName} · {l.role === "SELLER" ? "seller" : "manager"}{l.ratePct ? ` ${l.ratePct}%` : ""}
                        {l.type !== "ACCRUAL" && <div className="text-neutral-500">{l.type === "REVERSAL" ? "Reversal" : "Adjustment"}{l.note ? `: ${l.note}` : ""}</div>}
                      </td>
                      <td className={`num ${l.amountInr < 0 ? "text-red-600" : ""}`}>{inr(l.amountInr, 2)}</td>
                      <td className={`text-sm ${BUCKET_COLOR[b] ?? ""}`}>{BUCKET_LABEL[b]}{b === "HOLDING" && <div className="text-xs text-neutral-500">until {date(l.availableOn)}</div>}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
