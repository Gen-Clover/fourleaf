"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { invoiceTotal, lineAmount } from "../../lib/finance";
import { defaultTax, TAX_TYPES, taxOn } from "../../lib/tax";
import { LINE_KINDS, money } from "@genclover/ui/format";
import { saveInvoice } from "./actions";

export type EditorLine = { kind: string; description: string; quantity: number; unitPrice: number; expenseId: string | null };
export type EditorInvoice = {
  clientId: string;
  projectId: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  fxRate: number;
  taxType: string;
  taxRate: number;
  placeOfSupply: string;
  sac: string;
  notes: string;
  lines: EditorLine[];
};
type ClientOpt = { id: string; name: string; currency: string; country: string | null; state: string | null };

/** Draft invoice: client, dates, currency, GST treatment (from the client, changeable), and lines. */
export default function InvoiceEditor({
  id,
  initial,
  clients,
  projects,
  company,
  usdRate,
}: {
  id: string | null;
  initial: EditorInvoice;
  clients: ClientOpt[];
  projects: { id: string; code: string; name: string; clientId: string }[];
  company: { state: string; gstRate: number; sac: string };
  usdRate: number;
}) {
  const router = useRouter();
  const [inv, setInv] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const setLine = (i: number, patch: Partial<EditorLine>) => setInv({ ...inv, lines: inv.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const subtotal = invoiceTotal(inv.lines);
  const tax = taxOn(subtotal, inv.taxType, inv.taxRate);
  const total = subtotal + tax.tax;
  const inr = inv.currency === "INR";

  const pickClient = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return setInv({ ...inv, clientId, projectId: null });
    const t = defaultTax(c, company);
    setInv({ ...inv, clientId, projectId: null, currency: c.currency, fxRate: c.currency === "INR" ? 1 : usdRate, taxType: t.taxType, taxRate: t.taxRate, placeOfSupply: t.placeOfSupply });
  };
  const save = () =>
    start(async () => {
      const res = await saveInvoice(id, { ...inv, notes: inv.notes || null });
      setMsg(res ?? null);
      if (res?.ok && !id && res.id) router.push(`/invoices/${res.id}`);
      else if (res?.ok) router.refresh();
    });

  return (
    <div className="card">
      <div className="card-h"><div className="card-t">{id ? "Edit draft" : "New invoice"}</div></div>
      <div className="grid gap-4 p-5 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="label">Client *</label>
          <select className="input" value={inv.clientId} onChange={(e) => pickClient(e.target.value)}>
            <option value="">Select…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Project</label>
          <select className="input" value={inv.projectId ?? ""} onChange={(e) => setInv({ ...inv, projectId: e.target.value || null })}>
            <option value="">— none —</option>
            {projects.filter((p) => p.clientId === inv.clientId).map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
        </div>
        <div><label className="label">Issue date</label><input className="input" type="date" value={inv.issueDate} onChange={(e) => setInv({ ...inv, issueDate: e.target.value })} /></div>
        <div><label className="label">Due date</label><input className="input" type="date" value={inv.dueDate} onChange={(e) => setInv({ ...inv, dueDate: e.target.value })} /></div>
        <div>
          <label className="label">Currency</label>
          <select className="input" value={inv.currency} onChange={(e) => setInv({ ...inv, currency: e.target.value, fxRate: e.target.value === "INR" ? 1 : usdRate })}>
            <option value="USD">USD</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div>
          <label className="label">Booking rate (₹ per $)</label>
          <input className="input" type="number" step="any" value={inv.fxRate} disabled={inr} onChange={(e) => setInv({ ...inv, fxRate: Number(e.target.value) || 0 })} />
        </div>
        <div className="md:col-span-2">
          <label className="label">GST</label>
          <select className="input" value={inv.taxType} onChange={(e) => setInv({ ...inv, taxType: e.target.value, taxRate: ["IGST", "CGST_SGST"].includes(e.target.value) ? inv.taxRate || company.gstRate : 0 })}>
            {Object.entries(TAX_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">GST rate %</label>
          <input className="input" type="number" step="any" value={inv.taxRate} disabled={!["IGST", "CGST_SGST"].includes(inv.taxType)} onChange={(e) => setInv({ ...inv, taxRate: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="label">Place of supply</label>
          <input className="input" value={inv.placeOfSupply} onChange={(e) => setInv({ ...inv, placeOfSupply: e.target.value })} />
        </div>
        <div>
          <label className="label">SAC</label>
          <input className="input" value={inv.sac} onChange={(e) => setInv({ ...inv, sac: e.target.value })} />
        </div>
        <div className="md:col-span-5">
          <label className="label">Notes (printed on the invoice)</label>
          <input className="input" value={inv.notes} onChange={(e) => setInv({ ...inv, notes: e.target.value })} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Type</th><th>Description</th><th>Qty / hrs</th><th>Unit price ({inv.currency})</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="input-sm" value={l.kind} disabled={!!l.expenseId} onChange={(e) => setLine(i, { kind: e.target.value })}>
                    {Object.entries(LINE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td><input className="input-sm w-full min-w-72" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                <td><input className="input-sm w-24" type="number" step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })} /></td>
                <td><input className="input-sm w-28" type="number" step="any" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) || 0 })} /></td>
                <td className="num">{money(lineAmount(l), inv.currency, 2)}</td>
                <td><button type="button" className="btn-danger btn-sm" onClick={() => setInv({ ...inv, lines: inv.lines.filter((_, j) => j !== i) })}>✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4}>Subtotal</td><td className="num">{money(subtotal, inv.currency, 2)}</td><td /></tr>
            {inv.taxType === "CGST_SGST" && (
              <>
                <tr><td colSpan={4}>CGST {inv.taxRate / 2}%</td><td className="num">{money(tax.cgst, inv.currency, 2)}</td><td /></tr>
                <tr><td colSpan={4}>SGST {inv.taxRate / 2}%</td><td className="num">{money(tax.sgst, inv.currency, 2)}</td><td /></tr>
              </>
            )}
            {inv.taxType === "IGST" && <tr><td colSpan={4}>IGST {inv.taxRate}%</td><td className="num">{money(tax.igst, inv.currency, 2)}</td><td /></tr>}
            <tr>
              <td colSpan={4}>TOTAL ({inv.currency}){!inr && ` · ≈ ₹${Math.round(total * inv.fxRate).toLocaleString("en-IN")} at the booking rate`}</td>
              <td className="num font-semibold">{money(total, inv.currency, 2)}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setInv({ ...inv, lines: [...inv.lines, { kind: "SERVICES", description: "", quantity: 1, unitPrice: 0, expenseId: null }] })}>+ Add line</button>
        <button type="button" className="btn-primary" disabled={pending || !inv.clientId} onClick={save}>{pending ? "Saving…" : id ? "Save draft" : "Create draft"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
      </div>
    </div>
  );
}
