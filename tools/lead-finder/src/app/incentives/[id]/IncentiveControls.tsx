"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ServicesEditor from "@genclover/incentives/services-editor";
import type { ServiceLine } from "@genclover/incentives/rules";
import { STATUS } from "@genclover/incentives/rules";
import { adjustIncentive, approveIncentive, correctIncentive, linkInvoice } from "../../incentiveActions";

type Msg = { ok: boolean; message: string } | null;

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Msg | undefined>) =>
    start(async () => {
      const r = (await fn()) ?? null;
      setMsg(r);
      if (r?.ok) router.refresh();
    });
  return { msg, pending, run };
}

const Note = ({ msg }: { msg: Msg }) => (msg ? <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span> : null);

/** Approve or refuse a proposed incentive, with the negotiated prices. */
export function ApprovePanel({ id, services, picked, currency, proposedEligible, hasSeller }: { id: string; services: ServiceLine[]; picked: string | null; currency: string; proposedEligible: boolean | null; hasSeller: boolean }) {
  const [lines, setLines] = useState(services);
  const [pick, setPick] = useState<string | null>(picked);
  const [note, setNote] = useState("");
  const { msg, pending, run } = useAction();
  return (
    <section className="card mb-6 p-5">
      <div className="mb-1 font-medium text-ink">Decide this incentive</div>
      <p className="mb-3 text-sm text-neutral-500">
        {proposedEligible == null ? "Not proposed at onboarding yet." : proposedEligible ? "Onboarding proposed an incentive." : "Onboarding proposed no incentive."} Set the agreed prices (excluding GST); the
        qualifying service is the highest-value one unless you pick another.{!hasSeller && " This deal has no seller: set one under Correct before approving."}
      </p>
      <ServicesEditor lines={lines} onChange={setLines} picked={pick} onPick={setPick} showValues currency={currency} />
      <label className="mt-3 block">
        <span className="label">Note (required for no incentive, or when it&apos;s your own deal)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => approveIncentive(id, { approve: true, note, services: lines, pickedKey: pick }))}>Approve</button>
        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => approveIncentive(id, { approve: false, note, services: lines, pickedKey: pick }))}>No incentive</button>
        <Note msg={msg} />
      </div>
    </section>
  );
}

type Inv = { id: string; number: string; status: string; total: string; issueDate: string };

/** Invoices counted towards the incentive; an owner can add or remove one (future receipts only). */
export function InvoiceLinks({ id, manage, linked, others }: { id: string; manage: boolean; linked: Inv[]; others: Inv[] }) {
  const { msg, pending, run } = useAction();
  const [reason, setReason] = useState("");
  return (
    <div className="p-5 text-sm">
      {linked.length === 0 ? (
        <p className="text-neutral-500">None yet. The first invoice paid by this client after the win is counted automatically.</p>
      ) : (
        <ul className="space-y-1">
          {linked.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{i.number}</span> <span className="text-neutral-500">{i.issueDate} · {i.total} · {i.status.toLowerCase()}</span>
              {manage && <button type="button" className="text-xs text-red-600 hover:underline" disabled={pending} onClick={() => run(() => linkInvoice(id, i.id, false, reason))}>Stop counting</button>}
            </li>
          ))}
        </ul>
      )}
      {manage && others.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Client&apos;s other invoices</div>
          <ul className="space-y-1">
            {others.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{i.number}</span> <span className="text-neutral-500">{i.issueDate} · {i.total} · {i.status.toLowerCase()}</span>
                <button type="button" className="text-xs text-brand-fg hover:underline" disabled={pending} onClick={() => run(() => linkInvoice(id, i.id, true, reason))}>Count it</button>
              </li>
            ))}
          </ul>
          <input className="input mt-2 max-w-md" placeholder="Reason (goes in the change report)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="mt-1 text-xs text-neutral-500">Only receipts recorded after the change are affected. For a receipt already recorded, add an adjustment below.</p>
        </div>
      )}
      <div className="mt-2"><Note msg={msg} /></div>
    </div>
  );
}

