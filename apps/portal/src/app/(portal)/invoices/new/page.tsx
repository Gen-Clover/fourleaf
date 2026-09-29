import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInvoiceSettings, getParams } from "@/lib/settings";
import { addDays, utcDay, ymd } from "@/lib/finance";
import InvoiceEditor from "../InvoiceEditor";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string; project?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const [clients, projects, p, s] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({ orderBy: { code: "desc" }, select: { id: true, code: true, name: true, clientId: true } }),
    getParams(),
    getInvoiceSettings(),
  ]);
  const today = utcDay(ymd(new Date()));
  return (
    <>
      <PageHeader title="New invoice" subtitle="For monthly services, create the invoice from the project's Monthly Billing tab instead — lines are filled in for you." />
      <InvoiceEditor
        id={null}
        clients={clients}
        projects={projects}
        initial={{
          clientId: sp.client ?? "",
          projectId: sp.project ?? null,
          issueDate: ymd(today),
          dueDate: ymd(addDays(today, s.termsDays)),
          fxRate: p.fxRate,
          notes: "",
          lines: [{ kind: "SERVICES", description: "", quantity: 1, unitPrice: 0, expenseId: null }],
        }}
      />
    </>
  );
}
