import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getInvoiceSettings, getParams } from "../../../lib/settings";
import { addDays, utcDay, ymd } from "../../../lib/finance";
import { defaultTax } from "../../../lib/tax";
import InvoiceEditor from "../InvoiceEditor";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string; project?: string }> }) {
  await requirePermission("finance.edit");
  const sp = await searchParams;
  const [clients, projects, p, s] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, country: true, state: true, paymentTermsDays: true } }),
    prisma.project.findMany({ orderBy: { code: "desc" }, select: { id: true, code: true, name: true, clientId: true } }),
    getParams(),
    getInvoiceSettings(),
  ]);
  const today = utcDay(ymd(new Date()));
  const client = clients.find((c) => c.id === sp.client);
  const t = client ? defaultTax(client, s) : { taxType: "EXPORT_LUT", taxRate: 0, placeOfSupply: "" };
  return (
    <>
      <PageHeader title="New invoice" subtitle="Monthly services: create it from the project's Monthly Billing. Fixed price: from Milestone billing. Advances and one-offs: here." />
      <InvoiceEditor
        id={null}
        clients={clients}
        projects={projects}
        company={{ state: s.state, gstRate: s.gstRate, sac: s.sac }}
        usdRate={p.fxRate}
        initial={{
          clientId: sp.client ?? "",
          projectId: sp.project ?? null,
          issueDate: ymd(today),
          dueDate: ymd(addDays(today, client?.paymentTermsDays ?? s.termsDays)),
          currency: client?.currency ?? "USD",
          fxRate: client?.currency === "INR" ? 1 : p.fxRate,
          taxType: t.taxType,
          taxRate: t.taxRate,
          placeOfSupply: t.placeOfSupply,
          sac: s.sac,
          notes: "",
          lines: [{ kind: "SERVICES", description: "", quantity: 1, unitPrice: 0, expenseId: null }],
        }}
      />
    </>
  );
}
