"use client";

import { useState } from "react";
import { CLIENT_CODE_HINT, suggestClientCode } from "@genclover/ids";
import { INDIAN_STATES } from "../../lib/agreements";
import { isIndia, taxNote } from "../../lib/taxProfile";
import { saveClient } from "../actions";
import { useFormAction } from "@genclover/ui/form-action";

export type ClientFields = {
  id?: string;
  number?: string;
  code?: string;
  name?: string;
  legalName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  timezone?: string | null;
  website?: string | null;
  industry?: string | null;
  billingAddress?: string | null;
  gstin?: string | null;
  pan?: string | null;
  cin?: string | null;
  ein?: string | null;
  identityVerifiedBy?: string | null;
  currency?: string | null;
  paymentTermsDays?: number | null;
  accountManager?: string | null;
  notes?: string | null;
};

/**
 * Client record: identity, contact, billing and tax. The tax fields follow the country (see lib/taxProfile.ts):
 * Indian clients need the state (GST place of supply) and may have a GSTIN / PAN; clients abroad need neither.
 */
export default function ClientForm({
  client,
  readOnly,
  takenCodes = [],
  companyState = "",
  identityLocked = false,
}: {
  client?: ClientFields;
  readOnly?: boolean;
  takenCodes?: string[];
  companyState?: string;
  /** GSTIN, PAN, CIN, EIN: once the client is active only an owner may change them (they decide "new client"). */
  identityLocked?: boolean;
}) {
  const { state, pending, form } = useFormAction(saveClient);
  const [code, setCode] = useState("");
  const [country, setCountry] = useState(client?.country ?? "India");
  const [region, setRegion] = useState(client?.state ?? "");
  const [gstin, setGstin] = useState(client?.gstin ?? "");
  const india = isIndia(country);
  const f = (name: keyof ClientFields, label: string, opts: { type?: string; required?: boolean; placeholder?: string; upper?: boolean; hint?: string; locked?: boolean } = {}) => (
    <div>
      <label className="label">{label}{opts.required && " *"}</label>
      <input
        className={`input ${opts.upper ? "uppercase" : ""}`}
        name={opts.locked ? undefined : name}
        type={opts.type ?? "text"}
        defaultValue={(client?.[name] as string | number | null | undefined) ?? ""}
        required={opts.required}
        placeholder={opts.placeholder}
        disabled={readOnly || opts.locked}
      />
      {opts.locked && <input type="hidden" name={name} value={(client?.[name] as string | null | undefined) ?? ""} />}
      {opts.hint && <p className="mt-1 text-xs text-neutral-500">{opts.hint}</p>}
    </div>
  );
  const lockedHint = "Locked: only an owner can change it once the client is active";
  return (
    <form {...form} className="card space-y-5 p-5">
      {client?.id && <input type="hidden" name="id" value={client.id} />}
      <div className="grid gap-4 md:grid-cols-3">
        {client?.id && (
          <>
            <div>
              <label className="label">Client ID</label>
              <input className="input font-mono" value={client.number} disabled />
            </div>
            <div>
              <label className="label">Client code</label>
              <input className="input font-mono" value={client.code} disabled title="Locked: project IDs, Jira and folders use it" />
            </div>
            <div className="hidden md:block" />
          </>
        )}
        <div>
          <label className="label">Client / company *</label>
          <input
            className="input"
            name="name"
            defaultValue={client?.name ?? ""}
            required
            disabled={readOnly}
            onBlur={(e) => !client?.id && !code && setCode(suggestClientCode(e.target.value, new Set(takenCodes)))}
          />
        </div>
        {!client?.id && (
          <div>
            <label className="label">Client code *</label>
            <input
              className="input font-mono uppercase"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              maxLength={10}
              pattern="[A-Za-z][A-Za-z0-9]{1,9}"
              title={CLIENT_CODE_HINT}
            />
            <p className="mt-1 text-xs text-neutral-500">{CLIENT_CODE_HINT}. Used in project IDs (ABR-P01), Jira, folders and emails. Locked once created.</p>
          </div>
        )}
        {f("legalName", "Legal name (for invoices)")}
        {f("industry", "Industry")}
        {f("website", "Website")}
        {f("accountManager", "Account manager")}
      </div>

      <fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Primary contact</legend>
        {f("contactName", "Name")}
        {f("email", "Email", { type: "email" })}
        {f("phone", "Phone")}
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Billing and tax</legend>
        <div>
          <label className="label">Country *</label>
          <input className="input" name="country" value={country} onChange={(e) => setCountry(e.target.value)} required disabled={readOnly} list="countries" />
          <datalist id="countries">
            {["India", "USA", "United Kingdom", "Canada", "Australia", "UAE", "Singapore", "Germany"].map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        {india ? (
          <div>
            <label className="label">State (GST place of supply) *</label>
            <select className="input" name="state" value={region} onChange={(e) => setRegion(e.target.value)} required disabled={readOnly}>
              <option value="">Pick a state…</option>
              {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">State / province</label>
            <input className="input" name="state" value={region} onChange={(e) => setRegion(e.target.value)} placeholder={country.trim().toLowerCase().startsWith("us") ? "e.g. California" : ""} disabled={readOnly} />
          </div>
        )}
        {f("city", "City")}
        <div>
          <label className="label">Billing currency</label>
          <select className="input" name="currency" key={india ? "in" : "abroad"} defaultValue={client?.currency ?? (india ? "INR" : "USD")} disabled={readOnly}>
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
          </select>
          <p className="mt-1 text-xs text-neutral-500">{india ? "Usually INR. GST applies to Indian clients in any currency." : "Usually USD: export of services must be paid in foreign currency."}</p>
        </div>
        {india && (
          <>
            <div>
              <label className="label">GSTIN</label>
              <input className="input uppercase" name={identityLocked ? undefined : "gstin"} value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="e.g. 03ABCDE1234F1Z5" disabled={readOnly || identityLocked} />
              {identityLocked && <input type="hidden" name="gstin" value={gstin} />}
              <p className="mt-1 text-xs text-neutral-500">{identityLocked ? lockedHint : "Only if they are GST registered. Must be from the state picked."}</p>
            </div>
            {f("pan", "PAN", { placeholder: "e.g. ABCDE1234F", upper: true, hint: identityLocked ? lockedHint : "Optional. Filled in from the GSTIN if left empty.", locked: identityLocked })}
            {f("cin", "CIN / LLPIN", { placeholder: "e.g. U72900PB2020PTC051234", upper: true, hint: identityLocked ? lockedHint : "Companies and LLPs only (MCA register).", locked: identityLocked })}
          </>
        )}
        {!india && f("ein", "EIN (USA)", { placeholder: "12-3456789", hint: identityLocked ? lockedHint : "From the client's W-9, if they gave one.", locked: identityLocked })}
        {f("paymentTermsDays", "Payment terms (days)", { type: "number", placeholder: "Default from settings" })}
        {f("timezone", "Time zone", { placeholder: india ? "Asia/Kolkata" : "e.g. America/New_York" })}
      </fieldset>
      <p className="-mt-2 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        <span className="font-medium">Invoices:</span> {taxNote({ country, state: region, gstin }, companyState || "Gen Clover's state")}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Billing address{" "}<span className="font-normal text-neutral-500">(needed before the first invoice)</span></label>
          <textarea className="input" name="billingAddress" rows={3} defaultValue={client?.billingAddress ?? ""} placeholder={india ? "Registered address, as on their GST certificate" : "Street, city, state, ZIP, country"} disabled={readOnly} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" name="notes" rows={3} defaultValue={client?.notes ?? ""} disabled={readOnly} />
        </div>
      </div>
      {!readOnly && !client?.id && (
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" name="confirmedDifferent" /> Checked: different business (only if asked, when the website, phone or name matches an existing client)
        </label>
      )}
      {!readOnly && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : client?.id ? "Save client" : "Create client"}</button>
          {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
        </div>
      )}
    </form>
  );
}
