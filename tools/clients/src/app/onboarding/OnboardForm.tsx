"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CLIENT_CODE_HINT, suggestClientCode } from "@genclover/ids";
import { checkCin, checkEin, checkGstin, LOOKUPS } from "@genclover/incentives/identity";
import type { ServiceLine } from "@genclover/incentives/rules";
import ServicesEditor from "@genclover/incentives/services-editor";
import { INDIAN_STATES } from "../../lib/agreements";
import { isIndia, taxNote } from "../../lib/taxProfile";
import { onboardDeal } from "../actions";

/** The sales incentive as recorded at Won, for the decision on this form. */
export type IncentiveDraft = {
  code: string | null;
  seller: string | null;
  manager: string | null;
  rates: string | null;
  services: ServiceLine[];
  picked: string | null;
  currency: string;
};
export type IncentiveAccess = { canApprove: boolean; canPropose: boolean; amounts: boolean };

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
export default function OnboardForm({
  deal,
  clients,
  takenCodes,
  companyState = "",
  incentive,
  access,
}: {
  deal: Deal;
  clients: { id: string; label: string }[];
  takenCodes: string[];
  companyState?: string;
  incentive: IncentiveDraft;
  access: IncentiveAccess;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [applies, setApplies] = useState(!!incentive.seller);
  const [lines, setLines] = useState(incentive.services);
  const [picked, setPicked] = useState<string | null>(incentive.picked);
  const [incNote, setIncNote] = useState("");
  const [ids, setIds] = useState({ cin: "", ein: "", verified: false, confirmedDifferent: false });
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
          {india ? (
            <label className="block">
              <span className="label">CIN / LLPIN (companies, LLPs)</span>
              <input className="input uppercase" value={ids.cin} onChange={(e) => setIds({ ...ids, cin: e.target.value.toUpperCase() })} placeholder="e.g. U72900PB2020PTC051234" />
            </label>
          ) : (
            <label className="block">
              <span className="label">EIN (from their W-9, if given)</span>
              <input className="input" value={ids.ein} onChange={(e) => setIds({ ...ids, ein: e.target.value })} placeholder="12-3456789" />
            </label>
          )}
          <div className="rounded-md bg-white px-3 py-2 text-xs text-neutral-600 md:col-span-3">
            <span className="font-medium">Business identity</span> stops the same business being onboarded twice (and earning a second incentive). Copy the numbers from their documents;
            free look-ups:{" "}
            {india ? (
              <>
                <a className="underline" href={LOOKUPS.gstin.url} target="_blank" rel="noreferrer">{LOOKUPS.gstin.label}</a> ·{" "}
                <a className="underline" href={LOOKUPS.cin.url} target="_blank" rel="noreferrer">{LOOKUPS.cin.label}</a>
              </>
            ) : (
              <a className="underline" href={LOOKUPS.ein.url} target="_blank" rel="noreferrer">{LOOKUPS.ein.label}</a>
            )}
            . Proprietorships and partnerships have no CIN: their GSTIN / PAN is the key.
            {[checkGstin(c.gstin), india ? checkCin(ids.cin) : checkEin(ids.ein)].filter(Boolean).map((m) => <div key={m} className="mt-1 text-red-600">{m}</div>)}
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={ids.verified} onChange={(e) => setIds({ ...ids, verified: e.target.checked })} /> I checked these numbers on the official site</label>
          </div>
          <label className="block md:col-span-3">
            <span className="label">Billing address (needed before the first invoice)</span>
            <textarea className="input" rows={2} value={c.billingAddress} onChange={(e) => setC({ ...c, billingAddress: e.target.value })} placeholder={india ? "Registered address, as on their GST certificate" : "Street, city, state, ZIP, country"} />
          </label>
          <p className="rounded-md bg-white px-3 py-2 text-neutral-700 md:col-span-3">
            <span className="font-medium">Invoices:</span> {taxNote({ country: c.country, state: c.state, gstin: c.gstin }, companyState || "Gen Clover's state")}
          </p>
        </div>
      )}
      <div className="space-y-3 rounded-md border border-neutral-200 bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-medium text-ink">Sales incentive{incentive.code && <span className="ml-2 font-mono text-xs text-neutral-500">{incentive.code}</span>}</div>
          <div className="text-xs text-neutral-500">
            Seller: <span className="font-medium text-neutral-800">{incentive.seller ?? "nobody (no owner)"}</span>
            {incentive.manager && <> · manager {incentive.manager}</>}
            {incentive.rates && <> · {incentive.rates}</>}
          </div>
        </div>
        {!access.canPropose ? (
          <p className="text-xs text-red-600">Your role can&apos;t record the incentive: an owner or the CFO onboards this deal.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={applies} onChange={() => setApplies(true)} disabled={!incentive.seller} /> Incentive applies (first service of a new client)</label>
              <label className="flex items-center gap-2"><input type="radio" checked={!applies} onChange={() => setApplies(false)} /> No incentive</label>
            </div>
            {applies && (
              <>
                <ServicesEditor lines={lines} onChange={setLines} picked={picked} onPick={setPicked} showValues={access.amounts} currency={incentive.currency} />
                <p className="text-xs text-neutral-500">
                  {access.amounts
                    ? "Enter the final agreed prices after negotiation (excluding GST and pass-through costs; monthly services at one month's fee). The highest-value service qualifies unless you pick another."
                    : "List the services sold. Prices are confirmed by an owner or the CFO, who then approves the incentive."}
                </p>
              </>
            )}
            <label className="block">
              <span className="label">{applies ? "Note (optional)" : "Why no incentive? *"}</span>
              <input className="input" value={incNote} onChange={(e) => setIncNote(e.target.value)} placeholder={applies ? "" : "e.g. existing client, walk-in handled by the founder"} />
            </label>
            <p className="text-xs text-neutral-500">{access.canApprove ? "Saving approves this decision." : "Saving sends it to an owner or the CFO for approval."} Every decision and any later change shows in the owner&apos;s incentive report.</p>
          </>
        )}
      </div>
      {mode === "new" && (
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" checked={ids.confirmedDifferent} onChange={(e) => setIds({ ...ids, confirmedDifferent: e.target.checked })} />
          Checked: different business (only if asked, when the website, phone or name matches an existing client)
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending || !access.canPropose}
          onClick={() =>
            start(async () => {
              const r = await onboardDeal({
                opportunityId: deal.opportunityId,
                leadId: deal.leadId,
                incentive: { applies, services: lines, pickedKey: picked, note: incNote },
                ...(mode === "existing"
                  ? { mode: "existing" as const, clientId }
                  : { mode: "new" as const, client: { ...c, cin: india ? ids.cin : "", ein: india ? "" : ids.ein, currency: c.currency as "INR" | "USD" }, confirmedDifferent: ids.confirmedDifferent, verified: ids.verified }),
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
