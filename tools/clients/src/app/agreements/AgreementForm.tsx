"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AGREEMENT_STATUSES, AGREEMENT_TYPES } from "../../lib/agreements";
import { saveAgreement } from "../actions";

export type AgreementInput = {
  id?: string;
  code?: string;
  type: string;
  clientId: string;
  projectId: string;
  parentId: string;
  title: string;
  status: string;
  documentUrl: string;
  scopeSummary: string;
  estimatedHours: string;
  value: string;
  currency: string;
  signedAt: string;
  effectiveFrom: string;
  expiresAt: string;
  renewalNoticeDays: string;
  ownerName: string;
  notes: string;
};

type Opt = { id: string; label: string; clientId: string };

/** One form for every agreement type; fields that don't apply to the type are hidden. */
export default function AgreementForm({
  initial,
  clients,
  projects,
  parents,
  showMoney,
  allowedTypes,
  readOnly,
}: {
  initial: AgreementInput;
  clients: { id: string; label: string; currency: string }[];
  projects: Opt[];
  parents: (Opt & { type: string })[];
  showMoney: boolean;
  allowedTypes: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const t = AGREEMENT_TYPES[f.type];
  const set = (k: keyof AgreementInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const clientProjects = projects.filter((p) => p.clientId === f.clientId);
  const parentOptions = parents.filter((p) => p.clientId === f.clientId && p.id !== f.id && (f.type === "CR" ? ["SOW", "RESOURCE", "SUPPORT"].includes(p.type) : p.type === "MSA"));
  const input = (k: keyof AgreementInput, label: string, type = "text", hint?: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" type={type} value={f[k] ?? ""} onChange={set(k)} disabled={readOnly} />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );

  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="label">Type *</span>
          <select className="input" value={f.type} onChange={set("type")} disabled={readOnly || !!f.id}>
            {allowedTypes.map((k) => <option key={k} value={k}>{AGREEMENT_TYPES[k].label}</option>)}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">{t?.hint}</span>
        </label>
        <label className="block">
          <span className="label">Client *</span>
          <select className="input" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, projectId: "", parentId: "", currency: clients.find((c) => c.id === e.target.value)?.currency ?? f.currency })} disabled={readOnly || !!f.id}>
            <option value="">Pick…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Project{t?.scope === "PROJECT" ? " *" : " (optional)"}</span>
          <select className="input" value={f.projectId} onChange={set("projectId")} disabled={readOnly || (!!f.id && t?.scope === "PROJECT")}>
            <option value="">{clientProjects.length ? "Pick…" : "No projects for this client yet"}</option>
            {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <div className="md:col-span-2">{input("title", "Title *")}</div>
        <label className="block">
          <span className="label">Status</span>
          <select className="input" value={f.status} onChange={set("status")} disabled={readOnly}>
            {AGREEMENT_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        {(f.type === "SOW" || f.type === "CR" || f.type === "RESOURCE" || f.type === "SUPPORT") && (
          <label className="block">
            <span className="label">{f.type === "CR" ? "Changes" : "Under"}</span>
            <select className="input" value={f.parentId} onChange={set("parentId")} disabled={readOnly}>
              <option value="">{f.type === "CR" ? "Pick the SOW it changes…" : "Pick the MSA (optional)…"}</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
        {input("documentUrl", "Document link", "url", "Google Drive, SharePoint or e-sign link. New versions are added on the agreement page.")}
        {input("ownerName", "Owner (who handles it)")}
      </div>

      {t?.scope === "PROJECT" && (
        <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
          <label className="block">
            <span className="label">{f.type === "CR" ? "What changes (scope, timeline, deliverables)" : f.type === "ACCEPTANCE" ? "What is accepted, and any open items" : "Scope: in and out"}</span>
            <textarea className="input" rows={4} value={f.scopeSummary} onChange={set("scopeSummary")} disabled={readOnly} />
          </label>
          {f.type !== "ACCEPTANCE" && input("estimatedHours", "Estimated hours", "number", "Delivery plans against this")}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {input("signedAt", "Signed on", "date")}
        {input("effectiveFrom", "Effective from", "date")}
        {input("expiresAt", "Expires / renews on", "date")}
        {input("renewalNoticeDays", "Remind days before expiry", "number")}
      </div>

      {showMoney && f.type !== "NDA" && f.type !== "ACCEPTANCE" && (
        <div className="grid gap-4 rounded-lg border border-neutral-200 p-3 md:grid-cols-[1fr_8rem]">
          {input("value", f.type === "CR" ? "Price of the change (finance only)" : "Contract value (finance only)", "number")}
          <label className="block">
            <span className="label">Currency</span>
            <select className="input" value={f.currency} onChange={set("currency")} disabled={readOnly}>
              <option>INR</option>
              <option>USD</option>
            </select>
          </label>
        </div>
      )}

      <label className="block">
        <span className="label">Notes</span>
        <textarea className="input" rows={2} value={f.notes} onChange={set("notes")} disabled={readOnly} />
      </label>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const payload = Object.fromEntries(Object.entries(f).filter(([k]) => !["id", "code"].includes(k))) as Record<string, string>;
                const r = await saveAgreement(f.id ?? null, payload);
                setMsg(r ?? null);
                if (r?.ok && r.id) {
                  if (!f.id) router.push(`/agreements/${r.id}`);
                  else router.refresh();
                }
              })
            }
          >
            {pending ? "Saving…" : f.id ? "Save" : "Create agreement"}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
    </div>
  );
}
