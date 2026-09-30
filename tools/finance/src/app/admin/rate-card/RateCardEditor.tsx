"use client";

import { useEffect, useState, useTransition } from "react";
import { type Bucket, type Params, roleMetrics } from "../../../lib/calc";
import { num, pct } from "@genclover/ui/format";
import { saveRateCard } from "../actions";

export type Row = {
  id?: string;
  name: string;
  family: string;
  marketMin: number;
  marketMax: number;
  usSalary: number;
  standardRate: number;
  floorRate: number | null;
  ctcMinL: number | null;
  ctcMaxL: number | null;
  notes: string | null;
  active: boolean;
};

const FAMILIES = ["Product & Delivery Mgmt", "Analysis & Design", "Core Engineering", "Quality", "Specialist Engineering", "Technical Leadership", "Support"];

export default function RateCardEditor({ initial, params, buckets }: { initial: Row[]; params: Params; buckets: Bucket[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const initialKey = JSON.stringify(initial);
  // After a save the server re-renders with fresh ids — adopt them.
  useEffect(() => setRows(JSON.parse(initialKey)), [initialKey]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const n = (v: string) => (v === "" ? 0 : Number(v));
  const nn = (v: string) => (v === "" ? null : Number(v));
  const move = (i: number, d: number) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const c = [...rs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  return (
    <div className="card">
      <div className="card-h sticky top-0 z-10 bg-surface">
        <div className="text-sm text-neutral-600">
          {rows.length} roles · Floor blank = follows rule (−${params.floorDeltaLow} / −${params.floorDeltaHigh} at ≥${params.floorThreshold})
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
          <button className="btn-secondary" onClick={() => setRows(initial)} disabled={!dirty || pending}>Discard</button>
          <button
            className="btn-secondary"
            onClick={() =>
              setRows((rs) => [...rs, { name: "New Role", family: FAMILIES[2], marketMin: 40, marketMax: 60, usSalary: 150000, standardRate: 50, floorRate: null, ctcMinL: null, ctcMaxL: null, notes: null, active: true }])
            }
          >
            + Add role
          </button>
          <button
            className="btn-primary"
            disabled={!dirty || pending}
            onClick={() => start(async () => setMsg(await saveRateCard(rows)))}
          >
            {pending ? "Saving…" : "Save rate card"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl [&_td]:px-1.5 [&_th]:px-1.5">
          <thead>
            <tr>
              <th></th>
              <th>Role / Domain</th>
              <th>Family</th>
              <th>Mkt Min</th>
              <th>Mkt Max</th>
              <th>US Salary</th>
              <th>Standard</th>
              <th title="Leave empty to use the floor rule (shown in grey)">Floor</th>
              <th>CTC Min ₹L</th>
              <th>CTC Max ₹L</th>
              <th>Active</th>
              <th className="num" title="Savings vs US loaded cost · coverage of the India CTC midpoint">Savings · Cover</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const m = roleMetrics(r, params, buckets);
              return (
                <tr key={r.id ?? `new-${i}`} className={r.active ? "" : "opacity-50"}>
                  <td className="whitespace-nowrap">
                    <button className="px-1 text-neutral-400 hover:text-ink" onClick={() => move(i, -1)} title="Move up">↑</button>
                    <button className="px-1 text-neutral-400 hover:text-ink" onClick={() => move(i, 1)} title="Move down">↓</button>
                  </td>
                  <td><input className="input-sm w-52" value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                  <td>
                    <input className="input-sm w-36" list="families" value={r.family} onChange={(e) => set(i, { family: e.target.value })} />
                  </td>
                  <td><input className="input-sm w-16" type="number" value={r.marketMin} onChange={(e) => set(i, { marketMin: n(e.target.value) })} /></td>
                  <td><input className="input-sm w-16" type="number" value={r.marketMax} onChange={(e) => set(i, { marketMax: n(e.target.value) })} /></td>
                  <td><input className="input-sm w-24" type="number" step={1000} value={r.usSalary} onChange={(e) => set(i, { usSalary: n(e.target.value) })} /></td>
                  <td><input className="input-sm w-16 font-semibold text-brand-fg" type="number" value={r.standardRate} onChange={(e) => set(i, { standardRate: n(e.target.value) })} /></td>
                  <td><input className="input-sm w-16" type="number" placeholder={String(m.floor)} title="Empty = floor rule" value={r.floorRate ?? ""} onChange={(e) => set(i, { floorRate: nn(e.target.value) })} /></td>
                  <td><input className="input-sm w-16" type="number" value={r.ctcMinL ?? ""} onChange={(e) => set(i, { ctcMinL: nn(e.target.value) })} /></td>
                  <td><input className="input-sm w-16" type="number" value={r.ctcMaxL ?? ""} onChange={(e) => set(i, { ctcMaxL: nn(e.target.value) })} /></td>
                  <td className="text-center"><input type="checkbox" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} /></td>
                  <td className="num text-xs leading-tight">
                    <div>{pct(m.savings)}</div>
                    <div className={m.coverage != null && m.coverage < params.coverageTarget ? "text-amber-700" : "text-neutral-500"}>
                      {m.coverage == null ? "—" : `${num(m.coverage, 2)}×`}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                      title="Remove (roles used in projects are deactivated instead of deleted)"
                      aria-label={`Remove ${r.name}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="families">{FAMILIES.map((f) => <option key={f} value={f} />)}</datalist>
      </div>
    </div>
  );
}
