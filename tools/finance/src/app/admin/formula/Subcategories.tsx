"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCategories } from "../actions";

type Row = { id?: string; name: string; bucketKey: string | null; active: boolean; used: number };
type Msg = { ok: boolean; message: string } | null;

const PASS = "__pass";

/**
 * The spend items under each bucket (expense categories): rename, move to another bucket, retire or add.
 * Retired ones stay on past expenses but can't be picked for new ones.
 */
export default function Subcategories({ rows: initial, buckets }: { rows: Row[]; buckets: { key: string; name: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [showRetired, setShowRetired] = useState(false);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const groups: { key: string | null; name: string }[] = [...buckets, { key: "gst", name: "GST paid to the government" }, { key: null, name: "Client pass-through (billed to the client at cost)" }];
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="card-t">Subcategories: what each bucket is spent on</div>
          <div className="text-xs text-neutral-500">These are the expense categories picked when recording spend. Retire instead of deleting: past expenses keep theirs.</div>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
          <label className="flex items-center gap-1 text-xs text-neutral-600">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show retired
          </label>
          <button
            className="btn-primary"
            disabled={!dirty || pending}
            onClick={() =>
              start(async () => {
                const r = await saveCategories(rows.map(({ id, name, bucketKey, active }) => ({ id, name, bucketKey, active })));
                setMsg(r);
                if (r.ok) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save subcategories"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g.key ?? PASS}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">{g.name}</div>
              <button type="button" className="text-xs underline" onClick={() => setRows([...rows, { name: "", bucketKey: g.key, active: true, used: 0 }])}>
                + Add
              </button>
            </div>
            <ul className="space-y-1">
              {rows.map((r, i) =>
                r.bucketKey === g.key && (r.active || showRetired) ? (
                  <li key={r.id ?? `new-${i}`} className="flex items-center gap-1.5">
                    <input className={`input-sm min-w-0 flex-1 ${r.active ? "" : "text-neutral-400 line-through"}`} value={r.name} placeholder="Subcategory name" onChange={(e) => set(i, { name: e.target.value })} />
                    <select className="input-sm w-24 shrink-0" value={r.bucketKey ?? PASS} onChange={(e) => set(i, { bucketKey: e.target.value === PASS ? null : e.target.value })} aria-label="Move to bucket" title="Move to another bucket">
                      {groups.map((x) => <option key={x.key ?? PASS} value={x.key ?? PASS}>{x.name}</option>)}
                    </select>
                    {r.id ? (
                      <button type="button" className="text-xs underline" onClick={() => set(i, { active: !r.active })} title={r.used ? `${r.used} expense(s) recorded against it` : undefined}>
                        {r.active ? "Retire" : "Restore"}
                      </button>
                    ) : (
                      <button type="button" className="text-xs text-red-600 underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
                    )}
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
