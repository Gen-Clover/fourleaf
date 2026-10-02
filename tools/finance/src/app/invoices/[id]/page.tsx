import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { agingBucket, paidUsd, paymentFx, ymd } from "../../../lib/finance";
import { getInvoiceSettings, getParams } from "../../../lib/settings";
import { TAX_TYPES, taxOn } from "../../../lib/tax";
import { LINE_KINDS, date, inr, money, monthLabel, num } from "@genclover/ui/format";
import InvoiceEditor from "../InvoiceEditor";
import { PaymentForm, StatusActions } from "./InvoiceControls";
import { deleteInvoice, deletePayment } from "../actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = can(user.role, "finance.edit");
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

  const cur = inv.currency;
  const paid = paidUsd(inv.payments);
  const balance = inv.total - paid;
  const isOpen = inv.status === "SENT" || inv.status === "PARTIAL";
  const fxTotal = inv.payments.reduce((s, p) => s + paymentFx(p, inv.fxRate).fxGainInr, 0);
  const received = inv.payments.reduce((s, p) => s + p.inrReceived, 0);
  const tds = inv.payments.reduce((s, p) => s + p.tdsInr, 0);
  const monthRevenue = inv.months.reduce((s, m) => s + m.revenue, 0);
  const servicesTotal = inv.lines.filter((l) => l.kind === "SERVICES" || l.kind === "OTHER").reduce((s, l) => s + l.amount, 0);
  const subtotal = inv.subtotal ?? inv.total;
  const tax = taxOn(subtotal, inv.taxType, inv.taxRate);
  const editable = canEdit && inv.status === "DRAFT";

  const [clients, projects, s, p] = editable
    ? await Promise.all([
        prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, country: true, state: true } }),
        prisma.project.findMany({ orderBy: { code: "desc" }, select: { id: true, code: true, name: true, clientId: true } }),
        getInvoiceSettings(),
        getParams(),
      ])
    : [[], [], null, null];

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/clients/${inv.clientId}`} className="text-brand-fg hover:underline">{inv.client.name}</Link>
            {inv.project && <>· <Link href={`/finance/projects/${inv.project.id}?tab=monthly`} className="text-brand-fg hover:underline">{inv.project.code} {inv.project.name}</Link></>}
            · <StatusBadge status={inv.status} /> · {cur} · {TAX_TYPES[inv.taxType] ?? inv.taxType}
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
        <Stat label="Total" value={money(inv.total, cur, 2)} hint={cur === "INR" ? `incl. GST ${money(inv.taxAmount, cur, 2)}` : `Booked ${inr(inv.total * inv.fxRate)} @ ₹${inv.fxRate}`} accent />
        <Stat label="Settled" value={money(paid, cur, 2)} hint={`${inv.payments.length} payment(s)`} />
        <Stat label="Balance" value={money(isOpen ? balance : 0, cur, 2)} hint={isOpen ? `Due ${date(inv.dueDate)} · ${agingBucket(inv.dueDate)}` : undefined} />
        <Stat label="₹ received" value={inr(received)} hint={tds ? `TDS deducted ${inr(tds)} (claim in the tax return)` : undefined} />
        <Stat label="Realised FX" value={<span className={fxTotal >= 0 ? "text-emerald-700" : "text-red-600"}>{inr(fxTotal)}</span>} hint="Incl. bank charges" />
      </div>

      {canEdit && <div className="mb-6"><StatusActions id={inv.id} status={inv.status} hasPayments={inv.payments.length > 0} isAdmin={canEdit} /></div>}

      {inv.months.length > 0 && Math.abs(servicesTotal - monthRevenue) > 0.01 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Services lines ({money(servicesTotal, cur, 2)}) differ from the linked monthly billing revenue ({money(monthRevenue, cur, 2)}).
        </div>
      )}

      {editable && s && p ? (
        <InvoiceEditor
          id={inv.id}
          clients={clients}
          projects={projects}
          company={{ state: s.state, gstRate: s.gstRate, sac: s.sac }}
          usdRate={p.fxRate}
          initial={{
            clientId: inv.clientId,
            projectId: inv.projectId,
            issueDate: ymd(inv.issueDate),
            dueDate: ymd(inv.dueDate),
            currency: inv.currency,
            fxRate: inv.fxRate,
            taxType: inv.taxType,
            taxRate: inv.taxRate,
            placeOfSupply: inv.placeOfSupply ?? "",
            sac: inv.sac ?? s.sac,
            notes: inv.notes ?? "",
            lines: inv.lines.map((l) => ({ kind: l.kind, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, expenseId: l.expenseId })),
          }}
        />
      ) : (
        <div className="card overflow-x-auto">
          <div className="card-h">
            <div className="card-t">Lines</div>
            <span className="text-xs text-neutral-500">Issued {date(inv.issueDate)} · due {date(inv.dueDate)}{cur !== "INR" && ` · booking rate ₹${inv.fxRate}`}{inv.placeOfSupply && ` · place of supply ${inv.placeOfSupply}`}</span>
          </div>
          <table className="tbl">
            <thead><tr><th>Type</th><th>Description</th><th className="num">Qty / hrs</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}><td className="text-xs">{LINE_KINDS[l.kind] ?? l.kind}</td><td>{l.description}</td><td className="num">{num(l.quantity, 2)}</td><td className="num">{money(l.unitPrice, cur, 2)}</td><td className="num">{money(l.amount, cur, 2)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4}>Subtotal</td><td className="num">{money(subtotal, cur, 2)}</td></tr>
              {inv.taxType === "CGST_SGST" && <tr><td colSpan={4}>CGST {inv.taxRate / 2}% + SGST {inv.taxRate / 2}%</td><td className="num">{money(tax.tax, cur, 2)}</td></tr>}
              {inv.taxType === "IGST" && <tr><td colSpan={4}>IGST {inv.taxRate}%</td><td className="num">{money(tax.tax, cur, 2)}</td></tr>}
              <tr><td colSpan={4}>TOTAL ({cur})</td><td className="num">{money(inv.total, cur, 2)}</td></tr>
            </tfoot>
          </table>
          {inv.notes && <p className="px-5 py-3 text-sm text-neutral-600">{inv.notes}</p>}
        </div>
      )}

      {inv.months.length > 0 && (
        <p className="mt-3 text-sm text-neutral-600">
          Bills monthly record(s):{" "}
          {inv.months.map((m) => (
            <Link key={m.month} href={`/finance/projects/${m.projectId}?tab=monthly&month=${m.month}`} className="mr-2 text-brand-fg hover:underline">{monthLabel(m.month)}</Link>
          ))}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {canEdit && isOpen && <PaymentForm invoiceId={inv.id} balance={balance} fxRate={inv.fxRate} currency={cur} />}
        <div className="card overflow-x-auto">
          <div className="card-h"><div className="card-t">Payments</div></div>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Reference</th><th className="num">Settled ({cur})</th><th className="num">₹ received</th><th className="num">TDS</th><th className="num">Bank charges</th><th className="num">FX gain / loss</th><th /></tr></thead>
            <tbody>
              {inv.payments.map((pay) => {
                const fx = paymentFx(pay, inv.fxRate);
                return (
                  <tr key={pay.id}>
                    <td>{date(pay.date)}</td>
                    <td>{pay.reference ?? "—"}</td>
                    <td className="num">{money(pay.amountUsd, cur, 2)}</td>
                    <td className="num">{inr(pay.inrReceived)}</td>
                    <td className="num">{pay.tdsInr ? inr(pay.tdsInr) : "—"}</td>
                    <td className="num">{inr(pay.bankChargesInr)}</td>
                    <td className={`num ${fx.fxGainInr >= 0 ? "text-emerald-700" : "text-red-600"}`}>{inr(fx.fxGainInr)}</td>
                    <td>{canEdit && <form action={deletePayment.bind(null, pay.id)}><button className="btn-danger btn-sm">Delete</button></form>}</td>
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
