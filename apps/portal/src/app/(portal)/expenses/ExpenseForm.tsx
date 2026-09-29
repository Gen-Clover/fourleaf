"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveExpense } from "./actions";

export type ExpenseDto = {
  id: string;
  date: string;
  vendor: string;
  description: string | null;
  categoryId: string;
  currency: string;
  amount: number;
  fxRate: number;
  gstInr: number;
  projectId: string | null;
  paidOn: string | null;
  reference: string | null;
};

export default function ExpenseForm({
  expense,
  categories,
  projects,
  defaultFx,
  today,
}: {
  expense: ExpenseDto | null;
  categories: { id: string; name: string; bucket: string }[];
  projects: { id: string; label: string }[];
  defaultFx: number;
  today: string;
}) {
  const [state, action, pending] = useActionState(saveExpense.bind(null, expense?.id ?? null), undefined);
  const [currency, setCurrency] = useState(expense?.currency ?? "INR");
  const [paid, setPaid] = useState(expense ? !!expense.paidOn : true);
  const [catId, setCatId] = useState(expense?.categoryId ?? "");
  const isPassThrough = categories.find((c) => c.id === catId)?.bucket === "Pass-through";

  return (
    <form action={action} className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div className="card-t">{expense ? "Edit expense" : "Add expense"}</div>
        {expense && <Link href="/expenses" className="text-sm text-neutral-500 hover:underline">Cancel</Link>}
      </div>
      <div className="grid gap-4 md:grid-cols-6">
        <div><label className="label">Date *</label><input className="input" type="date" name="date" defaultValue={expense?.date ?? today} required /></div>
        <div className="md:col-span-2"><label className="label">Vendor / payee *</label><input className="input" name="vendor" defaultValue={expense?.vendor ?? ""} required /></div>
        <div className="md:col-span-3">
          <label className="label">Category → bucket *</label>
          <select className="input" name="categoryId" value={catId} onChange={(e) => setCatId(e.target.value)} required>
            <option value="">Select…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} → {c.bucket}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="INR">₹ INR</option><option value="USD">$ USD</option>
          </select>
        </div>
        <div><label className="label">Amount (excl. GST) *</label><input className="input" type="number" step="any" min={0} name="amount" defaultValue={expense?.amount ?? ""} required /></div>
        <div className={currency === "USD" ? "" : "hidden"}><label className="label">FX ₹ per $</label><input className="input" type="number" step="any" name="fxRate" defaultValue={expense && expense.currency === "USD" ? expense.fxRate : defaultFx} /></div>
        <div><label className="label">Input GST ₹</label><input className="input" type="number" step="any" min={0} name="gstInr" defaultValue={expense?.gstInr ?? 0} /></div>
        <div className="md:col-span-2">
          <label className="label">Project {isPassThrough ? "* (billed to this client)" : "(optional, for project cost)"}</label>
          <select className="input" name="projectId" defaultValue={expense?.projectId ?? ""}>
            <option value="">— company overhead —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-3"><label className="label">Description</label><input className="input" name="description" defaultValue={expense?.description ?? ""} /></div>
        <div><label className="label">Reference / bill #</label><input className="input" name="reference" defaultValue={expense?.reference ?? ""} /></div>
        <div className="md:col-span-2">
          <label className="label flex items-center gap-2"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid on</label>
          {paid ? <input className="input" type="date" name="paidOn" defaultValue={expense?.paidOn ?? today} /> : <><input className="input" disabled value="Unpaid (payable)" /><input type="hidden" name="paidOn" value="" /></>}
        </div>
      </div>
      {isPassThrough && <p className="text-xs text-amber-700">Pass-through: excluded from the 65/10/25 budgets and added at cost to the project&apos;s next invoice.</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : expense ? "Save changes" : "Add expense"}</button>
        {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
