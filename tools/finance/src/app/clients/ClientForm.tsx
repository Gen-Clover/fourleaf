"use client";

import { useActionState, useState } from "react";
import { CLIENT_CODE_HINT, suggestClientCode } from "@genclover/ids";
import { saveClient } from "./actions";

type C = {
  id?: string;
  number?: string;
  code?: string;
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  timezone?: string | null;
  website?: string | null;
  billingAddress?: string | null;
  notes?: string | null;
};

export default function ClientForm({ client, readOnly }: { client?: C; readOnly?: boolean }) {
  const [state, action, pending] = useActionState(saveClient, undefined);
  const [code, setCode] = useState("");
  const f = (name: keyof C, label: string, type = "text", required = false) => (
    <div>
      <label className="label">{label}{required && " *"}</label>
      <input className="input" name={name} type={type} defaultValue={(client?.[name] as string) ?? (name === "country" ? "USA" : "")} required={required} disabled={readOnly} />
    </div>
  );
  return (
    <form action={action} className="card space-y-4 p-5">
      {client?.id && <input type="hidden" name="id" value={client.id} />}
      <div className="grid gap-4 md:grid-cols-3">
        {client?.id ? (
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
        ) : null}
        <div>
          <label className="label">Client / Company *</label>
          <input
            className="input"
            name="name"
            defaultValue={client?.name ?? ""}
            required
            disabled={readOnly}
            onBlur={(e) => !client?.id && !code && setCode(suggestClientCode(e.target.value, new Set()))}
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
            <p className="mt-1 text-xs text-neutral-500">{CLIENT_CODE_HINT}. Used in project IDs (ABR-P01), Jira, folders and emails. Can&apos;t be changed later.</p>
          </div>
        )}
        {f("contactName", "Primary contact")}
        {f("email", "Email", "email")}
        {f("phone", "Phone")}
        {f("website", "Website")}
        {f("country", "Country")}
        {f("city", "City / State")}
        {f("timezone", "Timezone")}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Billing address</label>
          <textarea className="input" name="billingAddress" rows={3} defaultValue={client?.billingAddress ?? ""} disabled={readOnly} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" name="notes" rows={3} defaultValue={client?.notes ?? ""} disabled={readOnly} />
        </div>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : client?.id ? "Save client" : "Create client"}</button>
          {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
        </div>
      )}
    </form>
  );
}
