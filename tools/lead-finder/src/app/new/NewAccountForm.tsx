"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { B2B_SERVICES, COMPANY_SIZES, INDUSTRIES } from "../../lib/b2b";
import { SOURCES } from "../../lib/services";
import { addAccount } from "../salesActions";

/** A company account (B2B): typed in, from LinkedIn, a referral or an event. Contacts and deals are added after. */
export default function NewAccountForm() {
  const router = useRouter();
  const [f, setF] = useState({
    name: "", market: "IN", source: "LINKEDIN", website: "", industry: "", subIndustry: "", companySize: "", linkedinUrl: "", area: "",
    services: [] as string[], contactName: "", contactTitle: "", contactEmail: "", contactPhone: "", contactLinkedin: "", note: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </label>
  );
  const toggle = (s: string) => setF({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] });

  return (
    <div className="card max-w-4xl space-y-5 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        {input("name", "Company name *")}
        <label className="block">
          <span className="label">Market</span>
          <select className="input" value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })}>
            <option value="IN">India</option>
            <option value="US">USA</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Source</span>
          <select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            {Object.entries(SOURCES).filter(([k]) => k !== "MAPS" && k !== "IMPORT").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Industry</span>
          <select className="input" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
            <option value="">—</option>
            {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
          </select>
        </label>
        {input("subIndustry", "Sub-industry", { placeholder: "e.g. Dental equipment" })}
        <label className="block">
          <span className="label">Company size</span>
          <select className="input" value={f.companySize} onChange={(e) => setF({ ...f, companySize: e.target.value })}>
            <option value="">—</option>
            {COMPANY_SIZES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        {input("website", "Website", { placeholder: "company.com" })}
        {input("linkedinUrl", "Company LinkedIn page", { placeholder: "https://www.linkedin.com/company/…" })}
        {input("area", "City / country")}
      </div>

      <fieldset>
        <legend className="label">Services they may need</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(B2B_SERVICES).map(([k, v]) => (
            <button key={k} type="button" onClick={() => toggle(k)} className={`rounded-full border px-3 py-1 text-xs ${f.services.includes(k) ? "border-brand bg-brand-soft font-medium text-brand-fg" : "border-neutral-200 text-neutral-600"}`}>
              {v}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Main contact (more can be added later)</legend>
        {input("contactName", "Name")}
        {input("contactTitle", "Title", { placeholder: "Operations Director" })}
        {input("contactEmail", "Email", { type: "email" })}
        {input("contactPhone", "Phone")}
        <div className="md:col-span-2">{input("contactLinkedin", "LinkedIn profile", { placeholder: "https://www.linkedin.com/in/…" })}</div>
      </fieldset>

      <label className="block">
        <span className="label">Note</span>
        <textarea className="input" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="How you met them, what they said, what they need…" />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await addAccount(f);
              if (r?.ok && r.id) router.push(`/leads/${r.id}`);
              else setMsg(r?.message ?? null);
            })
          }
        >
          {pending ? "Adding…" : "Add company"}
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
      <p className="text-xs text-neutral-500">The account gets its own GL- ID and is assigned to you. Many at once? Use Import.</p>
    </div>
  );
}
