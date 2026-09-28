"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MILESTONE_STATUSES, STATUS_LABEL } from "@/lib/format";
import { saveAssignments, saveMilestones } from "../delivery-actions";

type Msg = { ok: boolean; message: string } | null;

function SaveBar({ pending, msg, onSave, onAdd, addLabel }: { pending: boolean; msg: Msg; onSave: () => void; onAdd: () => void; addLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
      <button className="btn-secondary btn-sm" onClick={onAdd}>{addLabel}</button>
      <button className="btn-primary" disabled={pending} onClick={onSave}>{pending ? "Saving…" : "Save"}</button>
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
    </div>
  );
}

export type MilestoneRow = { id?: string; title: string; ownerId: string | null; dueDate: string | null; status: string; notes: string | null };

export function MilestoneEditor({ projectId, initial, people, readOnly, today }: { projectId: string; initial: MilestoneRow[]; people: { id: string; name: string }[]; readOnly: boolean; today: string }) {
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
        <thead><tr><th>#</th><th>Milestone</th><th>Owner</th><th>Due</th><th>Status</th><th>Notes</th>{!readOnly && <th></th>}</tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const overdue = r.status !== "DONE" && r.dueDate && r.dueDate < today;
            return (
              <tr key={r.id ?? `n${i}`}>
                <td className="text-neutral-500">{i + 1}</td>
                <td><input className="input-sm w-64" value={r.title} disabled={readOnly} onChange={(e) => set(i, { title: e.target.value })} /></td>
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
                <td><input className="input-sm w-56" value={r.notes ?? ""} disabled={readOnly} onChange={(e) => set(i, { notes: e.target.value })} /></td>
                {!readOnly && (
                  <td className="whitespace-nowrap">
                    <button className="btn-secondary btn-sm" disabled={i === 0} onClick={() => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setRows(n); }}>↑</button>{" "}
                    <button className="btn-danger btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-500">No milestones yet.</td></tr>}
        </tbody>
      </table>
      {!readOnly && (
        <SaveBar
          pending={pending}
          msg={msg}
          addLabel="+ Add milestone"
          onAdd={() => setRows([...rows, { title: "", ownerId: null, dueDate: null, status: "PLANNED", notes: null }])}
          onSave={() => start(async () => { const r = await saveMilestones(projectId, rows); setMsg(r ?? null); if (r?.ok) router.refresh(); })}
        />
      )}
    </div>
  );
}

export type AssignmentRow = { personId: string; resourceId: string | null; hoursPerMonth: number; billable: boolean };

export function TeamEditor({
  projectId,
  initial,
  people,
  resources,
  actuals,
  readOnly,
}: {
  projectId: string;
  initial: AssignmentRow[];
  people: { id: string; name: string }[];
  resources: { id: string; label: string; hours: number }[];
  actuals: Record<string, number>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<AssignmentRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const planned = rows.reduce((s, r) => s + r.hoursPerMonth, 0);
  const quoted = resources.reduce((s, r) => s + r.hours, 0);

  return (
    <div className="card overflow-x-auto">
      <div className="card-h">
        <div className="card-t">Team</div>
        <span className={`text-xs ${planned < quoted ? "text-amber-700" : "text-neutral-500"}`}>Staffed {planned} of {quoted} quoted hrs / month</span>
      </div>
      <table className="tbl">
        <thead><tr><th>Person</th><th>Bills against quote line</th><th>Planned hrs / mo</th><th>Billable</th><th className="num">Logged this month</th>{!readOnly && <th></th>}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <select className="input-sm w-48" value={r.personId} disabled={readOnly} onChange={(e) => set(i, { personId: e.target.value })}>
                  <option value="">Select…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </td>
              <td>
                <select className="input-sm w-64" value={r.resourceId ?? ""} disabled={readOnly} onChange={(e) => set(i, { resourceId: e.target.value || null })}>
                  <option value="">— not mapped —</option>
                  {resources.map((res) => <option key={res.id} value={res.id}>{res.label} ({res.hours} hrs)</option>)}
                </select>
              </td>
              <td><input className="input-sm w-24" type="number" min={0} step="any" value={r.hoursPerMonth} disabled={readOnly} onChange={(e) => set(i, { hoursPerMonth: Number(e.target.value) || 0 })} /></td>
              <td className="text-center"><input type="checkbox" checked={r.billable} disabled={readOnly} onChange={(e) => set(i, { billable: e.target.checked })} /></td>
              <td className="num">{actuals[r.personId] ?? 0}</td>
              {!readOnly && <td><button className="btn-danger btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Nobody assigned. Assign people so they can log time and billing hours can be pulled from timesheets.</td></tr>}
        </tbody>
      </table>
      {!readOnly && (
        <SaveBar
          pending={pending}
          msg={msg}
          addLabel="+ Assign person"
          onAdd={() => setRows([...rows, { personId: "", resourceId: null, hoursPerMonth: 0, billable: true }])}
          onSave={() => start(async () => { const r = await saveAssignments(projectId, rows); setMsg(r ?? null); if (r?.ok) router.refresh(); })}
        />
      )}
    </div>
  );
}
