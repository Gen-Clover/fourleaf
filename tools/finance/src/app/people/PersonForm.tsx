"use client";

import { useActionState } from "react";
import { toInputDate } from "@genclover/ui/format";
import { savePerson } from "./actions";

export type PersonDto = {
  id?: string;
  name?: string;
  email?: string | null;
  title?: string | null;
  type?: string;
  roleId?: string | null;
  costBasis?: string;
  costInr?: number;
  stdHoursPerMonth?: number;
  startDate?: string | null;
  endDate?: string | null;
  nextReviewDate?: string | null;
  active?: boolean;
  notes?: string | null;
};

export default function PersonForm({ person, roles }: { person?: PersonDto; roles: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(savePerson, undefined);
  const d = (s?: string | null) => (s ? toInputDate(new Date(s)) : "");
  return (
    <form action={action} className="card space-y-4 p-5">
      {person?.id && <input type="hidden" name="id" value={person.id} />}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2"><label className="label">Name *</label><input className="input" name="name" defaultValue={person?.name ?? ""} required /></div>
        <div><label className="label">Email</label><input className="input" name="email" type="email" defaultValue={person?.email ?? ""} /></div>
        <div><label className="label">Title</label><input className="input" name="title" defaultValue={person?.title ?? ""} placeholder="e.g. Senior Full-Stack" /></div>
        <div>
          <label className="label">Type</label>
          <select className="input" name="type" defaultValue={person?.type ?? "EMPLOYEE"}>
            <option value="EMPLOYEE">Employee</option><option value="CONTRACTOR">Contractor</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Rate-card role (for coverage comparisons)</label>
          <select className="input" name="roleId" defaultValue={person?.roleId ?? ""}>
            <option value="">—</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div><label className="label">Standard hours / month</label><input className="input" name="stdHoursPerMonth" type="number" step="any" defaultValue={person?.stdHoursPerMonth ?? 160} /></div>
        <div>
          <label className="label">Cost basis</label>
          <select className="input" name="costBasis" defaultValue={person?.costBasis ?? "MONTHLY"}>
            <option value="MONTHLY">₹ per month (CTC ÷ 12, loaded)</option><option value="HOURLY">₹ per hour</option>
          </select>
        </div>
        <div><label className="label">Cost ₹</label><input className="input" name="costInr" type="number" step="any" min={0} defaultValue={person?.costInr ?? 0} /></div>
        <div><label className="label">Start date</label><input className="input" name="startDate" type="date" defaultValue={d(person?.startDate)} /></div>
        <div><label className="label">End date</label><input className="input" name="endDate" type="date" defaultValue={d(person?.endDate)} /></div>
        <div><label className="label">Next salary review</label><input className="input" name="nextReviewDate" type="date" defaultValue={d(person?.nextReviewDate)} /></div>
      </div>
      <div><label className="label">Notes</label><textarea className="input" name="notes" rows={2} defaultValue={person?.notes ?? ""} /></div>
      <div className="flex flex-wrap items-center gap-4">
        {person?.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={person.active} /> Active</label>}
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : person?.id ? "Save" : "Add person"}</button>
        {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
      </div>
      <p className="text-xs text-neutral-500">Monthly cost should be the fully loaded cost to Gen Clover (CTC ÷ 12 plus PF, insurance, equipment). Cost per hour = monthly cost ÷ standard hours; it is snapshotted onto each timesheet entry.</p>
    </form>
  );
}
