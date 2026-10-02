"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PAY_MODELS } from "../../lib/pay";
import { savePerson } from "../actions";

export type PersonInput = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  department: string;
  managerName: string;
  type: string;
  roleId: string;
  stdHoursPerMonth: string;
  startDate: string;
  endDate: string;
  pan: string;
  gstin: string;
  notes: string;
  active: boolean;
  // pay (only sent to people with cost.view)
  payModel: string;
  costInr: string;
  gstRegistered: boolean;
  tdsRatePct: string;
  nextReviewDate: string;
};

/** Profile for everyone with people access; the pay section only for roles that see pay. */
export default function PersonForm({ initial, roles, showPay, canPay, readOnly }: { initial: PersonInput; roles: { id: string; name: string }[]; showPay: boolean; canPay: boolean; readOnly?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof PersonInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const input = (k: keyof PersonInput, label: string, type = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" type={type} value={f[k] as string} onChange={set(k)} disabled={readOnly} {...extra} />
    </label>
  );
  const pm = PAY_MODELS[f.payModel];
  return (
    <div className="card space-y-5 p-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2">{input("name", "Name *")}</div>
        {input("email", "Email (their login email, for timesheets)", "email")}
        {input("phone", "Phone")}
        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, payModel: e.target.value === "EMPLOYEE" ? "SALARY" : f.payModel === "SALARY" ? "HOURLY" : f.payModel })} disabled={readOnly}>
            <option value="EMPLOYEE">Employee (on payroll)</option>
            <option value="CONTRACTOR">Contractor</option>
          </select>
        </label>
        {input("title", "Title", "text", { placeholder: "Senior Full-Stack Developer" })}
        {input("department", "Department / practice")}
        {input("managerName", "Reports to")}
        <label className="block md:col-span-2">
          <span className="label">Rate-card role (for coverage and quotes)</span>
          <select className="input" value={f.roleId} onChange={set("roleId")} disabled={readOnly}>
            <option value="">—</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        {input("stdHoursPerMonth", "Capacity (hours / month)", "number", { min: 1 })}
        {input("pan", "PAN")}
        {input("startDate", "Start date", "date")}
        {input("endDate", "End date", "date")}
        {f.type === "CONTRACTOR" && input("gstin", "GSTIN (if registered)")}
      </div>

      {showPay && (
        <fieldset className="grid gap-4 rounded-lg border border-neutral-200 p-4 md:grid-cols-4">
          <legend className="px-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Pay (owners, CFO and HR only)</legend>
          <label className="block md:col-span-2">
            <span className="label">Pay model</span>
            <select className="input" value={f.payModel} onChange={set("payModel")} disabled={readOnly || !canPay}>
              {Object.entries(PAY_MODELS).filter(([k]) => (f.type === "EMPLOYEE" ? k === "SALARY" || k === "HOURLY" : k !== "SALARY")).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <span className="mt-1 block text-xs text-neutral-500">{pm?.hint}</span>
          </label>
          {f.payModel !== "FIXED_FEE" && input("costInr", pm?.costLabel ?? "Amount ₹", "number", { min: 0, disabled: readOnly || !canPay })}
          {input("nextReviewDate", "Next pay review", "date", { disabled: readOnly || !canPay })}
          {f.type === "CONTRACTOR" && (
            <>
              {input("tdsRatePct", "TDS % (blank = default)", "number", { min: 0, max: 30, step: "any", disabled: readOnly || !canPay })}
              <label className="flex items-center gap-2 text-sm md:pt-6">
                <input type="checkbox" checked={f.gstRegistered} disabled={readOnly || !canPay} onChange={(e) => setF({ ...f, gstRegistered: e.target.checked })} /> Charges GST (18%) on invoices
              </label>
            </>
          )}
          <p className="text-xs text-neutral-500 md:col-span-4">
            Salary and retainer: the monthly amount (fully loaded). Hourly: ₹ per approved hour, on any project. Fixed fee: set on each work order. The cost per hour is saved on
            each timesheet entry, so later changes never rewrite history.
          </p>
        </fieldset>
      )}

      <label className="block">
        <span className="label">Notes</span>
        <textarea className="input" rows={2} value={f.notes} onChange={set("notes")} disabled={readOnly} />
      </label>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-4">
          {f.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
            </label>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const payload = showPay && canPay ? f : { ...f, payModel: undefined, costInr: undefined, gstRegistered: undefined, tdsRatePct: undefined, nextReviewDate: undefined };
                const r = await savePerson(f.id ?? null, payload);
                setMsg(r ?? null);
                if (r?.ok && r.id) {
                  if (!f.id) router.push(`/people/${r.id}`);
                  else router.refresh();
                }
              })
            }
          >
            {pending ? "Saving…" : f.id ? "Save" : "Add person"}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
    </div>
  );
}
