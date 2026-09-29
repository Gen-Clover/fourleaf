"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fundMovement } from "./actions";

export default function MovementForm({ funds, today }: { funds: { key: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [f, setF] = useState({ type: "OPENING", fromKey: "", toKey: "", amountInr: "", date: today, note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await fundMovement({ ...f, amountInr: Number(f.amountInr) || 0, fromKey: f.fromKey || undefined });
      setMsg(res ?? null);
      if (res?.ok) {
        setF({ ...f, amountInr: "", note: "" });
        router.refresh();
      }
    });
  const select = (k: "fromKey" | "toKey", label: string) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        <option value="">Select…</option>
        {funds.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
      </select>
    </div>
  );
  return (
    <div className="card p-5">
      <div className="card-t mb-3">Record a fund movement</div>
      <div className="grid gap-3 md:grid-cols-6">
        <div>
          <label className="label">Type</label>
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="OPENING">Opening balance</option>
            <option value="TRANSFER">Transfer between funds</option>
            <option value="ADJUSTMENT">Adjustment (±)</option>
          </select>
        </div>
        {f.type === "TRANSFER" && select("fromKey", "From fund")}
        {select("toKey", f.type === "TRANSFER" ? "To fund" : "Fund")}
        <div><label className="label">Amount ₹</label><input className="input" type="number" step="any" value={f.amountInr} onChange={(e) => setF({ ...f, amountInr: e.target.value })} /></div>
        <div><label className="label">Date</label><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className={f.type === "TRANSFER" ? "md:col-span-6" : "md:col-span-2"}><label className="label">Note (why)</label><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={f.type === "TRANSFER" ? "e.g. Emergency withdrawal to cover payroll" : "e.g. Bank balance on 1 Oct 2026"} /></div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Record"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
      </div>
      <p className="mt-2 text-xs text-neutral-500">Start with opening balances that add up to your actual bank balance. From then on, receipts are allocated automatically and paid expenses are debited from their category&apos;s fund.</p>
    </div>
  );
}
