import { notFound } from "next/navigation";
import { requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getInvoiceSettings } from "../../../../../lib/settings";
import { paidUsd } from "../../../../../lib/finance";
import { taxOn } from "../../../../../lib/tax";
import { date, money, num } from "@genclover/ui/format";
import PrintButton from "../../../projects/[id]/quote/PrintButton";

/**
 * The client-facing invoice. Indian clients get a GST tax invoice (CGST + SGST or IGST); overseas clients an
 * export invoice under LUT. Never shows cost, allocation or FX internals.
 */
export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { client: true, project: { select: { code: true, name: true } }, lines: { orderBy: { sortOrder: "asc" } }, payments: true } });
  if (!inv) notFound();
  const s = await getInvoiceSettings();
  const cur = inv.currency;
  const m = (n: number) => money(n, cur, 2);
  const paid = paidUsd(inv.payments);
  const draft = inv.status === "DRAFT";
  const exportInvoice = inv.taxType === "EXPORT_LUT" || inv.taxType === "NONE";
  const subtotal = inv.subtotal ?? inv.total;
  const tax = taxOn(subtotal, inv.taxType, inv.taxRate);

  return (
    <div className="mx-auto max-w-4xl bg-surface p-10 text-sm print:p-0">
      {draft && <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-2 text-center text-xs font-semibold text-amber-800">DRAFT — not a valid tax invoice until issued</div>}
      {inv.status === "VOID" && <div className="mb-4 rounded border border-red-300 bg-red-50 p-2 text-center text-xs font-semibold text-red-800">VOID — this invoice has been cancelled</div>}
      <div className="mb-6 flex items-start justify-between border-b-4 border-brand pb-4">
        <div>
          <div className="text-2xl font-bold text-ink">{s.legalName}</div>
          {s.address && <div className="max-w-sm whitespace-pre-line text-neutral-600">{s.address}</div>}
          {s.gstin && <div className="text-xs">GSTIN: {s.gstin}</div>}
          {s.pan && <div className="text-xs">PAN: {s.pan}</div>}
          {s.state && <div className="text-xs">State: {s.state}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{exportInvoice ? "Tax Invoice — Export of Services" : "Tax Invoice"}</div>
          <div className="font-mono">{draft ? "DRAFT" : inv.number}</div>
          <div className="text-xs text-neutral-600">Date: {date(inv.issueDate)}</div>
          <div className="text-xs text-neutral-600">Due: {date(inv.dueDate)}</div>
          <PrintButton />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-500">Bill to</div>
          <div className="font-semibold">{inv.client.legalName || inv.client.name}</div>
          {inv.client.contactName && <div>Attn: {inv.client.contactName}</div>}
          {inv.client.billingAddress && <div className="whitespace-pre-line text-neutral-600">{inv.client.billingAddress}</div>}
          <div className="text-neutral-600">{[inv.client.city, inv.client.state, inv.client.country].filter(Boolean).join(", ")}</div>
          {inv.client.gstin && <div className="text-xs">GSTIN: {inv.client.gstin}</div>}
        </div>
        <div className="text-xs text-neutral-600">
          <div>Place of supply: {inv.placeOfSupply || (exportInvoice ? `Outside India (${inv.client.country ?? ""})` : inv.client.state || "—")}</div>
          <div>SAC: {inv.sac || s.sac}</div>
          <div>Currency: {cur}</div>
          <div>Client ID: <span className="font-mono">{inv.client.number}</span> ({inv.client.code})</div>
          {inv.project && <div>Project: <span className="font-mono">{inv.project.code}</span> {inv.project.name}</div>}
        </div>
      </div>

      <table className="tbl mb-6">
        <thead><tr><th>#</th><th>Description</th><th className="num">Qty / hrs</th><th className="num">Rate ({cur})</th><th className="num">Amount ({cur})</th></tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={l.id}><td>{i + 1}</td><td>{l.description}</td><td className="num">{num(l.quantity, 2)}</td><td className="num">{m(l.unitPrice)}</td><td className="num">{m(l.amount)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 ml-auto w-80 space-y-1">
        <div className="flex justify-between"><span>Taxable value</span><span>{m(subtotal)}</span></div>
        {inv.taxType === "CGST_SGST" && (
          <>
            <div className="flex justify-between"><span>CGST {inv.taxRate / 2}%</span><span>{m(tax.cgst)}</span></div>
            <div className="flex justify-between"><span>SGST {inv.taxRate / 2}%</span><span>{m(tax.sgst)}</span></div>
          </>
        )}
        {inv.taxType === "IGST" && <div className="flex justify-between"><span>IGST {inv.taxRate}%</span><span>{m(tax.igst)}</span></div>}
        {exportInvoice && <div className="flex justify-between"><span>IGST (0% — export under LUT)</span><span>{m(0)}</span></div>}
        <div className="flex justify-between border-t-2 border-ink pt-2 text-lg font-semibold"><span>Total due</span><span className="text-brand-fg">{m(inv.total)}</span></div>
        {paid > 0 && <div className="flex justify-between text-neutral-600"><span>Paid</span><span>−{m(paid)}</span></div>}
        {paid > 0 && <div className="flex justify-between font-semibold"><span>Balance</span><span>{m(inv.total - paid)}</span></div>}
      </div>

      {inv.notes && <p className="mb-4 text-neutral-700">{inv.notes}</p>}
      <div className="space-y-2 border-t pt-4 text-xs text-neutral-600">
        {exportInvoice && <p>Supply meant for export under LUT{s.lut ? ` (ARN ${s.lut})` : ""} without payment of integrated tax.</p>}
        {s.bank && <p className="whitespace-pre-line"><b>Remit to:</b> {s.bank}</p>}
        <p>Please quote invoice {draft ? "number" : inv.number} with your payment. Third-party costs are billed at cost.</p>
      </div>
    </div>
  );
}
