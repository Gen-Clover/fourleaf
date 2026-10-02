"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { money } from "@genclover/ui/format";
import { createInvoiceFromMilestones, saveMilestoneAmounts } from "../../invoices/actions";

type Row = { id: string; title: string; status: string; dueDate: string | null; acceptanceRef: string | null; billingAmount: number | null; invoice: { id: string; number: string; status: string } | null };

/**
 * Fixed-price billing: each milestone's amount, and invoices for the ones delivered. Advances are milestones too
 * (e.g. "Advance 50%" with its amount, billed when the SOW is signed).
 */
export default function MilestoneBilling({ projectId, rows, currency, canEdit, contractValue }: { projectId: string; rows: Row[]; currency: string; canEdit: boolean; contractValue: number | null }) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.id, r.billingAmount == null ? "" : String(r.billingAmount)])));
  const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const total = rows.reduce((s, r) => s + (Number(amounts[r.id]) || 0), 0);
  const billed = rows.filter((r) => r.invoice && r.invoice.status !== "VOID").reduce((s, r) => s + (r.billingAmount ?? 0), 0);
  return (
    <div className="card overflow-x-auto">
      <div className="card-h">
        <div className="card-t">Milestone billing (fixed price)</div>
        <span className="text-xs text-neutral-500">
          Planned {money(total, currency)}{contractValue != null && ` of SOW value ${money(contractValue, currency)}`} · billed {money(billed, currency)}
        </span>
      </div>
      <table className="tbl">
        <thead><tr>{canEdit && <th />}<th>Milestone</th><th>Status</th><th>Accepted</th><th className="num">Amount ({currency})</th><th>Invoice</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {canEdit && (
                <td>
                  <input type="checkbox" disabled={!!r.invoice || !Number(amounts[r.id])} checked={pick.includes(r.id)} onChange={(e) => setPick(e.target.checked ? [...pick, r.id] : pick.filter((x) => x !== r.id))} aria-label={`Bill ${r.title}`} />
                </td>
              )}
              <td>{r.title}{r.dueDate && <div className="text-xs text-neutral-500">due {r.dueDate}</div>}</td>
              <td className="text-xs">{r.status.replace("_", " ").toLowerCase()}</td>
              <td className="font-mono text-xs">{r.acceptanceRef ?? "—"}</td>
              <td className="num"><input className="input-sm w-32 text-right" type="number" min={0} step="any" value={amounts[r.id]} disabled={!canEdit || !!r.invoice} onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })} /></td>
              <td>{r.invoice ? <Link className="font-mono text-xs text-brand-fg hover:underline" href={`/invoices/${r.invoice.id}`}>{r.invoice.number}</Link> : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">No milestones yet. Delivery adds them on the project page (Milestones tab); add an &quot;Advance&quot; milestone for the upfront payment.</td></tr>}
        </tbody>
      </table>
      {canEdit && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveMilestoneAmounts(projectId, rows.map((x) => ({ id: x.id, billingAmount: amounts[x.id] === "" ? null : Number(amounts[x.id]) })));
                setMsg(r ?? null);
                if (r?.ok) router.refresh();
              })
            }
          >
            Save amounts
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !pick.length}
            onClick={() =>
              start(async () => {
                const r = await createInvoiceFromMilestones(projectId, pick);
                setMsg(r ?? null);
                if (r?.ok && r.id) router.push(`/invoices/${r.id}`);
              })
            }
          >
            Invoice {pick.length || ""} selected →
          </button>
          <span className="text-xs text-neutral-500">Save amounts first; then tick delivered (or accepted) milestones to invoice them.</span>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
    </div>
  );
}
