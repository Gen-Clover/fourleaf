"use client";

import { useState, useTransition } from "react";
import { runPayroll } from "./actions";

export default function PayrollRun({ defaultMonth }: { defaultMonth: string }) {
  const [month, setMonth] = useState(defaultMonth);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label">Payroll month</label>
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => setMsg((await runPayroll(month)) ?? null))}>
        {pending ? "Running…" : "Run payroll → expenses"}
      </button>
      <p className="max-w-md text-xs text-neutral-500">Creates one unpaid expense per active person: monthly cost for employees, logged hours × rate for hourly contractors. Safe to re-run.</p>
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
    </div>
  );
}
