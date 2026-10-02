"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveIncentiveSettings, saveTeamMember } from "../../incentiveActions";

type Msg = { ok: boolean; message: string } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span> : null);

export function SettingsForm({ initial }: { initial: { sellerPct: number; managerPct: number; holdDays: number } }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card mb-6 p-5">
      <div className="mb-3 font-medium text-ink">Rates and hold</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">Seller %</span><input className="input w-24" type="number" min={0} max={50} step="0.5" value={f.sellerPct} onChange={(e) => setF({ ...f, sellerPct: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Manager %</span><input className="input w-24" type="number" min={0} max={50} step="0.5" value={f.managerPct} onChange={(e) => setF({ ...f, managerPct: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Hold after the client pays (days)</span><input className="input w-24" type="number" min={0} max={180} value={f.holdDays} onChange={(e) => setF({ ...f, holdDays: Number(e.target.value) })} /></label>
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => setMsg((await saveIncentiveSettings(f)) ?? null))}>Save</button>
        <Note msg={msg} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">Each deal keeps the rates it was won at. The hold covers refund requests: money then moves to the next pay run.</p>
    </section>
  );
}

type Row = {
  userId: string;
  name: string;
  role: string;
  saved: boolean;
  managerUserId: string | null;
  onIncentive: boolean;
  personId: string | null;
  active: boolean;
  isManager: boolean;
  canGenerateLeads: boolean;
  canReassignTeam: boolean;
};

function MemberRow({ row, managers, people }: { row: Row; managers: { id: string; name: string }[]; people: { id: string; label: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState(row);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const dirty = !row.saved || JSON.stringify(f) !== JSON.stringify(row);
  return (
    <tr>
      <td><div className="font-medium">{row.name}</div><div className="text-xs text-neutral-500">{row.role}{!row.saved && " · not set up yet"}</div></td>
      <td>
        <select className="input" value={f.managerUserId ?? ""} onChange={(e) => setF({ ...f, managerUserId: e.target.value || null })}>
          <option value="">— no manager —</option>
          {managers.filter((m) => m.id !== row.userId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </td>
      <td className="text-center"><input type="checkbox" checked={f.onIncentive} onChange={(e) => setF({ ...f, onIncentive: e.target.checked })} /></td>
      <td>
        <select className="input" value={f.personId ?? ""} onChange={(e) => setF({ ...f, personId: e.target.value || null })}>
          <option value="">— none: can&apos;t be paid —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </td>
      <td className="text-center"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /></td>
      <td className="text-center">
        <input type="checkbox" disabled={!row.isManager} title={row.isManager ? "Google searches, imports, and handing out the pool by rotation" : "Sales managers only"} checked={f.canGenerateLeads} onChange={(e) => setF({ ...f, canGenerateLeads: e.target.checked })} />
      </td>
      <td className="text-center">
        <input type="checkbox" disabled={!row.isManager} title={row.isManager ? "Move leads between people in their own team (never won leads)" : "Sales managers only"} checked={f.canReassignTeam} onChange={(e) => setF({ ...f, canReassignTeam: e.target.checked })} />
      </td>
      <td className="text-right">
        <button type="button" className="btn-secondary btn-sm" disabled={!dirty || pending} onClick={() => start(async () => { const r = (await saveTeamMember(f)) ?? null; setMsg(r); if (r?.ok) router.refresh(); })}>Save</button>
        <div><Note msg={msg} /></div>
      </td>
    </tr>
  );
}

export function TeamTable({ rows, managers, people, others }: { rows: Row[]; managers: { id: string; name: string }[]; people: { id: string; label: string }[]; others: { id: string; name: string }[] }) {
  const [extra, setExtra] = useState<Row[]>([]);
  const [add, setAdd] = useState("");
  return (
    <section className="card overflow-x-auto">
      <div className="card-h"><div className="card-t">People who sell</div><span className="text-xs text-neutral-500">Sales and sales-manager logins, plus anyone added here</span></div>
      <table className="tbl">
        <thead><tr><th>Person</th><th>Manager (gets the manager %)</th><th className="text-center">On incentives</th><th>Paid through (People)</th><th className="text-center">In the lead rotation</th><th className="text-center">Can generate leads</th><th className="text-center">Can move team leads</th><th /></tr></thead>
        <tbody>
          {[...rows, ...extra].map((r) => <MemberRow key={r.userId} row={r} managers={managers} people={people} />)}
        </tbody>
      </table>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 px-5 py-3 text-sm">
          <select className="input max-w-xs" value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">Add someone else who sells…</option>
            {others.filter((o) => !extra.some((x) => x.userId === o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button type="button" className="btn-secondary btn-sm" disabled={!add} onClick={() => { const o = others.find((x) => x.id === add)!; setExtra([...extra, { userId: o.id, name: o.name, role: "", saved: false, managerUserId: null, onIncentive: true, personId: null, active: true, isManager: false, canGenerateLeads: false, canReassignTeam: false }]); setAdd(""); }}>Add</button>
        </div>
      )}
      <p className="px-5 pb-4 text-xs text-neutral-500">
        In the lead rotation = gets leads handed out and rotated (inactive people get none). The two lead permissions are for sales managers; owners can always do both. Someone without a People record earns incentives but can&apos;t be paid until they have one (People → add, pay model &quot;Sales incentive only&quot; for incentive-only sellers). Salaried sellers get their incentives as a separate line in the same pay run.
      </p>
    </section>
  );
}
