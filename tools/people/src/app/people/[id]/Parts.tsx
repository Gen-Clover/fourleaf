"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadgeClient } from "@genclover/ui/status-badge";
import { DOC_STATUSES, DOC_TYPES, WORK_ORDER_PAY } from "../../../lib/pay";
import { deleteDocument, saveDocument, saveWorkOrder, toggleChecklist } from "../../actions";

type Result = { ok: boolean; message: string } | undefined;
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>(undefined);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, msg, run };
}
const tone = (s: string) => (s === "SIGNED" || s === "ACTIVE" ? "green" : s === "EXPIRED" ? "red" : s === "SENT" || s === "ISSUED" ? "amber" : "gray") as "green" | "red" | "amber" | "gray";
const d = (x: string | null) => (x ? x.slice(0, 10) : "");

type Doc = { id: string; type: string; title: string; status: string; documentUrl: string | null; signedAt: string | null; expiresAt: string | null; notes: string | null };

/** Offer letter, employment agreement, master contractor agreement, rate schedule, NDA, IP assignment… */
export function Documents({ personId, type, docs, canEdit }: { personId: string; type: string; docs: Doc[]; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const suggested = type === "EMPLOYEE" ? "OFFER_LETTER" : "MCA";
  const blank = { type: suggested, title: DOC_TYPES[suggested].label, status: "DRAFT", documentUrl: "", signedAt: "", expiresAt: "", notes: "" };
  const [f, setF] = useState(blank);
  const missing = Object.entries(DOC_TYPES).filter(([k, v]) => (v.for === type || (k === "NDA" || k === "IP_ASSIGNMENT")) && k !== "OTHER" && k !== "ID_PROOF" && k !== "TAX_FORM" && !docs.some((x) => x.type === k && x.status === "SIGNED"));
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Documents</div>
        {canEdit && editing === null && <button type="button" className="btn-secondary btn-sm" onClick={() => { setEditing("new"); setF(blank); }}>+ Document</button>}
      </div>
      {missing.length > 0 && <p className="border-b border-neutral-200 px-5 py-2 text-xs text-amber-700">Not signed yet: {missing.map(([, v]) => v.label).join(", ")}</p>}
      {editing !== null && (
        <div className="grid gap-2 border-b border-neutral-200 p-4 text-sm md:grid-cols-3">
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, title: DOC_TYPES[e.target.value].label })}>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input className="input" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {DOC_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
          <input className="input md:col-span-3" placeholder="Link to the document (Drive, SharePoint, e-sign)" value={f.documentUrl} onChange={(e) => setF({ ...f, documentUrl: e.target.value })} />
          <label className="block"><span className="label">Signed on</span><input className="input" type="date" value={f.signedAt} onChange={(e) => setF({ ...f, signedAt: e.target.value })} /></label>
          <label className="block"><span className="label">Expires on</span><input className="input" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></label>
          <input className="input self-end" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveDocument(personId, editing === "new" ? null : editing, f), () => setEditing(null))}>Save</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-neutral-100 text-sm">
        {docs.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
            <span className="min-w-0">
              <span className="font-medium">{x.title}</span> <span className="text-xs text-neutral-500">· {DOC_TYPES[x.type]?.label}</span>
              <div className="text-xs text-neutral-500">
                {x.signedAt && `signed ${d(x.signedAt)}`}{x.expiresAt && ` · expires ${d(x.expiresAt)}`}
                {x.documentUrl && <> · <a className="text-brand-fg underline" href={x.documentUrl} target="_blank" rel="noreferrer">open</a></>}
              </div>
            </span>
            <span className="flex items-center gap-3">
              <StatusBadgeClient label={x.status.charAt(0) + x.status.slice(1).toLowerCase()} tone={tone(x.status)} />
              {canEdit && (
                <>
                  <button type="button" className="text-xs underline" onClick={() => { setEditing(x.id); setF({ type: x.type, title: x.title, status: x.status, documentUrl: x.documentUrl ?? "", signedAt: d(x.signedAt), expiresAt: d(x.expiresAt), notes: x.notes ?? "" }); }}>Edit</button>
                  <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => deleteDocument(x.id))}>Remove</button>
                </>
              )}
            </span>
          </li>
        ))}
        {docs.length === 0 && <li className="px-5 py-4 text-neutral-500">No documents yet.</li>}
      </ul>
      {msg && !msg.ok && <p className="px-5 pb-3 text-sm text-red-600">{msg.message}</p>}
    </div>
  );
}

type WO = { id: string; code: string; projectId: string; projectLabel: string; role: string | null; expectedHoursPerMonth: number; startDate: string | null; endDate: string | null; payTreatment: string; fixedFeeInr: number | null; status: string; documentUrl: string | null; reportingTo: string | null; notes: string | null };

