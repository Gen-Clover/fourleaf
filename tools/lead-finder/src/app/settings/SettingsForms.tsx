"use client";

import { useState, useTransition } from "react";
import { saveLfSettings, saveNiches } from "../actions";

type Setting = { key: string; value: string; label: string; type: string; unit: string | null; description: string | null };
type Niche = { key: string; label: string; phrases: string[]; market: string; value: string; bookingRelevant: boolean; active: boolean };

const Msg = ({ m }: { m: { ok: boolean; message: string } | undefined }) => (m ? <span className={`text-sm ${m.ok ? "text-emerald-700" : "text-red-600"}`}>{m.message}</span> : null);

export function LfSettingsForm({ settings }: { settings: Setting[] }) {
  const [values, setValues] = useState(Object.fromEntries(settings.map((s) => [s.key, s.value])));
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | undefined>();
  const [pending, start] = useTransition();
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">Spend, prices and scoring</div></div>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {settings.map((s) => (
          <div key={s.key}>
            <label className="label" htmlFor={s.key}>{s.label}{s.unit && <span className="text-neutral-400"> ({s.unit})</span>}</label>
            {s.type === "text" ? (
              <input id={s.key} className="input" type="url" placeholder="https://…" value={values[s.key]} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
            ) : (
              <input id={s.key} className="input" type="number" step="any" min={0} value={values[s.key]} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
            )}
            {s.description && <p className="mt-1 text-xs text-neutral-500">{s.description}</p>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-neutral-200 px-5 py-3">
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => setMsg(await saveLfSettings(values)))}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

export function NichesForm({ niches }: { niches: Niche[] }) {
  const [rows, setRows] = useState(niches.map((n) => ({ ...n, phrasesText: n.phrases.join(", ") })));
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | undefined>();
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () =>
    start(async () =>
      setMsg(
        await saveNiches(
          rows.map(({ phrasesText, ...r }) => ({ ...r, key: r.key.trim(), phrases: phrasesText.split(",").map((p) => p.trim()).filter(Boolean) })),
        ),
      ),
    );

  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Niches</div>
        <span className="text-xs text-neutral-500">Phrases are what a search asks Google Maps for, one request per phrase and map cell.</span>
      </div>
      <div className="divide-y divide-neutral-100">
        {rows.map((r, i) => (
          <div key={i} className={`grid gap-2 px-5 py-3 md:grid-cols-[12rem_1fr] ${r.active ? "" : "opacity-60"}`}>
            <div className="space-y-2">
              <input className="input-sm w-full font-medium" aria-label="Niche name" value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
              <input
                className="input-sm w-full font-mono text-xs"
                aria-label="Key"
                value={r.key}
                disabled={i < niches.length}
                onChange={(e) => set(i, { key: e.target.value.toLowerCase() })}
                title="Key (can't change once saved)"
              />
            </div>
            <div className="space-y-2">
              <input className="input-sm w-full" aria-label="Search phrases" value={r.phrasesText} onChange={(e) => set(i, { phrasesText: e.target.value })} />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <select className="input-sm" aria-label="Market" value={r.market} onChange={(e) => set(i, { market: e.target.value })}>
                  <option value="IN">India</option>
                  <option value="US">USA</option>
                </select>
                <select className="input-sm" aria-label="Value" value={r.value} onChange={(e) => set(i, { value: e.target.value })}>
                  <option value="HIGH">High value</option>
                  <option value="MEDIUM">Medium value</option>
                  <option value="LOW">Low value</option>
                </select>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.bookingRelevant} onChange={(e) => set(i, { bookingRelevant: e.target.checked })} /> Booking upsell</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} /> Active</label>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-neutral-200 px-5 py-3">
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setRows([...rows, { key: "", label: "", phrases: [], phrasesText: "", market: "IN", value: "MEDIUM", bookingRelevant: false, active: true }])}
        >
          + Add niche
        </button>
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save niches"}</button>
        <Msg m={msg} />
      </div>
    </div>
  );
}
