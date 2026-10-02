import Link from "next/link";
import { PageHeader, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { AGING, agingBucket, fyLabel, fyStartYear, paidUsd } from "../../lib/finance";
import { INVOICE_STATUSES, STATUS_LABEL, date, inr, money } from "@genclover/ui/format";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; client?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const invoices = await prisma.invoice.findMany({
    where: { ...(sp.status ? { status: sp.status } : {}), ...(sp.client ? { clientId: sp.client } : {}) },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    include: { client: { select: { name: true } }, project: { select: { code: true, name: true } }, payments: true },
  });
  const all = sp.status || sp.client ? await prisma.invoice.findMany({ include: { payments: true } }) : invoices;

  const fy = fyStartYear(new Date());
  const open = all.filter((i) => i.status === "SENT" || i.status === "PARTIAL");
  const balance = (i: (typeof all)[number]) => i.total - paidUsd(i.payments);
  // Totals across currencies are in ₹ (each invoice at its booking rate; received cash as it landed).
  const outstanding = open.reduce((s, i) => s + balance(i) * i.fxRate, 0);
  const overdue = open.filter((i) => agingBucket(i.dueDate) !== "Not due").reduce((s, i) => s + balance(i) * i.fxRate, 0);
  const collectedFy = all.flatMap((i) => i.payments).filter((p) => fyStartYear(p.date) === fy).reduce((s, p) => s + p.inrReceived + p.tdsInr, 0);
  const drafts = all.filter((i) => i.status === "DRAFT");

  const qs = (status?: string) => `/invoices${status ? `?status=${status}` : ""}`;

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Export invoices (US$) and GST invoices (₹), payments received, TDS and receivables. Totals in ₹."
        actions={can(user.role, "finance.edit") && <Link href="/invoices/new" className="btn-primary">+ New invoice</Link>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Outstanding" value={inr(outstanding)} hint={`${open.length} open invoice(s)`} accent />
        <Stat label="Overdue" value={inr(overdue)} hint="Past due date" />
        <Stat label={`Collected ${fyLabel(fy)}`} value={inr(collectedFy)} hint="Received + TDS deducted" />
        <Stat label="Drafts" value={drafts.length} hint={inr(drafts.reduce((s, i) => s + i.total * i.fxRate, 0))} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={qs()} className={!sp.status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</Link>
        {INVOICE_STATUSES.map((s) => (
          <Link key={s} href={qs(s)} className={sp.status === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{STATUS_LABEL[s]}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Number</th><th>Client</th><th>Project</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th>Aging</th></tr>
          </thead>
          <tbody>
            {invoices.map((i) => {
              const bal = balance(i);
              const isOpen = i.status === "SENT" || i.status === "PARTIAL";
              const age = isOpen ? agingBucket(i.dueDate) : null;
              return (
                <tr key={i.id}>
                  <td><Link href={`/invoices/${i.id}`} className="font-mono text-xs font-medium text-brand-fg hover:underline">{i.number}</Link></td>
                  <td>{i.client.name}</td>
                  <td>{i.project ? <span className="text-xs"><span className="font-mono">{i.project.code}</span> {i.project.name}</span> : "—"}</td>
                  <td className="whitespace-nowrap">{date(i.issueDate)}</td>
                  <td className="whitespace-nowrap">{date(i.dueDate)}</td>
                  <td><StatusBadge status={i.status} /></td>
                  <td className="num">{money(i.total, i.currency, 2)}</td>
                  <td className="num">{money(paidUsd(i.payments), i.currency, 2)}</td>
                  <td className="num font-semibold">{isOpen ? money(bal, i.currency, 2) : "—"}</td>
                  <td>{age && <span className={`badge ${age === "Not due" ? "bg-neutral-100 text-neutral-600" : age === "1–30" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{age === "Not due" ? "Not due" : `${age} days`}</span>}</td>
                </tr>
              );
            })}
            {invoices.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-neutral-500">No invoices yet. Create one from a project&apos;s Monthly Billing tab, or with + New invoice.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">Aging buckets: {AGING.join(" · ")} days past due.</p>
    </>
  );
}
