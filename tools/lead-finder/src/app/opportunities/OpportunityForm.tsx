"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { B2B_SERVICES, OPP_MODELS, OPP_STAGES } from "../../lib/b2b";
import { LOST_REASONS } from "../../lib/services";
import { saveOpportunity } from "../salesActions";

export type OppInput = {
  id?: string;
  leadId: string;
  clientId: string;
  title: string;
  services: string[];
  model: string;
  stage: string;
  probability: string;
  value: string;
  currency: string;
  expectedCloseAt: string;
  ownerId: string;
  source: string;
  nextStep: string;
  lostReason: string;
  notes: string;
};

/** Create or edit a deal. The value field shows only for people allowed to see this deal's value. */
export default function OpportunityForm({ initial, users, showValue, locked }: { initial: OppInput; users: { id: string; name: string }[]; showValue: boolean; locked?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof OppInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (s: string) => setF({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] });
  const input = (k: keyof OppInput, label: string, type = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" type={type} value={f[k] as string} onChange={set(k)} disabled={locked} {...extra} />
    </label>
  );
  const save = (stage?: string) =>
    start(async () => {
      const body = { ...f, ...(stage ? { stage, probability: "" } : {}) };
      const r = await saveOpportunity(f.id ?? null, body);
      setMsg(r ?? null);
      if (r?.ok && r.id) {
        if (!f.id) router.push(`/leads/opportunities/${r.id}`);
        else {
          if (stage) setF({ ...f, stage, probability: "" });
          router.refresh();
        }
      }
    });

  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">{input("title", "What is the work? *", "text", { placeholder: "e.g. Data migration to the new ERP" })}</div>
        <label className="block">
          <span className="label">How it&apos;s sold</span>
          <select className="input" value={f.model} onChange={set("model")} disabled={locked}>
            {Object.entries(OPP_MODELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Stage</span>
          <select className="input" value={f.stage} onChange={set("stage")} disabled={locked}>
            {Object.entries(OPP_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {input("probability", `Chance of winning % (default ${OPP_STAGES[f.stage]?.probability ?? 0})`, "number", { min: 0, max: 100 })}
        {input("expectedCloseAt", "Expected to close", "date")}
        {showValue ? (
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            {input("value", "Deal value", "number", { min: 0 })}
            <label className="block">
              <span className="label">Currency</span>
              <select className="input" value={f.currency} onChange={set("currency")} disabled={locked}>
                <option>INR</option>
                <option>USD</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="text-xs text-neutral-500 md:pt-6">The deal value is visible to its owner and to owners / CFO.</div>
        )}
        <label className="block">
          <span className="label">Owner</span>
          <select className="input" value={f.ownerId} onChange={set("ownerId")} disabled={locked}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        {input("nextStep", "Next step", "text", { placeholder: "Send the proposal by Friday" })}
      </div>
      <fieldset>
        <legend className="label">Services</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(B2B_SERVICES).map(([k, v]) => (
            <button key={k} type="button" disabled={locked} onClick={() => toggle(k)} className={`rounded-full border px-3 py-1 text-xs ${f.services.includes(k) ? "border-brand bg-brand-soft font-medium text-brand-fg" : "border-neutral-200 text-neutral-600"}`}>
              {v}
            </button>
          ))}
        </div>
      </fieldset>
      {f.stage === "LOST" && (
        <label className="block">
          <span className="label">Why lost? *</span>
          <select className="input" value={f.lostReason} onChange={set("lostReason")} disabled={locked}>
            <option value="">Pick…</option>
            {LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Notes (needs, budget, who decides, timeline)</span>
        <textarea className="input" rows={4} value={f.notes} onChange={set("notes")} disabled={locked} />
      </label>
      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => save()}>{pending ? "Saving…" : f.id ? "Save" : "Create opportunity"}</button>
          {f.id && f.stage !== "WON" && (
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => save("WON")}>Mark won → onboarding</button>
          )}
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
    </div>
  );
}