type Current = {
  sellerUserId: string | null;
  managerUserId: string | null;
  sellerRatePct: number;
  managerRatePct: number;
  status: string;
  projectId: string | null;
  currency: string;
  services: ServiceLine[];
  picked: string | null;
};

/** The owner's controls: change anything (with a reason), and add or recover money by hand. */
export function OwnerPanel({ id, users, projects, current }: { id: string; users: { id: string; name: string }[]; projects: { id: string; label: string }[]; current: Current }) {
  const [f, setF] = useState(current);
  const [reason, setReason] = useState("");
  const [adj, setAdj] = useState({ role: "SELLER" as "SELLER" | "MANAGER", amount: "", reason: "" });
  const save = useAction();
  const add = useAction();
  const changed = JSON.stringify(f) !== JSON.stringify(current);
  const patch = () => {
    const p: Record<string, unknown> = {};
    for (const k of ["sellerUserId", "managerUserId", "sellerRatePct", "managerRatePct", "status", "projectId", "currency"] as const) if (f[k] !== current[k]) p[k] = f[k];
    if (JSON.stringify(f.services) !== JSON.stringify(current.services)) p.services = f.services;
    if (f.picked !== current.picked) p.pickedKey = f.picked;
    return p;
  };
  const sel = (k: "sellerUserId" | "managerUserId", label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value || null })}>
        <option value="">— none —</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </label>
  );
  return (
    <section className="card mb-6 p-5">
      <div className="mb-1 font-medium text-ink">Owner: correct this incentive</div>
      <p className="mb-3 text-sm text-neutral-500">Any change needs a reason and shows in the review report. Money already earned stays; a new seller or manager takes over what isn&apos;t paid yet; cancelling reverses what isn&apos;t paid.</p>
      <div className="grid gap-3 md:grid-cols-4">
        {sel("sellerUserId", "Seller")}
        {sel("managerUserId", "Manager")}
        <label className="block"><span className="label">Seller %</span><input className="input" type="number" min={0} max={50} step="0.5" value={f.sellerRatePct} onChange={(e) => setF({ ...f, sellerRatePct: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Manager %</span><input className="input" type="number" min={0} max={50} step="0.5" value={f.managerRatePct} onChange={(e) => setF({ ...f, managerRatePct: Number(e.target.value) })} /></label>
        <label className="block">
          <span className="label">Status</span>
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Only this project&apos;s invoices</span>
          <select className="input" value={f.projectId ?? ""} onChange={(e) => setF({ ...f, projectId: e.target.value || null })}>
            <option value="">Any of the client&apos;s invoices</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Currency of the prices</span>
          <select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
      </div>
      <div className="mt-4">
        <ServicesEditor lines={f.services} onChange={(services) => setF({ ...f, services })} picked={f.picked} onPick={(picked) => setF({ ...f, picked })} showValues currency={f.currency} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block min-w-64 flex-1"><span className="label">Reason *</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. price renegotiated to ₹45,000 on 3 Oct" /></label>
        <button type="button" className="btn-primary btn-sm" disabled={!changed || save.pending} onClick={() => save.run(() => correctIncentive(id, patch(), reason))}>Save correction</button>
        <Note msg={save.msg} />
      </div>

      <div className="mt-6 border-t border-neutral-100 pt-4">
        <div className="mb-2 text-sm font-medium text-ink">Adjustment</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="label">For</span>
            <select className="input" value={adj.role} onChange={(e) => setAdj({ ...adj, role: e.target.value as "SELLER" | "MANAGER" })}>
              <option value="SELLER">Seller</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>
          <label className="block"><span className="label">₹ (negative to recover)</span><input className="input w-36" type="number" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></label>
          <label className="block min-w-64 flex-1"><span className="label">Reason *</span><input className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
          <button type="button" className="btn-secondary btn-sm" disabled={add.pending} onClick={() => add.run(() => adjustIncentive(id, { role: adj.role, amountInr: Number(adj.amount), reason: adj.reason }))}>Add</button>
          <Note msg={add.msg} />
        </div>
      </div>
    </section>
  );
}
