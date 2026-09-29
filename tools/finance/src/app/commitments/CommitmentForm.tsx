"use client";

import Link from "next/link";
import { useActionState } from "react";
import { COMMITMENT_KINDS, FREQUENCIES } from "@genclover/ui/format";
import { saveCommitment } from "./actions";

export type CommitmentDto = { id: string; name: string; kind: string; fundKey: string; amountInr: number; frequency: string; nextDueDate: string; endDate: string | null; essential: boolean; active: boolean; notes: string | null };

export default function CommitmentForm({ c, funds, today }: { c: CommitmentDto | null; funds: { key: string; name: string }[]; today: string }) {
  const [state, action, pending] = useActionState(saveCommitment.bind(null, c?.id ?? null), undefined);
  return (
    <form action={action} className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div className="card-t">{c ? `Edit: ${c.name}` : "Add commitment"}</div>
        {c && <Link href="/commitments" className="text-sm text-neutral-500 hover:underline">Cancel</Link>}
      </div>
      <div className="grid gap-4 md:grid-cols-6">
        <div className="md:col-span-2"><label className="label">Name *</label><input className="input" name="name" defaultValue={c?.name ?? ""} placeholder="e.g. Office rent, GST/TDS, Microsoft 365" required /></div>
        <div>
          <label className="label">Type</label>
          <select className="input" name="kind" defaultValue={c?.kind ?? "OTHER"}>
            {Object.entries(COMMITMENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Paid from fund *</label>
          <select className="input" name="fundKey" defaultValue={c?.fundKey ?? ""} required>
            <option value="">Select…</option>
            {funds.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
          </select>
        </div>
        <div><label className="label">Amount ₹ *</label><input className="input" name="amountInr" type="number" step="any" min={0} defaultValue={c?.amountInr ?? ""} required /></div>
        <div>
          <label className="label">Frequency</label>
          <select className="input" name="frequency" defaultValue={c?.frequency ?? "MONTHLY"}>
            {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">Next due *</label><input className="input" name="nextDueDate" type="date" defaultValue={c?.nextDueDate ?? today} required /></div>
        <div><label className="label">Ends (optional)</label><input className="input" name="endDate" type="date" defaultValue={c?.endDate ?? ""} /></div>
        <div className="md:col-span-3"><label className="label">Notes</label><input className="input" name="notes" defaultValue={c?.notes ?? ""} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="essential" defaultChecked={c?.essential ?? true} /> Essential (counts toward monthly burn & runway)</label>
        {c && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c.active} /> Active</label>}
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : c ? "Save" : "Add commitment"}</button>
        {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
