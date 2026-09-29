"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { invoiceTotal, lineAmount } from "../../lib/finance";
import { LINE_KINDS, usd } from "@genclover/ui/format";
import { saveInvoice } from "./actions";

export type EditorLine = { kind: string; description: string; quantity: number; unitPrice: number; expenseId: string | null };
export type EditorInvoice = { clientId: string; projectId: string | null; issueDate: string; dueDate: string; fxRate: number; notes: string; lines: EditorLine[] };

export default function InvoiceEditor({
  id,
  initial,
  clients,
  projects,
}: {
  id: string | null;
  initial: EditorInvoice;
  clients: { id: string; name: string }[];
  projects: { id: string; code: string; name: string; clientId: string }[];
}) {
  const router = useRouter();
  const [inv, setInv] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const setLine = (i: number, patch: Partial<EditorLine>) => setInv({ ...inv, lines: inv.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const total = invoiceTotal(inv.lines);

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
          <select className="input" value={inv.clientId} onChange={(e) => setInv({ ...inv, clientId: e.target.value, projectId: null })}>
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
          <label className="label">Booking FX (₹ per $)</label>
          <input className="input" type="number" step="any" value={inv.fxRate} onChange={(e) => setInv({ ...inv, fxRate: Number(e.target.value) || 0 })} />
        </div>
        <div className="md:col-span-5">
          <label className="label">Notes (printed on the invoice)</label>
          <input className="input" value={inv.notes} onChange={(e) => setInv({ ...inv, notes: e.target.value })} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Type</th><th>Description</th><th>Qty / hrs</th><th>Unit price ($)</th><th className="num">Amount</th><th></th></tr></thead>
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
                <td className="num">{usd(lineAmount(l))}</td>
                <td><button className="btn-danger btn-sm" onClick={() => setInv({ ...inv, lines: inv.lines.filter((_, j) => j !== i) })}>✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4}>TOTAL (USD) · ≈ ₹{Math.round(total * inv.fxRate).toLocaleString("en-IN")} at booking FX</td><td className="num">{usd(total)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
        <button className="btn-secondary btn-sm" onClick={() => setInv({ ...inv, lines: [...inv.lines, { kind: "SERVICES", description: "", quantity: 1, unitPrice: 0, expenseId: null }] })}>+ Add line</button>
        <button className="btn-primary" disabled={pending || !inv.clientId} onClick={save}>{pending ? "Saving…" : id ? "Save draft" : "Create draft"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
      </div>
    </div>
  );
}
