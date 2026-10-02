"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveWeek, submitWeek } from "../actions";

export type GridRow = { projectId: string; billable: boolean; hours: number[] };

/** One person's week: hours per project per day. Save as you go; Submit sends it for approval. */
export default function WeekGrid({
  personId,
  weekStart,
  days,
  initial,
  projects,
  readOnly,
  canSubmit,
}: {
  personId: string;
  weekStart: string;
  days: string[];
  initial: GridRow[];
  projects: { id: string; label: string }[];
  readOnly: boolean;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<GridRow[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<GridRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dayTotal = (d: number) => rows.reduce((s, r) => s + (r.hours[d] || 0), 0);
  const total = rows.reduce((s, r) => s + r.hours.reduce((a, b) => a + b, 0), 0);
  const run = (fn: () => Promise<{ ok: boolean; message: string } | undefined>) =>
    start(async () => {
      const res = await fn();
      setMsg(res ?? null);
      if (res?.ok) router.refresh();
    });

  return (
    <div className="card overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Project</th><th>Billable</th>
            {days.map((d) => <th key={d} className="num">{new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" })}</th>)}
            <th className="num">Total</th>{!readOnly && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <select className="input-sm w-64" value={r.projectId} disabled={readOnly} onChange={(e) => set(i, { projectId: e.target.value })}>
                  <option value="">Select project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </td>
              <td className="text-center"><input type="checkbox" checked={r.billable} disabled={readOnly} onChange={(e) => set(i, { billable: e.target.checked })} /></td>
              {r.hours.map((h, d) => (
                <td key={d} className="num">
                  <input
                    className={`input-sm w-14 text-right ${d >= 5 ? "bg-neutral-50" : ""}`}
                    type="number"
                    min={0}
                    max={24}
                    step="0.25"
                    value={h || ""}
                    disabled={readOnly}
                    onChange={(e) => set(i, { hours: r.hours.map((x, k) => (k === d ? Number(e.target.value) || 0 : x)) })}
                  />
                </td>
              ))}
              <td className="num font-semibold">{r.hours.reduce((a, b) => a + b, 0)}</td>
              {!readOnly && <td><button type="button" className="btn-danger btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={11} className="py-6 text-center text-neutral-500">No rows. Get assigned to a project, or add a row.</td></tr>}
        </tbody>
        <tfoot>
          <tr><td colSpan={2}>Day total</td>{days.map((d, i) => <td key={d} className={`num ${dayTotal(i) > 12 ? "text-red-600" : ""}`}>{dayTotal(i)}</td>)}<td className="num">{total}</td>{!readOnly && <td />}</tr>
        </tfoot>
      </table>
      {(!readOnly || canSubmit) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
          {!readOnly && (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setRows([...rows, { projectId: "", billable: true, hours: [0, 0, 0, 0, 0, 0, 0] }])}>+ Add row</button>
              <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => saveWeek({ personId, weekStart, rows: rows.filter((r) => r.projectId) }))}>
                {pending ? "Saving…" : "Save week"}
              </button>
            </>
          )}
          {canSubmit && (
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => submitWeek(personId, weekStart))}>
              Submit for approval
            </button>
          )}
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
    </div>
  );
}
