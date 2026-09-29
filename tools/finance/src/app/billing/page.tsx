import Link from "next/link";
import { PageHeader, Stat, StatusBadge } from "@genclover/ui";
import { hasRole, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { parseSnapshot } from "../../lib/settings";
import { split } from "../../lib/calc";
import { MONTH_STATUSES, STATUS_LABEL, date, monthLabel, usd, usd0 } from "@genclover/ui/format";
import { createInvoiceFromMonth } from "../invoices/actions";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string; month?: string }> }) {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "EDITOR");
  const sp = await searchParams;
  const records = await prisma.monthlyRecord.findMany({
    where: { ...(sp.status ? { status: sp.status } : {}), ...(sp.month ? { month: sp.month } : {}) },
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    include: {
      project: { include: { client: true } },
      invoice: { select: { id: true, number: true, status: true, issueDate: true, payments: { select: { date: true }, orderBy: { date: "asc" } } } },
    },
  });
  const months = await prisma.monthlyRecord.findMany({ distinct: ["month"], select: { month: true }, orderBy: { month: "desc" } });

  let revenue = 0,
    delivery = 0,
    growth = 0,
    corporate = 0,
    profit = 0;
  for (const r of records) {
    const s = split(r.revenue, parseSnapshot(r.project.allocationSnapshot));
    revenue += r.revenue;
    delivery += s.delivery;
    growth += s.growth;
    corporate += s.corporate;
    profit += s.profit;
  }
  const outstanding = records.filter((r) => r.status === "INVOICED").reduce((s, r) => s + r.revenue, 0);
  const draft = records.filter((r) => r.status === "DRAFT").reduce((s, r) => s + r.revenue, 0);
  const qs = (patch: Record<string, string | undefined>) => {
    const o = { status: sp.status, month: sp.month, ...patch };
    const s = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&");
    return `/billing${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Monthly Billing" subtitle="All monthly records across projects — invoice tracking and allocation of revenue." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="Revenue" value={usd0(revenue)} accent />
        <Stat label="Delivery" value={usd0(delivery)} />
        <Stat label="Growth" value={usd0(growth)} />
        <Stat label="Corporate" value={usd0(corporate)} hint={`Profit ${usd0(profit)}`} />
        <Stat label="Outstanding" value={usd0(outstanding)} hint="Invoiced, not paid" />
        <Stat label="Not invoiced" value={usd0(draft)} hint="Draft" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={qs({ status: undefined })} className={!sp.status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All statuses</Link>
        {MONTH_STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s })} className={sp.status === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{STATUS_LABEL[s]}</Link>
        ))}
        <span className="mx-2 text-neutral-300">|</span>
        <Link href={qs({ month: undefined })} className={!sp.month ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All months</Link>
        {months.slice(0, 12).map((m) => (
          <Link key={m.month} href={qs({ month: m.month })} className={sp.month === m.month ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{monthLabel(m.month)}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Month</th><th>Project</th><th>Client</th><th>Status</th><th>Invoice #</th><th>Invoiced</th><th>Paid</th><th className="num">Hours</th><th className="num">Revenue</th><th></th></tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{monthLabel(r.month)}</td>
                <td><Link href={`/projects/${r.projectId}?tab=monthly&month=${r.month}`} className="text-brand-fg hover:underline"><span className="font-mono text-xs">{r.project.code}</span> {r.project.name}</Link></td>
                <td>{r.project.client.name}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.invoice ? <Link href={`/invoices/${r.invoice.id}`} className="font-mono text-xs text-brand-fg hover:underline">{r.invoice.number}</Link> : "—"}</td>
                <td className="whitespace-nowrap">{r.invoice && r.invoice.status !== "DRAFT" ? date(r.invoice.issueDate) : "—"}</td>
                <td className="whitespace-nowrap">{r.invoice?.status === "PAID" ? date(r.invoice.payments.at(-1)?.date) : "—"}</td>
                <td className="num">{r.hours}</td>
                <td className="num font-semibold">{usd(r.revenue)}</td>
                <td className="whitespace-nowrap">
                  {canEdit && !r.invoice && (
                    <form action={createInvoiceFromMonth.bind(null, r.projectId, r.month)}><button className="btn-primary btn-sm">Create invoice</button></form>
                  )}
                  {r.invoice && r.status === "INVOICED" && <Link href={`/invoices/${r.invoice.id}`} className="btn-secondary btn-sm">Record payment</Link>}
                </td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-neutral-500">No monthly records match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
