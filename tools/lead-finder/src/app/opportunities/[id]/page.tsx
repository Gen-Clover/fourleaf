import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@genclover/ui";
import { can, canAccessPath, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, money } from "@genclover/ui/format";
import { OPP_MODELS, serviceLabel } from "../../../lib/b2b";
import { canSeeDeal } from "../../../lib/dealAccess";
import { deleteOpportunity } from "../../salesActions";
import OpportunityForm from "../OpportunityForm";
import { opportunityScope, seesAllLeads } from "../../../lib/scope";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const o = await prisma.opportunity.findUnique({
    where: { id },
    omit: { value: true },
    include: { lead: { select: { id: true, code: true, name: true } }, client: { select: { id: true, name: true, number: true } } },
  });
  if (!o) notFound();
  // Onboarding sees won deals (what was sold), nothing else.
  if (!can(user.role, "leads.view") && o.stage !== "WON") notFound();
  if (can(user.role, "leads.view") && !seesAllLeads(user) && !(await prisma.opportunity.count({ where: { id, ...(await opportunityScope(user)) } }))) notFound();
  const showValue = canSeeDeal(user, o);
  const value = showValue ? (await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { value: true } })).value : null;
  const canEdit = can(user.role, "leads.edit");
  const users = canEdit ? await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const project = o.projectId ? await prisma.project.findUnique({ where: { id: o.projectId }, select: { id: true, code: true, name: true } }) : null;

  return (
    <>
      <PageHeader
        title={o.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/leads/opportunities" className="hover:underline">← Opportunities</Link>·<span className="font-mono text-xs">{o.code}</span>·<StatusBadge status={o.stage} />
            {o.lead && <>·<Link className="hover:underline" href={`/leads/${o.lead.id}`}>{o.lead.name}</Link></>}
            {o.client && <>·client {canAccessPath(user.role, `/clients/${o.client.id}`) ? <Link className="hover:underline" href={`/clients/${o.client.id}`}>{o.client.number}</Link> : o.client.number}</>}
          </span>
        }
        actions={
          canEdit &&
          o.stage !== "WON" && (
            <form action={deleteOpportunity.bind(null, o.id)}>
              <button className="btn-danger">Delete</button>
            </form>
          )
        }
      />
      {o.stage === "WON" && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Won {date(o.wonAt)}.{" "}
          {o.onboardedAt ? (
            <>Onboarded {date(o.onboardedAt)}{project && <> · project <Link className="underline" href={`/projects/${project.id}`}>{project.code}</Link></>}.</>
          ) : (
            <>Waiting for onboarding{canAccessPath(user.role, "/clients/onboarding") && <> · <Link className="underline" href="/clients/onboarding">open the onboarding queue</Link></>}.</>
          )}
        </div>
      )}
      {canEdit ? (
        <OpportunityForm
          users={users}
          showValue={showValue}
          locked={!!o.onboardedAt}
          initial={{
            id: o.id,
            leadId: o.leadId ?? "",
            clientId: o.clientId ?? "",
            title: o.title,
            services: o.services,
            model: o.model,
            stage: o.stage,
            probability: o.probability == null ? "" : String(o.probability),
            value: value != null ? String(value) : "",
            currency: o.currency,
            expectedCloseAt: o.expectedCloseAt ? o.expectedCloseAt.toISOString().slice(0, 10) : "",
            ownerId: o.ownerId ?? user.id,
            source: o.source ?? "",
            nextStep: o.nextStep ?? "",
            lostReason: o.lostReason ?? "",
            notes: o.notes ?? "",
          }}
        />
      ) : (
        <div className="card space-y-2 p-5 text-sm">
          <div>How it&apos;s sold: {OPP_MODELS[o.model]}</div>
          <div>Services: {o.services.map(serviceLabel).join(", ") || "—"}</div>
          {value != null && <div>Value: {money(value, o.currency)}</div>}
          <div>Owner: {o.ownerName ?? "—"}</div>
          {o.notes && <p className="whitespace-pre-line text-neutral-600">{o.notes}</p>}
        </div>
      )}
    </>
  );
}
