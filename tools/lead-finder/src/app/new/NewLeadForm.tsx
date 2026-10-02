"use client";

import { SOURCES } from "../../lib/services";
import { addLead } from "../actions";
import { useFormAction } from "@genclover/ui/form-action";

export default function NewLeadForm({ niches }: { niches: { key: string; label: string }[] }) {
  const { state, pending, form } = useFormAction(addLead);
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}{props.required && " *"}</label>
      <input id={name} name={name} className="input" {...props} />
    </div>
  );
  return (
    <form {...form} className="card max-w-3xl space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        {field("name", "Business name", { required: true })}
        <div>
          <label className="label" htmlFor="market">Market</label>
          <select id="market" name="market" className="input" defaultValue="IN">
            <option value="IN">India</option>
            <option value="US">USA</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="source">How did you find them?</label>
          <select id="source" name="source" className="input" defaultValue="WALK_IN">
            {Object.entries(SOURCES).filter(([k]) => k !== "MAPS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="nicheKey">Niche</label>
          <select id="nicheKey" name="nicheKey" className="input" defaultValue="">
            <option value="">—</option>
            {niches.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
          </select>
        </div>
        {field("area", "Area / city", { placeholder: "Sector 35, Chandigarh" })}
        {field("contactName", "Contact person")}
        {field("phone", "Phone / WhatsApp", { placeholder: "+91 98…" })}
        {field("email", "Email", { type: "email" })}
        {field("website", "Website (if any)", { placeholder: "example.com" })}
      </div>
      <div>
        <label className="label" htmlFor="note">Note</label>
        <textarea id="note" name="note" className="input" rows={3} placeholder="What they said, what they need, when to follow up…" />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Adding…" : "Add lead"}</button>
        {state && !state.ok && <span className="text-sm text-red-600">{state.message}</span>}
      </div>
      <p className="text-xs text-neutral-500">The lead gets its own GL- ID. If you give a website, it&apos;s checked and scored automatically.</p>
    </form>
  );
}
