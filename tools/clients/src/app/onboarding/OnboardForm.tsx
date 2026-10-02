"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CLIENT_CODE_HINT, suggestClientCode } from "@genclover/ids";
import { INDIAN_STATES } from "../../lib/agreements";
import { isIndia, taxNote } from "../../lib/taxProfile";
import { onboardDeal } from "../actions";

export type Deal = {
  opportunityId?: string;
  leadId?: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string;
  industry: string | null;
};

/** Turn one won deal into a client: a new client (ID + code) or another project for an existing client. */
export default function OnboardForm({ deal, clients, takenCodes, companyState = "" }: { deal: Deal; clients: { id: string; label: string }[]; takenCodes: string[]; companyState?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [clientId, setClientId] = useState("");
  const [c, setC] = useState({
    name: deal.name,
    code: suggestClientCode(deal.name, new Set(takenCodes)),
    legalName: "",
    contactName: deal.contactName ?? "",
    email: deal.email ?? "",
    phone: deal.phone ?? "",
    website: deal.website ?? "",
    country: deal.country,
    state: "",
    city: "",
    industry: deal.industry ?? "",
    currency: isIndia(deal.country) ? "INR" : "USD",
    gstin: "",
    pan: "",
    billingAddress: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const india = isIndia(c.country);
  const input = (k: keyof typeof c, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={c[k]} onChange={(e) => setC({ ...c, [k]: k === "code" ? e.target.value.toUpperCase() : e.target.value })} {...extra} />
    </label>
  );

  if (!open) return <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>Onboard →</button>;
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-neutral-50 p-4 text-sm">
      <div className="flex gap-4">
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New client</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={!clients.length} /> Existing client (another project)</label>
      </div>
      {mode === "existing" ? (
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Pick the client…</option>
          {clients.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {input("name", "Client / company *")}
          <label className="block">
            <span className="label">Client code *</span>
            <input className="input font-mono uppercase" value={c.code} maxLength={10} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} title={CLIENT_CODE_HINT} />
            <span className="mt-1 block text-xs text-neutral-500">{CLIENT_CODE_HINT}. Locked once created.</span>
          </label>
          {input("legalName", "Legal name (for invoices)")}
          {input("contactName", "Primary contact")}
          {input("email", "Email", { type: "email" })}
          {input("phone", "Phone")}
          {input("country", "Country *")}
          {india ? (
            <label className="block">
              <span className="label">State (GST place of supply) *</span>
              <select className="input" value={c.state} onChange={(e) => setC({ ...c, state: e.target.value })}>
                <option value="">Pick…</option>
                {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          ) : (
            input("state", "State / province")
          )}
          {input("city", "City")}
          <label className="block">
            <span className="label">Billing currency</span>
            <select className="input" value={c.currency} onChange={(e) => setC({ ...c, currency: e.target.value })}>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>
          {india && input("gstin", "GSTIN (if GST registered)", { placeholder: "e.g. 03ABCDE1234F1Z5" })}
          {india && input("pan", "PAN (optional)", { placeholder: "From the GSTIN if empty" })}
          <label className="block md:col-span-3">
            <span className="label">Billing address (needed before the first invoice)</span>
            <textarea className="input" rows={2} value={c.billingAddress} onChange={(e) => setC({ ...c, billingAddress: e.target.value })} placeholder={india ? "Registered address, as on their GST certificate" : "Street, city, state, ZIP, country"} />
          </label>
          <p className="rounded-md bg-white px-3 py-2 text-neutral-700 md:col-span-3">
            <span className="font-medium">Invoices:</span> {taxNote({ country: c.country, state: c.state, gstin: c.gstin }, companyState || "Gen Clover's state")}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await onboardDeal({
                opportunityId: deal.opportunityId,
                leadId: deal.leadId,
                ...(mode === "existing" ? { mode: "existing" as const, clientId } : { mode: "new" as const, client: { ...c, currency: c.currency as "INR" | "USD" } }),
              });
              setMsg(r ?? null);
              if (r?.ok && r.clientId) router.push(`/clients/${r.clientId}`);
            })
          }
        >
          {pending ? "Creating…" : mode === "new" ? "Create client" : "Link to client"}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        {msg && !msg.ok && <span className="text-red-600">{msg.message}</span>}
      </div>
    </div>
  );
}
