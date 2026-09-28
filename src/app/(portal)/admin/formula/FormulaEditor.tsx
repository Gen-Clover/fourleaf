"use client";

import { useEffect, useState, useTransition } from "react";
import { saveBuckets, saveSettings } from "../actions";

type SettingRow = { key: string; value: string; label: string; group: string; type: string; unit: string | null; description: string | null };
type BucketRow = { id?: string; key: string; name: string; percent: number; category: string; isProfit: boolean; description: string | null };
type Msg = { ok: boolean; message: string } | null;

export function SettingsForm({ settings }: { settings: SettingRow[] }) {
  const initial = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const initialKey = JSON.stringify(initial);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  useEffect(() => setValues(JSON.parse(initialKey)), [initialKey]);
  const groups = [...new Set(settings.map((s) => s.group))];
  const dirty = JSON.stringify(values) !== initialKey;

  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Formula parameters</div>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
          <button className="btn-primary" disabled={!dirty || pending} onClick={() => start(async () => setMsg(await saveSettings(values)))}>
            {pending ? "Saving…" : "Save parameters"}
          </button>
        </div>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g} className="space-y-3">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">{g}</legend>
            {settings
              .filter((s) => s.group === g)
              .map((s) => (
                <div key={s.key} className={`grid items-center gap-3 ${s.type === "text" ? "grid-cols-[1fr_16rem]" : "grid-cols-[1fr_9rem]"}`}>
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    {s.description && <div className="text-xs text-neutral-500">{s.description}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      className="input-sm w-full text-right"
                      type={s.type === "number" ? "number" : "text"}
                      step="any"
                      value={values[s.key]}
                      onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
                    />
                    {s.unit && <span className="w-14 text-xs text-neutral-500">{s.unit}</span>}
                  </div>
                </div>
              ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}

export function BucketsForm({ buckets }: { buckets: BucketRow[] }) {
  const initialKey = JSON.stringify(buckets);
  const [rows, setRows] = useState<BucketRow[]>(buckets);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  useEffect(() => setRows(JSON.parse(initialKey)), [initialKey]);
  const total = rows.reduce((s, b) => s + (Number(b.percent) || 0), 0);
  const set = (i: number, patch: Partial<BucketRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dirty = JSON.stringify(rows) !== initialKey;
  const cat = (c: string) => rows.filter((r) => r.category === c).reduce((s, r) => s + (Number(r.percent) || 0), 0);

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="card-t">Revenue allocation model</div>
          <div className="text-xs text-neutral-500">
            Delivery {cat("DELIVERY")}% · Growth {cat("GROWTH")}% · Corporate {cat("CORPORATE")}% ={" "}
            <b className={Math.abs(total - 100) > 0.001 ? "text-red-600" : "text-emerald-700"}>{total}%</b>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
          <button
            className="btn-secondary"
            onClick={() => setRows([...rows, { key: `bucket${rows.length + 1}`, name: "New bucket", percent: 0, category: "CORPORATE", isProfit: false, description: null }])}
          >
            + Add bucket
          </button>
          <button className="btn-primary" disabled={!dirty || pending} onClick={() => start(async () => setMsg(await saveBuckets(rows)))}>
            {pending ? "Saving…" : "Save allocation"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Key</th>
              <th>Bucket</th>
              <th>%</th>
              <th>Category</th>
              <th>Profit?</th>
              <th>What it covers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={i}>
                <td><input className="input-sm w-28 font-mono text-xs" value={b.key} disabled={!!b.id} onChange={(e) => set(i, { key: e.target.value })} /></td>
                <td><input className="input-sm w-56" value={b.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                <td><input className="input-sm w-20 text-right" type="number" step="any" value={b.percent} onChange={(e) => set(i, { percent: Number(e.target.value) })} /></td>
                <td>
                  <select className="input-sm" value={b.category} onChange={(e) => set(i, { category: e.target.value })}>
                    <option>DELIVERY</option>
                    <option>GROWTH</option>
                    <option>CORPORATE</option>
                  </select>
                </td>
                <td className="text-center"><input type="checkbox" checked={b.isProfit} onChange={(e) => set(i, { isProfit: e.target.checked })} /></td>
                <td><input className="input-sm w-full min-w-72" value={b.description ?? ""} onChange={(e) => set(i, { description: e.target.value })} /></td>
                <td><button className="btn-danger btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
