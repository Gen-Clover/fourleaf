"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MILESTONE_STATUSES, STATUS_LABEL } from "@genclover/ui/format";
import { BILL_MODES } from "../../../lib/billing";
import { cancelRequest, requestResource, saveAssignments, saveMilestones } from "../../actions";

type Msg = { ok: boolean; message: string } | null;

function SaveBar({ pending, msg, onSave, onAdd, addLabel }: { pending: boolean; msg: Msg; onSave: () => void; onAdd: () => void; addLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
      <button type="button" className="btn-secondary btn-sm" onClick={onAdd}>{addLabel}</button>
      <button type="button" className="btn-primary" disabled={pending} onClick={onSave}>{pending ? "Saving…" : "Save"}</button>
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
    </div>
  );
}

export type MilestoneRow = { id?: string; title: string; ownerId: string | null; dueDate: string | null; status: string; notes: string | null; acceptanceRef: string | null; billed: boolean };

/** Milestones with owner, due date, status and client acceptance (the acceptance certificate's code). */
export function MilestoneEditor({ projectId, initial, people, acceptances, readOnly, today }: { projectId: string; initial: MilestoneRow[]; people: { id: string; name: string }[]; acceptances: string[]; readOnly: boolean; today: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<MilestoneRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const done = rows.filter((r) => r.status === "DONE").length;
  return (
    <div className="card overflow-x-auto">
      <div className="card-h">
        <div className="card-t">Milestones</div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {done}/{rows.length} done
          <div className="h-2 w-32 rounded bg-neutral-100"><div className="h-2 rounded bg-emerald-600" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} /></div>
        </div>
      </div>
      <table className="tbl">
        <thead><tr><th>#</th><th>Milestone</th><th>Owner</th><th>Due</th><th>Status</th><th>Accepted (certificate)</th><th>Notes</th>{!readOnly && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const overdue = r.status !== "DONE" && r.dueDate && r.dueDate < today;
            return (
              <tr key={r.id ?? `n${i}`}>
                <td className="text-neutral-500">{i + 1}</td>
                <td><input className="input-sm w-56" value={r.title} disabled={readOnly} onChange={(e) => set(i, { title: e.target.value })} />{r.billed && <div className="text-[11px] text-emerald-700">invoiced</div>}</td>
                <td>
                  <select className="input-sm" value={r.ownerId ?? ""} disabled={readOnly} onChange={(e) => set(i, { ownerId: e.target.value || null })}>
                    <option value="">—</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td><input className={`input-sm ${overdue ? "border-red-400 text-red-600" : ""}`} type="date" value={r.dueDate ?? ""} disabled={readOnly} onChange={(e) => set(i, { dueDate: e.target.value || null })} /></td>
                <td>
                  <select className="input-sm" value={r.status} disabled={readOnly} onChange={(e) => set(i, { status: e.target.value })}>
                    {MILESTONE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
                <td>
                  <input className="input-sm w-40 font-mono" list="acceptances" placeholder="ABR-P01-AC01" value={r.acceptanceRef ?? ""} disabled={readOnly} onChange={(e) => set(i, { acceptanceRef: e.target.value || null })} />
                </td>
                <td><input className="input-sm w-48" value={r.notes ?? ""} disabled={readOnly} onChange={(e) => set(i, { notes: e.target.value })} /></td>
                {!readOnly && (
                  <td className="whitespace-nowrap">
                    <button type="button" className="btn-secondary btn-sm" disabled={i === 0} onClick={() => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setRows(n); }}>↑</button>{" "}
                    <button type="button" className="btn-danger btn-sm" disabled={r.billed} title={r.billed ? "Invoiced: can't be removed" : undefined} onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-neutral-500">No milestones yet.</td></tr>}
        </tbody>
      </table>
      <datalist id="acceptances">{acceptances.map((a) => <option key={a} value={a} />)}</datalist>
      {!readOnly && (
        <SaveBar
          pending={pending}
          msg={msg}
          addLabel="+ Add milestone"
          onAdd={() => setRows([...rows, { title: "", ownerId: null, dueDate: null, status: "PLANNED", notes: null, acceptanceRef: null, billed: false }])}
          onSave={() => start(async () => { const r = await saveMilestones(projectId, rows); setMsg(r ?? null); if (r?.ok) router.refresh(); })}
        />
      )}
    </div>
  );
}

export type AssignmentRow = { personId: string; resourceId: string | null; hoursPerMonth: number; billable: boolean; startDate: string | null; endDate: string | null; billMode: string; billValue: number };

/**
 * Who works on the project and how many hours a month. Finance roles also see and set the billing basis
 * (what the client is billed for each person's time); nobody else does.
 */
export function TeamEditor({
  projectId,
  initial,
  people,
  resources,
  actuals,
  readOnly,
  showBilling,
}: {
  projectId: string;
  initial: AssignmentRow[];
  people: { id: string; name: string; capacity: number; allocated: number }[];
  resources: { id: string; label: string; hours: number }[];
  actuals: Record<string, number>;
  readOnly: boolean;
  showBilling: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<AssignmentRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const planned = rows.reduce((s, r) => s + r.hoursPerMonth, 0);
  const quoted = resources.reduce((s, r) => s + r.hours, 0);
  const person = (id: string) => people.find((p) => p.id === id);
  return (
    <div className="card overflow-x-auto">
      <div className="card-h">
        <div className="card-t">Team</div>
        <span className={`text-xs ${quoted && planned < quoted ? "text-amber-700" : "text-neutral-500"}`}>Staffed {planned}{quoted ? ` of ${quoted} planned` : ""} hrs / month</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Person</th><th>Quote line</th><th>Hrs / month</th><th>From</th><th>To</th><th>Billable</th>
            {showBilling && <th>Client billed for (finance only)</th>}
            <th className="num">Logged this month</th>{!readOnly && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const p = person(r.personId);
            const over = p && p.allocated - (initial.find((x) => x.personId === r.personId)?.hoursPerMonth ?? 0) + r.hoursPerMonth > p.capacity;
            return (
              <tr key={i}>
                <td>
                  <select className="input-sm w-44" value={r.personId} disabled={readOnly} onChange={(e) => set(i, { personId: e.target.value })}>
                    <option value="">Select…</option>
                    {people.map((x) => <option key={x.id} value={x.id}>{x.name} ({Math.max(0, x.capacity - x.allocated)} hrs free)</option>)}
                  </select>
                  {over && <div className="text-[11px] text-red-600">Over capacity across projects</div>}
                </td>
                <td>
                  <select className="input-sm w-44" value={r.resourceId ?? ""} disabled={readOnly} onChange={(e) => set(i, { resourceId: e.target.value || null })}>
                    <option value="">—</option>
                    {resources.map((res) => <option key={res.id} value={res.id}>{res.label} ({res.hours} hrs)</option>)}
                  </select>
                </td>
                <td><input className="input-sm w-20" type="number" min={0} step="any" value={r.hoursPerMonth} disabled={readOnly} onChange={(e) => set(i, { hoursPerMonth: Number(e.target.value) || 0 })} /></td>
                <td><input className="input-sm" type="date" value={r.startDate ?? ""} disabled={readOnly} onChange={(e) => set(i, { startDate: e.target.value || null })} /></td>
                <td><input className="input-sm" type="date" value={r.endDate ?? ""} disabled={readOnly} onChange={(e) => set(i, { endDate: e.target.value || null })} /></td>
                <td className="text-center"><input type="checkbox" checked={r.billable} disabled={readOnly} onChange={(e) => set(i, { billable: e.target.checked })} /></td>
                {showBilling && (
                  <td className="whitespace-nowrap">
                    <select className="input-sm" value={r.billMode} disabled={readOnly || !r.billable} onChange={(e) => set(i, { billMode: e.target.value, billValue: e.target.value === "PER_DAY" ? 8 : 1 })} title={BILL_MODES[r.billMode]?.hint}>
                      {Object.entries(BILL_MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {r.billMode !== "ACTUAL" && (
                      <input className="input-sm ml-1 w-16" type="number" min={0} max={24} step="0.25" value={r.billValue} disabled={readOnly || !r.billable} onChange={(e) => set(i, { billValue: Number(e.target.value) || 0 })} aria-label={BILL_MODES[r.billMode].unit} />
                    )}
                    {r.billMode !== "ACTUAL" && <span className="ml-1 text-xs text-neutral-500">{BILL_MODES[r.billMode].unit}</span>}
                  </td>
                )}
                <td className="num">{actuals[r.personId] ?? 0}</td>
                {!readOnly && <td><button type="button" className="btn-danger btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>}
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-neutral-500">Nobody assigned. Assign people so they can log time here, or send a resource request.</td></tr>}
        </tbody>
      </table>
      {showBilling && (
        <p className="px-5 pt-2 text-xs text-neutral-500">
          The billing basis must match the client contract (e.g. a per-day engagement in the SOW). People are paid for the hours they log; the client is billed per this basis. Only owners and finance see this column.
        </p>
      )}
      {!readOnly && (
        <SaveBar
          pending={pending}
          msg={msg}
          addLabel="+ Assign person"
          onAdd={() => setRows([...rows, { personId: "", resourceId: null, hoursPerMonth: 0, billable: true, startDate: null, endDate: null, billMode: "ACTUAL", billValue: 1 }])}
          onSave={() =>
            start(async () => {
              // Without billing access the basis is not sent, so the stored one stays as it is.
              const r = await saveAssignments(projectId, showBilling ? rows : rows.map((x) => ({ personId: x.personId, resourceId: x.resourceId, hoursPerMonth: x.hoursPerMonth, billable: x.billable, startDate: x.startDate, endDate: x.endDate })));
              setMsg(r ?? null);
              if (r?.ok) router.refresh();
            })
          }
        />
      )}
    </div>
  );
}

/** Ask the resource manager for a person (role, hours, dates). */
export function RequestForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ role: "", skills: "", hoursPerMonth: "80", startDate: "", endDate: "", note: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>+ Request a resource</button>;
  return (
    <div className="grid gap-2 rounded-lg bg-neutral-50 p-3 text-sm md:grid-cols-3">
      <input className="input" placeholder="Role (e.g. Senior React developer) *" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
      <input className="input" placeholder="Skills" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} />
      <input className="input" type="number" placeholder="Hours / month" value={f.hoursPerMonth} onChange={(e) => setF({ ...f, hoursPerMonth: e.target.value })} />
      <label className="block"><span className="label">From</span><input className="input" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
      <label className="block"><span className="label">To</span><input className="input" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
      <input className="input self-end" placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <div className="flex gap-2 md:col-span-3">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await requestResource(projectId, f);
              setMsg(r ?? null);
              if (r?.ok) {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          Send request
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        {msg && !msg.ok && <span className="text-red-600">{msg.message}</span>}
      </div>
    </div>
  );
}

export function CancelRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="text-xs underline" disabled={pending} onClick={() => start(async () => { await cancelRequest(id); router.refresh(); })}>
      Cancel
    </button>
  );
}
