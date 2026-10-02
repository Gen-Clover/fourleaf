"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { distributeByRotation, moveTo, saveRotation } from "../distributeActions";

type Msg = { ok: boolean; message: string } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span> : null);

type Row = {
  id: string;
  code: string;
  name: string;
  area: string | null;
  stage: string;
  won: boolean;
  score: number;
  band: string;
  owner: string | null;
  idleDays: number | null;
  warned: boolean;
  addedBy: string | null;
  source: string;
  assigned: string | null;
};

export function DistributeTable({
  leads,
  total,
  shown,
  query,
  canPool,
  canMove,
  owner,
  poolView,
  people,
  targets,
}: {
  leads: Row[];
  total: number;
  shown: number;
  query: string;
  canPool: boolean;
  canMove: boolean;
  owner: boolean;
  poolView: boolean;
  people: { id: string; name: string; open: number }[];
  targets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const all = selected.size === 0;
  const scope = all ? { query } : { ids: [...selected] };
  const count = all ? total : selected.size;
  const run = (fn: () => Promise<Msg | undefined>, confirmText: string) => {
    if (!confirm(confirmText)) return;
    start(async () => {
      const r = (await fn()) ?? null;
      setMsg(r);
      if (r?.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  };
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const toName = targets.find((t) => t.id === to)?.name;

  return (
    <section className="card mb-6 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3 text-sm">
        <span className="font-medium">{all ? `All ${total} matching` : `${selected.size} selected`}</span>
        {total > shown && all && <span className="text-xs text-neutral-500">(showing the top {shown} by score; actions apply to all {total})</span>}
        {canPool && (
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={pending || !count}
            title={`Split by score band between ${people.length} people`}
            onClick={() => run(() => distributeByRotation(scope), `Hand out ${count} lead(s) by rotation between ${people.length} people?${!poolView && owner ? " Leads that already have an owner go to someone else." : ""}`)}
          >
            Hand out by rotation
          </button>
        )}
        {canMove && targets.length > 0 && (
          <>
            <select className="input-sm w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Move to">
              <option value="">Move to…</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className="input-sm w-48" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="btn-secondary btn-sm" disabled={pending || !to || !count} onClick={() => run(() => moveTo({ ...scope, to, note }), `Move ${count} lead(s) to ${toName}?`)}>
              Move
            </button>
          </>
        )}
        {owner && !poolView && (
          <button type="button" className="btn-secondary btn-sm" disabled={pending || !count} onClick={() => run(() => moveTo({ ...scope, to: null, note }), `Put ${count} lead(s) back in the pool?`)}>
            Back to pool
          </button>
        )}
        {selected.size > 0 && <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => setSelected(new Set())}>Clear selection</button>}
        <Note msg={msg} />
      </div>
      {canPool && (
        <div className="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-500">
          In the rotation: {people.length ? people.map((p) => `${p.name} (${p.open} open)`).join(" · ") : "nobody: mark people active on the Sales team page"}
        </div>
      )}
      {leads.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutral-500">No leads match.</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-8">
                <input type="checkbox" aria-label="Select all shown" checked={selected.size > 0 && selected.size === leads.length} onChange={(e) => setSelected(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())} />
              </th>
              <th>Lead</th><th>Stage</th><th className="num">Score</th><th>Owner</th><th className="num">Idle</th><th className="hidden md:table-cell">Came from</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className={selected.has(l.id) ? "bg-brand-soft/40" : ""}>
                <td><input type="checkbox" aria-label={`Select ${l.name}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                <td>
                  <Link href={`/leads/${l.id}`} className="font-medium text-brand-fg hover:underline">{l.name}</Link>
                  <div className="font-mono text-xs text-neutral-500">{l.code}{l.area && ` · ${l.area}`}</div>
                </td>
                <td className={`text-sm ${l.won ? "font-medium text-emerald-700" : ""}`}>{l.stage}</td>
                <td className="num">{l.score || "—"}<div className="text-[11px] text-neutral-500">{l.band}</div></td>
                <td className="text-sm">{l.owner ?? <span className="text-neutral-500">pool</span>}{l.assigned && <div className="text-xs text-neutral-500">since {l.assigned}</div>}</td>
                <td className={`num ${l.idleDays != null && l.idleDays >= 30 ? "text-red-600" : ""}`}>{l.idleDays != null ? `${l.idleDays} d` : "—"}{l.warned && <div className="text-[11px] text-amber-700">warned</div>}</td>
                <td className="hidden text-xs md:table-cell">{l.addedBy ? `Added by ${l.addedBy}` : l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The inactivity rotation: on/off, after how many days, the warning, and which stages it applies to. */
export function RotationSettingsForm({ initial, stages }: { initial: { enabled: boolean; idleDays: number; warnDays: number; stages: string[] }; stages: { key: string; label: string }[] }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card p-5">
      <div className="mb-1 font-medium text-ink">Rotate leads nobody works</div>
      <p className="mb-3 text-sm text-neutral-500">
        Once a day the worker warns the owner, then moves leads with no activity (messages, calls, meetings, notes, replies) to someone else in the rotation, never back to the same person. Won, lost and not-a-fit leads never move.
      </p>
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> On</label>
        <label className="block"><span className="label">After (days idle)</span><input className="input w-24" type="number" min={3} max={365} value={f.idleDays} onChange={(e) => setF({ ...f, idleDays: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Warn this many days before</span><input className="input w-24" type="number" min={0} max={60} value={f.warnDays} onChange={(e) => setF({ ...f, warnDays: Number(e.target.value) })} /></label>
      </div>
      <fieldset className="mt-3 text-sm">
        <legend className="label">Stages that rotate</legend>
        <div className="flex flex-wrap gap-3">
          {stages.map((s) => (
            <label key={s.key} className="flex items-center gap-1.5">
              <input type="checkbox" checked={f.stages.includes(s.key)} onChange={(e) => setF({ ...f, stages: e.target.checked ? [...f.stages, s.key] : f.stages.filter((x) => x !== s.key) })} /> {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => setMsg((await saveRotation(f)) ?? null))}>Save</button>
        <Note msg={msg} />
      </div>
    </section>
  );
}
