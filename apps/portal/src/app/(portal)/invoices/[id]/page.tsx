import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote, Stat, StatusBadge } from "@/components/ui";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { agingBucket, paidUsd, paymentFx, ymd } from "@/lib/finance";
import { LINE_KINDS, date, inr, monthLabel, num, usd } from "@/lib/format";
import InvoiceEditor from "../InvoiceEditor";
import { PaymentForm, StatusActions } from "./InvoiceControls";
import { deleteInvoice, deletePayment } from "../actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user.role, "EDITOR");
  const isAdmin = user.role === "ADMIN";
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      project: { select: { id: true, code: true, name: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { date: "asc" } },
      months: { select: { month: true, projectId: true, revenue: true } },
    },
  });
  if (!inv) notFound();

  const paid = paidUsd(inv.payments);
  const balance = inv.total - paid;
  const isOpen = inv.status === "SENT" || inv.status === "PARTIAL";
  const fxTotal = inv.payments.reduce((s, p) => s + paymentFx(p, inv.fxRate).fxGainInr, 0);
  const received = inv.payments.reduce((s, p) => s + p.inrReceived, 0);
  const monthRevenue = inv.months.reduce((s, m) => s + m.revenue, 0);
  const servicesTotal = inv.lines.filter((l) => l.kind !== "PASS_THROUGH").reduce((s, l) => s + l.amount, 0);
  const editable = canEdit && inv.status === "DRAFT";

  const [clients, projects] = editable
    ? await Promise.all([
        prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.project.findMany({ orderBy: { code: "desc" }, select: { id: true, code: true, name: true, clientId: true } }),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/clients/${inv.clientId}`} className="text-brand hover:underline">{inv.client.name}</Link>
            {inv.project && <>· <Link href={`/projects/${inv.project.id}?tab=monthly`} className="text-brand hover:underline">{inv.project.code} {inv.project.name}</Link></>}
            · <StatusBadge status={inv.status} />
          </span>
        }
        actions={
          <>
            <Link href={`/invoices/${inv.id}/print`} target="_blank" className="btn-secondary">Print / PDF</Link>
            {canEdit && inv.status === "DRAFT" && inv.number.startsWith("DRAFT-") && (
              <form action={deleteInvoice.bind(null, inv.id)}><button className="btn-danger">Delete draft</button></form>
            )}
          </>
        }
      />
      {!canEdit && <ReadOnlyNote />}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Total" value={usd(inv.total)} hint={`Booked ${inr(inv.total * inv.fxRate)} @ ₹${inv.fxRate}`} accent />
        <Stat label="Paid" value={usd(paid)} hint={`${inv.payments.length} payment(s)`} />
        <Stat label="Balance" value={usd(isOpen ? balance : 0)} hint={isOpen ? `Due ${date(inv.dueDate)} · ${agingBucket(inv.dueDate)}` : undefined} />
        <Stat label="₹ received" value={inr(received)} />
        <Stat label="Realised FX" value={<span className={fxTotal >= 0 ? "text-emerald-700" : "text-red-600"}>{inr(fxTotal)}</span>} hint="Incl. bank charges" />
      </div>

      {canEdit && <div className="mb-6"><StatusActions id={inv.id} status={inv.status} hasPayments={inv.payments.length > 0} isAdmin={isAdmin} /></div>}

      {inv.months.length > 0 && Math.abs(servicesTotal - monthRevenue) > 0.01 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Services lines ({usd(servicesTotal)}) differ from the linked monthly billing revenue ({usd(monthRevenue)}).
        </div>
      )}

      {editable ? (
        <InvoiceEditor
          id={inv.id}
          clients={clients}
          projects={projects}
          initial={{
            clientId: inv.clientId,
            projectId: inv.projectId,
            issueDate: ymd(inv.issueDate),
            dueDate: ymd(inv.dueDate),
            fxRate: inv.fxRate,
            notes: inv.notes ?? "",
            lines: inv.lines.map((l) => ({ kind: l.kind, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, expenseId: l.expenseId })),
          }}
        />
      ) : (
        <div className="card overflow-x-auto">
          <div className="card-h">
            <div className="card-t">Lines</div>
            <span className="text-xs text-neutral-500">Issued {date(inv.issueDate)} · due {date(inv.dueDate)} · booking FX ₹{inv.fxRate}</span>
          </div>
          <table className="tbl">
            <thead><tr><th>Type</th><th>Description</th><th className="num">Qty / hrs</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}><td className="text-xs">{LINE_KINDS[l.kind]}</td><td>{l.description}</td><td className="num">{num(l.quantity, 2)}</td><td className="num">{usd(l.unitPrice)}</td><td className="num">{usd(l.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4}>TOTAL (USD)</td><td className="num">{usd(inv.total)}</td></tr></tfoot>
          </table>
          {inv.notes && <p className="px-5 py-3 text-sm text-neutral-600">{inv.notes}</p>}
        </div>
      )}

      {inv.months.length > 0 && (
        <p className="mt-3 text-sm text-neutral-600">
          Bills monthly record(s):{" "}
          {inv.months.map((m) => (
            <Link key={m.month} href={`/projects/${m.projectId}?tab=monthly&month=${m.month}`} className="mr-2 text-brand hover:underline">{monthLabel(m.month)}</Link>
          ))}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {canEdit && isOpen && <PaymentForm invoiceId={inv.id} balance={balance} fxRate={inv.fxRate} />}
        <div className="card overflow-x-auto">
          <div className="card-h"><div className="card-t">Payments</div></div>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Reference</th><th className="num">US$</th><th className="num">₹ received</th><th className="num">Bank charges</th><th className="num">Effective ₹/$</th><th className="num">FX gain / loss</th><th></th></tr></thead>
            <tbody>
              {inv.payments.map((p) => {
                const fx = paymentFx(p, inv.fxRate);
                return (
                  <tr key={p.id}>
                    <td>{date(p.date)}</td>
                    <td>{p.reference ?? "—"}</td>
                    <td className="num">{usd(p.amountUsd)}</td>
                    <td className="num">{inr(p.inrReceived)}</td>
                    <td className="num">{inr(p.bankChargesInr)}</td>
                    <td className="num">{fx.effectiveRate.toFixed(2)}</td>
                    <td className={`num ${fx.fxGainInr >= 0 ? "text-emerald-700" : "text-red-600"}`}>{inr(fx.fxGainInr)}</td>
                    <td>{isAdmin && <form action={deletePayment.bind(null, p.id)}><button className="btn-danger btn-sm">Delete</button></form>}</td>
                  </tr>
                );
              })}
              {inv.payments.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-neutral-500">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