/** Contractor work orders: which project, how many hours, dates, and how it's paid. */
export function WorkOrders({ personId, orders, projects, canEdit, showFee, payModel }: { personId: string; orders: WO[]; projects: { id: string; label: string }[]; canEdit: boolean; showFee: boolean; payModel: string }) {
  const { pending, msg, run } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const defaultPay = payModel === "HOURLY" ? "HOURLY" : payModel === "FIXED_FEE" ? "FIXED_FEE" : "INCLUDED";
  const blank = { projectId: "", role: "", expectedHoursPerMonth: "80", startDate: "", endDate: "", payTreatment: defaultPay, fixedFeeInr: "", status: "ISSUED", documentUrl: "", reportingTo: "", notes: "" };
  const [f, setF] = useState(blank);
  const inp = (k: keyof typeof f, placeholder: string, type = "text") => <input className="input" type={type} placeholder={placeholder} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Work orders</div>
        {canEdit && editing === null && <button type="button" className="btn-secondary btn-sm" onClick={() => { setEditing("new"); setF(blank); }}>+ Work order</button>}
      </div>
      {editing !== null && (
        <div className="grid gap-2 border-b border-neutral-200 p-4 text-sm md:grid-cols-3">
          <select className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
            <option value="">Project *</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {inp("role", "Role on the project")}
          <label className="block"><span className="label">Expected hours / month</span>{inp("expectedHoursPerMonth", "80", "number")}</label>
          <label className="block"><span className="label">From</span>{inp("startDate", "", "date")}</label>
          <label className="block"><span className="label">To</span>{inp("endDate", "", "date")}</label>
          <label className="block">
            <span className="label">Pay for this work</span>
            <select className="input" value={f.payTreatment} onChange={(e) => setF({ ...f, payTreatment: e.target.value })}>
              {Object.entries(WORK_ORDER_PAY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {showFee && f.payTreatment === "FIXED_FEE" && <label className="block"><span className="label">Fixed fee ₹ (cost)</span>{inp("fixedFeeInr", "40000", "number")}</label>}
          <select className="input self-end" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {["DRAFT", "ISSUED", "ACTIVE", "CLOSED"].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
          {inp("reportingTo", "Reports to")}
          <div className="md:col-span-2">{inp("documentUrl", "Link to the signed work order")}</div>
          {inp("notes", "Scope / notes")}
          <div className="flex gap-2 md:col-span-3">
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveWorkOrder(personId, editing === "new" ? null : editing, f), () => setEditing(null))}>Save</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            <span className="text-xs text-neutral-500">Issued or active: they&apos;re added to the project team and can log time there.</span>
          </div>
        </div>
      )}
      <ul className="divide-y divide-neutral-100 text-sm">
        {orders.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
            <span className="min-w-0">
              <span className="font-mono text-xs">{w.code}</span> · <Link className="text-brand-fg hover:underline" href={`/projects/${w.projectId}`}>{w.projectLabel}</Link>
              <div className="text-xs text-neutral-500">
                {w.role && `${w.role} · `}{w.expectedHoursPerMonth} hrs/month{w.startDate && ` · from ${d(w.startDate)}`}{w.endDate && ` to ${d(w.endDate)}`} · {WORK_ORDER_PAY[w.payTreatment]}
                {showFee && w.fixedFeeInr != null && ` · ₹${w.fixedFeeInr.toLocaleString("en-IN")}`}
                {w.documentUrl && <> · <a className="text-brand-fg underline" href={w.documentUrl} target="_blank" rel="noreferrer">document</a></>}
              </div>
            </span>
            <span className="flex items-center gap-3">
              <StatusBadgeClient label={w.status.charAt(0) + w.status.slice(1).toLowerCase()} tone={tone(w.status)} />
              {canEdit && (
                <button type="button" className="text-xs underline" onClick={() => { setEditing(w.id); setF({ projectId: w.projectId, role: w.role ?? "", expectedHoursPerMonth: String(w.expectedHoursPerMonth), startDate: d(w.startDate), endDate: d(w.endDate), payTreatment: w.payTreatment, fixedFeeInr: w.fixedFeeInr == null ? "" : String(w.fixedFeeInr), status: w.status, documentUrl: w.documentUrl ?? "", reportingTo: w.reportingTo ?? "", notes: w.notes ?? "" }); }}>
                  Edit
                </button>
              )}
            </span>
          </li>
        ))}
        {orders.length === 0 && <li className="px-5 py-4 text-neutral-500">No work orders. Contractors work on a project under a work order.</li>}
      </ul>
      {msg && !msg.ok && <p className="px-5 pb-3 text-sm text-red-600">{msg.message}</p>}
    </div>
  );
}

/** Onboarding or exit checklist, ticked as each step is done. */
export function Checklist({ personId, list, title, items, done, canEdit }: { personId: string; list: "onboarding" | "offboarding"; title: string; items: { key: string; label: string }[]; done: Record<string, boolean>; canEdit: boolean }) {
  const { pending, run } = useRun();
  const n = items.filter((i) => done[i.key]).length;
  return (
    <div className="card space-y-2 p-5">
      <div className="flex items-baseline justify-between"><div className="card-t">{title}</div><span className="text-xs text-neutral-500">{n} of {items.length}</span></div>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.key}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={!!done[i.key]} disabled={!canEdit || pending} onChange={(e) => run(() => toggleChecklist(personId, list, i.key, e.target.checked))} />
              <span className={done[i.key] ? "text-neutral-500 line-through" : ""}>{i.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
