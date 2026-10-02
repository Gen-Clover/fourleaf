import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, money } from "@genclover/ui/format";
import { B2B_SERVICES, OPEN_OPP_STAGES, OPP_MODELS, OPP_STAGES, serviceLabel } from "../../lib/b2b";
import { visibleDealValues } from "../../lib/dealAccess";
import { opportunityScope } from "../../lib/scope";

const VIEWS: [string, string][] = [["open", "Open"], ["WON", "Won"], ["LOST", "Lost"], ["ON_HOLD", "On hold"], ["all", "All"]];

/**
 * Deals by stage. A company can have several (a data migration and a web app are two). Values: each person
 * sees the deals they may see; the weighted totals are for owners and the CFO only.
 */
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ view?: string; owner?: string; service?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = VIEWS.some(([k]) => k === sp.view) ? sp.view! : "open";
  const all = can(user.role, "deals.all");
  const opps = await prisma.opportunity.findMany({
    where: {
      ...(await opportunityScope(user)),
      ...(view === "open" ? { stage: { in: OPEN_OPP_STAGES } } : view === "all" ? {} : { stage: view }),
      ...(sp.owner === "me" ? { ownerId: user.id } : {}),
      ...(sp.service && B2B_SERVICES[sp.service] ? { services: { has: sp.service } } : {}),
    },
    orderBy: [{ expectedCloseAt: "asc" }, { updatedAt: "desc" }],
    take: 500,
    omit: { value: true },
    include: { lead: { select: { id: true, name: true, code: true } }, client: { select: { id: true, name: true } } },
  });
  // Values are read only for deals this person may see.
  const values = await visibleDealValues(user, opps.map((o) => o.id));
  const rows = opps.map((o) => ({ ...o, value: values.get(o.id) ?? null }));
  const byStage = OPEN_OPP_STAGES.map((s) => ({ stage: s, items: rows.filter((o) => o.stage === s) }));
  const totals = all
    ? Object.entries(
        rows
          .filter((o) => OPEN_OPP_STAGES.includes(o.stage) && o.value != null)
          .reduce<Record<string, { total: number; weighted: number }>>((acc, o) => {
            acc[o.currency] ??= { total: 0, weighted: 0 };
            acc[o.currency].total += o.value!;
            acc[o.currency].weighted += (o.value! * (o.probability ?? OPP_STAGES[o.stage].probability)) / 100;
            return acc;
          }, {}),
      )
    : [];
  const link = (patch: Record<string, string>) => `/leads/opportunities?${new URLSearchParams({ view, ...(sp.owner ? { owner: sp.owner } : {}), ...(sp.service ? { service: sp.service } : {}), ...patch })}`;

  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle="Every possible piece of work with an account or client. Won deals go to Clients → Onboarding."
        actions={can(user.role, "leads.edit") && <Link href="/leads/opportunities/new" className="btn-primary">+ Opportunity</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {VIEWS.map(([k, label]) => (
          <Link key={k} href={link({ view: k })} className={view === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{label}</Link>
        ))}
        <Link href={link({ owner: sp.owner === "me" ? "" : "me" })} className={sp.owner === "me" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Mine</Link>
        {totals.map(([c, t]) => (
          <span key={c} className="badge ml-auto bg-neutral-100 text-neutral-700">
            {c}: {money(t.total, c)} open · {money(t.weighted, c)} weighted <span className="ml-1 text-neutral-500">(owners only)</span>
          </span>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="card"><Empty href={can(user.role, "leads.edit") ? "/leads/opportunities/new" : undefined} cta="Add an opportunity">No opportunities here.</Empty></div>
      ) : view === "open" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {byStage.map(({ stage, items }) => (
            <section key={stage} className="card min-w-0">
              <div className="card-h"><div className="card-t">{OPP_STAGES[stage].label.split(" (")[0]}</div><span className="text-xs text-neutral-500">{items.length}</span></div>
              <ul className="divide-y divide-neutral-100">
                {items.map((o) => (
                  <li key={o.id} className="px-4 py-3 text-sm">
                    <Link href={`/leads/opportunities/${o.id}`} className="font-medium text-brand-fg hover:underline">{o.title}</Link>
                    <div className="text-xs text-neutral-500">{o.lead?.name ?? o.client?.name} · <span className="font-mono">{o.code}</span></div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-neutral-600">
                      {o.value != null && <span className="font-medium">{money(o.value, o.currency)}</span>}
                      {o.expectedCloseAt && <span>close {date(o.expectedCloseAt)}</span>}
                      <span>{o.ownerName}</span>
                    </div>
                    {o.nextStep && <div className="mt-1 text-xs text-neutral-500">Next: {o.nextStep}</div>}
                  </li>
                ))}
                {items.length === 0 && <li className="px-4 py-4 text-xs text-neutral-500">None</li>}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Deal</th><th>Account</th><th className="hidden md:table-cell">Model</th><th>Stage</th><th className="hidden lg:table-cell">Services</th><th className="num">Value</th><th className="hidden md:table-cell">Owner</th><th>Date</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/leads/opportunities/${o.id}`} className="font-medium text-brand-fg hover:underline">{o.title}</Link><div className="font-mono text-xs text-neutral-500">{o.code}</div></td>
                  <td className="text-sm">{o.lead ? <Link className="hover:underline" href={`/leads/${o.lead.id}`}>{o.lead.name}</Link> : o.client?.name}</td>
                  <td className="hidden text-xs md:table-cell">{OPP_MODELS[o.model]}</td>
                  <td><StatusBadge status={o.stage} />{o.stage === "WON" && <div className="text-xs text-neutral-500">{o.onboardedAt ? "onboarded" : "waiting for onboarding"}</div>}</td>
                  <td className="hidden text-xs lg:table-cell">{o.services.map(serviceLabel).join(", ")}</td>
                  <td className="num">{o.value != null ? money(o.value, o.currency) : "—"}</td>
                  <td className="hidden md:table-cell">{o.ownerName}</td>
                  <td className="text-sm">{date(o.wonAt ?? o.expectedCloseAt ?? o.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
