import { notFound } from "next/navigation";
import { requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getInvoiceSettings } from "../../../../../lib/settings";
import { paidUsd } from "../../../../../lib/finance";
import { date, num, usd } from "@genclover/ui/format";
import PrintButton from "../../../projects/[id]/quote/PrintButton";

// Client-facing export invoice (USD). Never shows cost, allocation or FX internals.
export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { client: true, project: { select: { code: true, name: true } }, lines: { orderBy: { sortOrder: "asc" } }, payments: true } });
  if (!inv) notFound();
  const s = await getInvoiceSettings();
  const paid = paidUsd(inv.payments);
  const draft = inv.status === "DRAFT";

  return (
    <div className="mx-auto max-w-4xl bg-surface p-10 text-sm print:p-0">
      {draft && <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-2 text-center text-xs font-semibold text-amber-800">DRAFT — not a valid tax invoice until issued</div>}
      {inv.status === "VOID" && <div className="mb-4 rounded border border-red-300 bg-red-50 p-2 text-center text-xs font-semibold text-red-800">VOID — this invoice has been cancelled</div>}
      <div className="mb-6 flex items-start justify-between border-b-4 border-brand pb-4">
        <div>
          <div className="text-2xl font-bold text-ink">{s.legalName}</div>
          {s.address && <div className="max-w-sm whitespace-pre-line text-neutral-600">{s.address}</div>}
          {s.gstin && <div className="text-xs">GSTIN: {s.gstin}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">Tax Invoice — Export of Services</div>
          <div className="font-mono">{draft ? "DRAFT" : inv.number}</div>
          <div className="text-xs text-neutral-600">Date: {date(inv.issueDate)}</div>
          <div className="text-xs text-neutral-600">Due: {date(inv.dueDate)}</div>
          <PrintButton />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-500">Bill to</div>
          <div className="font-semibold">{inv.client.name}</div>
          {inv.client.contactName && <div>Attn: {inv.client.contactName}</div>}
          {inv.client.billingAddress && <div className="whitespace-pre-line text-neutral-600">{inv.client.billingAddress}</div>}
          <div className="text-neutral-600">{[inv.client.city, inv.client.country].filter(Boolean).join(", ")}</div>
        </div>
        <div className="text-xs text-neutral-600">
          <div>Place of supply: Outside India ({inv.client.country ?? "USA"})</div>
          <div>SAC: {s.sac}</div>
          <div>Currency: {inv.currency}</div>
          <div>Client ID: <span className="font-mono">{inv.client.number}</span> ({inv.client.code})</div>
          {inv.project && <div>Project: <span className="font-mono">{inv.project.code}</span> {inv.project.name}</div>}
        </div>
      </div>

      <table className="tbl mb-6">
        <thead><tr><th>#</th><th>Description</th><th className="num">Qty / hrs</th><th className="num">Rate (US$)</th><th className="num">Amount (US$)</th></tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={l.id}><td>{i + 1}</td><td>{l.description}</td><td className="num">{num(l.quantity, 2)}</td><td className="num">{usd(l.unitPrice)}</td><td className="num">{usd(l.amount)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 ml-auto w-80 space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{usd(inv.total)}</span></div>
        <div className="flex justify-between"><span>IGST (0% — export under LUT)</span><span>{usd(0)}</span></div>
        <div className="flex justify-between border-t-2 border-ink pt-2 text-lg font-semibold"><span>Total due</span><span className="text-brand-fg">{usd(inv.total)}</span></div>
        {paid > 0 && <div className="flex justify-between text-neutral-600"><span>Paid</span><span>−{usd(paid)}</span></div>}
        {paid > 0 && <div className="flex justify-between font-semibold"><span>Balance</span><span>{usd(inv.total - paid)}</span></div>}
      </div>

      {inv.notes && <p className="mb-4 text-neutral-700">{inv.notes}</p>}
      <div className="space-y-2 border-t pt-4 text-xs text-neutral-600">
        <p>Supply meant for export under LUT{s.lut ? ` (ARN ${s.lut})` : ""} without payment of integrated tax.</p>
        {s.bank && <p className="whitespace-pre-line"><b>Remit to:</b> {s.bank}</p>}
        <p>Please quote invoice {draft ? "number" : inv.number} with your payment. Third-party costs are billed at cost.</p>
      </div>
    </div>
  );
}
