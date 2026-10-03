"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeTeamMember, saveIncentiveSettings, saveTeamMember } from "../../incentiveActions";

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
  /** False for roles that can't work leads (CFO, accountant…): they shouldn't be in the rotation. */
  canWork?: boolean;
  saved: boolean;
  managerUserId: string | null;
  onIncentive: boolean;
  personId: string | null;
  active: boolean;
  isManager: boolean;
  canGenerateLeads: boolean;
  canReassignTeam: boolean;
};

function MemberRow({ row, managers, people, onDrop }: { row: Row; managers: { id: string; name: string }[]; people: { id: string; label: string }[]; onDrop: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(row);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const dirty = !row.saved || JSON.stringify(f) !== JSON.stringify(row);
  // Not saved yet: just drop the line. Saved: take them off the team (refused while they own open leads).
  const remove = () => {
    if (!row.saved) return onDrop();
    if (!window.confirm(`Remove ${row.name} from the sales team?\n\nThey get no more leads and lose any manager permissions. Deals they already won and their incentives stay as they are.`)) return;
    start(async () => {
      const r = (await removeTeamMember(row.userId)) ?? null;
      setMsg(r);
      if (r?.ok) {
        onDrop();
        router.refresh();
      }
    });
  };
  return (
    <tr>
      <td>
        <div className="font-medium">{row.name}</div>
        <div className="text-xs text-neutral-500">{row.role}{!row.saved && <span className="text-amber-700"> · not saved yet: press Save</span>}</div>
        {row.canWork === false && <div className="text-xs text-red-600">This role can&apos;t work leads: untick &quot;In the lead rotation&quot;, or change their role</div>}
      </td>
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
        <div className="flex justify-end gap-2 whitespace-nowrap">
          <button type="button" className={row.saved ? "btn-secondary btn-sm" : "btn-primary btn-sm"} disabled={!dirty || pending} onClick={() => start(async () => { const r = (await saveTeamMember(f)) ?? null; setMsg(r); if (r?.ok) router.refresh(); })}>Save</button>
          <button type="button" className="btn-secondary btn-sm text-red-600" disabled={pending} onClick={remove}>Remove</button>
        </div>
        <div className="max-w-56"><Note msg={msg} /></div>
      </td>
    </tr>
  );
}

type Candidate = { id: string; name: string; role: string; isManager: boolean; personId: string | null };

export function TeamTable({ rows, managers, people, others }: { rows: Row[]; managers: { id: string; name: string }[]; people: { id: string; label: string }[]; others: Candidate[] }) {
  const [extra, setExtra] = useState<Row[]>([]);
  const [add, setAdd] = useState("");
  const [gone, setGone] = useState<string[]>([]);
  // Someone added below and then saved comes back from the server in rows: show them once.
  const list = [...rows, ...extra.filter((x) => !rows.some((r) => r.userId === x.userId))].filter((r) => !gone.includes(r.userId));
  const candidates = others.filter((o) => !list.some((r) => r.userId === o.id));
  const addSelected = () => {
    const o = candidates.find((x) => x.id === add);
    if (!o) return;
    setGone(gone.filter((g) => g !== o.id));
    setExtra([...extra.filter((x) => x.userId !== o.id), { userId: o.id, name: o.name, role: o.role, saved: false, managerUserId: null, onIncentive: true, personId: o.personId, active: true, isManager: o.isManager, canGenerateLeads: false, canReassignTeam: false }]);
    setAdd("");
  };
  return (
    <section className="card overflow-x-auto">
      <div className="card-h"><div className="card-t">People who sell</div><span className="text-xs text-neutral-500">Only the people you add here get leads, managers and incentives</span></div>
      <table className="tbl">
        <thead><tr><th>Person</th><th>Manager (gets the manager %)</th><th className="text-center">On incentives</th><th>Paid through (People)</th><th className="text-center">In the lead rotation</th><th className="text-center">Can generate leads</th><th className="text-center">Can move team leads</th><th /></tr></thead>
        <tbody>
          {list.map((r) => (
            <MemberRow key={r.userId} row={r} managers={managers} people={people} onDrop={() => { setExtra(extra.filter((x) => x.userId !== r.userId)); setGone([...gone, r.userId]); }} />
          ))}
          {list.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-neutral-500">Nobody yet. Add the people who sell below.</td></tr>}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 px-5 py-3 text-sm">
        <select className="input max-w-xs" value={add} onChange={(e) => setAdd(e.target.value)} disabled={!candidates.length}>
          <option value="">{candidates.length ? "Add someone who sells…" : "Everyone who can sell is on the team"}</option>
          {candidates.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
        </select>
        <button type="button" className="btn-secondary btn-sm" disabled={!add} onClick={addSelected}>Add</button>
        <span className="text-xs text-neutral-500">Sales, sales-manager and owner logins. Then set them up and press Save.</span>
      </div>
      <p className="px-5 pb-4 text-xs text-neutral-500">
        In the lead rotation = gets leads handed out and rotated (inactive people get none). The two lead permissions are for sales managers; owners can always do both. Someone without a People record earns incentives but can&apos;t be paid until they have one (People → add, pay model &quot;Sales incentive only&quot; for incentive-only sellers). Salaried sellers get their incentives as a separate line in the same pay run.
      </p>
    </section>
  );
}
