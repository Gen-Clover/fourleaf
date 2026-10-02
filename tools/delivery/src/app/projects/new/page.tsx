import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { MODELS } from "@genclover/finance/lib/calc";
import NewProjectForm from "./NewProjectForm";

/** The engagement model a won deal suggests. */
const MODEL_FOR: Record<string, string> = { FIXED_SCOPE: "FIXED_PRICE", DEDICATED: "RETAINER", TM: "TM", MAINTENANCE: "RETAINER", PRODUCT: "FIXED_PRICE" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ client?: string; deal?: string }> }) {
  await requirePermission("projects.create");
  const sp = await searchParams;
  const [clients, deals, sows, internal] = await Promise.all([
    prisma.client.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, currency: true } }),
    prisma.opportunity.findMany({ where: { stage: "WON", projectId: null }, orderBy: { wonAt: "desc" }, select: { id: true, code: true, title: true, clientId: true, model: true } }),
    prisma.agreement.findMany({ where: { type: { in: ["SOW", "RESOURCE", "SUPPORT"] }, projectId: null }, select: { id: true, code: true, title: true, clientId: true } }),
    prisma.client.findFirst({ where: { code: "GCL" }, select: { id: true } }),
  ]);
  const deal = deals.find((d) => d.id === sp.deal);
  return (
    <>
      <PageHeader title="New project" subtitle="The project gets its ID (client code + P01) now. Milestones and the team come next." />
      <NewProjectForm
        clients={clients.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}`, currency: c.currency }))}
        models={MODELS}
        deals={deals.map((d) => ({ id: d.id, label: `${d.code} ${d.title}`, clientId: d.clientId, model: d.model }))}
        sows={sows.map((s) => ({ id: s.id, label: `${s.code} ${s.title}`, clientId: s.clientId }))}
        internalClientId={internal?.id ?? null}
        initial={{
          clientId: deal?.clientId ?? (clients.some((c) => c.id === sp.client) ? sp.client! : ""),
          opportunityId: deal?.id ?? "",
          name: deal?.title ?? "",
          kind: "PROJECT",
          engagementModel: deal ? (MODEL_FOR[deal.model] ?? "TM") : "TM",
        }}
      />
    </>
  );
}
