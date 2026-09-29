"use client";

import { useActionState } from "react";
import { saveClient } from "./actions";

type C = {
  id?: string;
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
        {f("name", "Client / Company", "text", true)}
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
