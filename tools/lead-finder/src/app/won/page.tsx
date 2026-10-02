import Link from "next/link";
import { Empty, PageHeader } from "@genclover/ui";
import { can, canAccessPath, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, money } from "@genclover/ui/format";
import { OPP_MODELS } from "../../lib/b2b";
import { visibleDealValues } from "../../lib/dealAccess";
import { leadScope, opportunityScope } from "../../lib/scope";

/**
 * Won deals. Winning only marks the deal; Clients → Onboarding turns it into a client (Client ID, agreements,
 * project). Until then it waits here. Deal values follow the deal permissions.
 */
export default async function WonPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const onboarded = sp.show === "onboarded";
  // Sellers see their own won deals, managers their team's; owners, the CFO and onboarding see all.
  const os = await opportunityScope(user);
  const ls = await leadScope(user);
  const [opps, oldLeads, waiting, done] = await Promise.all([
    prisma.opportunity.findMany({
      where: { ...os, stage: "WON", onboardedAt: onboarded ? { not: null } : null },
      orderBy: { wonAt: "desc" },
      take: 500,
      omit: { value: true },
      include: { lead: { select: { id: true, name: true, code: true, wonReason: true } }, client: { select: { id: true, number: true, code: true, name: true } } },
    }),
    // Won before opportunities existed (no deal recorded): still waiting, shown here too.
    onboarded ? [] : prisma.lead.findMany({ where: { ...ls, stage: "WON", clientId: null, opportunities: { none: {} } }, select: { id: true, name: true, code: true, wonAt: true, wonPackage: true, wonCarePlan: true, wonReason: true, ownerName: true } }),
    prisma.opportunity.count({ where: { ...os, stage: "WON", onboardedAt: null } }),
    prisma.opportunity.count({ where: { ...os, stage: "WON", onboardedAt: { not: null } } }),
  ]);
  const values = await visibleDealValues(user, opps.map((o) => o.id));
  const showValue = can(user.role, "deals.all") || can(user.role, "deals.own");
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`badge ${on ? "bg-brand-soft text-brand-fg" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>{label}</Link>
  );
  const days = (d: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null);
  const onboardLink = canAccessPath(user.role, "/clients/onboarding");

  return (
    <>
      <PageHeader
        title="Won"
        subtitle="Won deals waiting for onboarding, and those already onboarded."
        actions={onboardLink && !onboarded && <Link href="/clients/onboarding" className="btn-primary">Open the onboarding queue →</Link>}
      />
      <div className="mb-4 flex gap-2 text-sm">
        {tab("/leads/won", `Waiting for onboarding (${waiting + oldLeads.length})`, !onboarded)}
        {tab("/leads/won?show=onboarded", `Onboarded (${done})`, onboarded)}
      </div>
      <div className="card overflow-x-auto">
        {opps.length + oldLeads.length === 0 ? (
          <Empty>{onboarded ? "No won deals have been onboarded yet." : "Nothing waiting. Won deals appear here until they are onboarded."}</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Deal</th><th>Account</th><th className="hidden lg:table-cell">How it&apos;s sold</th><th>Won</th>
                {showValue && <th className="num hidden md:table-cell">Value</th>}
                <th className="hidden md:table-cell">{onboarded ? "Client" : "Owner"}</th>
              </tr>
            </thead>
            <tbody>
              {opps.map((o) => {
                const age = days(o.wonAt);
                const v = values.get(o.id);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/leads/opportunities/${o.id}`} className="font-medium text-brand-fg hover:underline">{o.title}</Link>
                      <div className="font-mono text-xs text-neutral-500">{o.code}</div>
                    </td>
                    <td className="text-sm">
                      {o.lead ? <Link className="hover:underline" href={`/leads/${o.lead.id}`}>{o.lead.name}</Link> : o.client?.name}
                      {o.lead?.wonReason && <div className="text-xs text-neutral-500">{o.lead.wonReason}</div>}
                    </td>
                    <td className="hidden text-xs lg:table-cell">{OPP_MODELS[o.model]}</td>
                    <td className="text-sm">
                      {date(o.wonAt)}
                      {!onboarded && age != null && age >= 3 && <div className="text-xs text-amber-700">waiting {age} days</div>}
                    </td>
                    {showValue && <td className="num hidden md:table-cell">{v != null ? money(v, o.currency) : "—"}</td>}
                    <td className="hidden text-sm md:table-cell">
                      {onboarded && o.client ? (
                        canAccessPath(user.role, `/clients/${o.client.id}`) ? (
                          <Link className="text-brand-fg underline" href={`/clients/${o.client.id}`}>{o.client.number} · {o.client.code}</Link>
                        ) : (
                          `${o.client.number} · ${o.client.code}`
                        )
                      ) : (
                        (o.ownerName ?? "—")
                      )}
                    </td>
                  </tr>
                );
              })}
              {oldLeads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/leads/${l.id}`} className="font-medium text-brand-fg hover:underline">
                      {l.wonPackage ?? "Won"}
                      {l.wonCarePlan && l.wonCarePlan !== "None" && ` + ${l.wonCarePlan}`}
                    </Link>
                    <div className="font-mono text-xs text-neutral-500">{l.code}</div>
                  </td>
                  <td className="text-sm">{l.name}{l.wonReason && <div className="text-xs text-neutral-500">{l.wonReason}</div>}</td>
                  <td className="hidden lg:table-cell" />
                  <td className="text-sm">{date(l.wonAt)}</td>
                  {showValue && <td className="hidden md:table-cell" />}
                  <td className="hidden text-sm md:table-cell">{l.ownerName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
