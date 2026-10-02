import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { can, requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import OpportunityForm from "../OpportunityForm";
import { leadScope } from "../../../lib/scope";

/** A new deal for an account (?lead=) or an existing client (?client=). */
export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<{ lead?: string; client?: string }> }) {
  const user = await requirePermission("leads.edit");
  const sp = await searchParams;
  const [lead, client, users, accounts] = await Promise.all([
    sp.lead ? prisma.lead.findUnique({ where: { id: sp.lead }, select: { id: true, name: true, services: true, market: true, ownerId: true, bestService: true, kind: true } }) : null,
    sp.client ? prisma.client.findUnique({ where: { id: sp.client }, select: { id: true, name: true, currency: true } }) : null,
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    sp.lead || sp.client ? [] : prisma.lead.findMany({ where: { ...(await leadScope(user)), kind: "B2B" }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true }, take: 500 }),
  ]);
  if (!lead && !client) {
    return (
      <>
        <PageHeader title="New opportunity" subtitle="Pick the company it's for. For an existing client, open the client and add it there." />
        <div className="card p-4">
          <ul className="grid gap-1 text-sm md:grid-cols-2">
            {accounts.map((a) => (
              <li key={a.id}><Link className="text-brand-fg hover:underline" href={`/leads/opportunities/new?lead=${a.id}`}>{a.name}</Link> <span className="font-mono text-xs text-neutral-500">{a.code}</span></li>
            ))}
            {accounts.length === 0 && <li className="text-neutral-500">No company accounts yet. <Link className="underline" href="/leads/new?kind=B2B">Add one</Link>.</li>}
          </ul>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader title="New opportunity" subtitle={`For ${lead?.name ?? client?.name}. A company can have several: one per piece of work.`} />
      <OpportunityForm
        users={users}
        showValue={can(user.role, "deals.all") || can(user.role, "deals.own")}
        initial={{
          leadId: lead?.id ?? "",
          clientId: client?.id ?? "",
          title: "",
          services: lead?.kind === "B2B" ? lead.services : [],
          model: "FIXED_SCOPE",
          stage: "DISCOVERY",
          probability: "",
          value: "",
          currency: client?.currency ?? (lead?.market === "US" ? "USD" : "INR"),
          expectedCloseAt: "",
          ownerId: lead?.ownerId ?? user.id,
          source: "",
          nextStep: "",
          lostReason: "",
          notes: "",
        }}
      />
    </>
  );
}
