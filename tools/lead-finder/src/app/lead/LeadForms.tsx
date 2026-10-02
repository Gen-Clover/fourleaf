"use client";

import { useState, useTransition } from "react";
import { logActivity, saveLeadDetails } from "../actions";
import { useFormAction } from "@genclover/ui/form-action";

const Msg = ({ state }: { state: { ok: boolean; message: string } | undefined }) =>
  state ? <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span> : null;

export function ActivityForm({ id, doNotContact }: { id: string; doNotContact: boolean }) {
  const [type, setType] = useState("NOTE");
  const [text, setText] = useState("");
  const [state, setState] = useState<{ ok: boolean; message: string } | undefined>();
  const [pending, start] = useTransition();
  const types: [string, string][] = [["NOTE", "Note"], ["CALL", "Call"], ["VISIT", "Visit"], ["WHATSAPP", "WhatsApp"], ["EMAIL", "Email"]];
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await logActivity(id, { type, text });
          setState(r);
          if (r?.ok) setText("");
        });
      }}
    >
      <select className="input-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
        {types.filter(([t]) => t === "NOTE" || !doNotContact).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
      </select>
      <input className="input-sm min-w-48 flex-1" placeholder={type === "NOTE" ? "Add a note…" : "What happened?"} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn-secondary btn-sm" disabled={pending || !text.trim()}>Log</button>
      {state && !state.ok && <Msg state={state} />}
    </form>
  );
}

type Details = { contactName: string | null; email: string | null; phone: string | null; website: string | null; nicheKey: string | null };

export function DetailsForm({ id, lead, niches, canEdit }: { id: string; lead: Details; niches: { key: string; label: string }[]; canEdit: boolean }) {
  const { state, pending, form } = useFormAction(saveLeadDetails.bind(null, id));
  return (
    <form {...form} className="card space-y-3 p-4">
      <div className="card-t">Contact details</div>
      <div><label className="label" htmlFor="contactName">Contact person</label><input id="contactName" name="contactName" className="input" defaultValue={lead.contactName ?? ""} disabled={!canEdit} /></div>
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" defaultValue={lead.email ?? ""} disabled={!canEdit} /></div>
      <div><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" className="input" defaultValue={lead.phone ?? ""} disabled={!canEdit} /></div>
      <div><label className="label" htmlFor="website">Website</label><input id="website" name="website" className="input" defaultValue={lead.website ?? ""} disabled={!canEdit} /></div>
      <div>
        <label className="label" htmlFor="nicheKey">Niche</label>
        <select id="nicheKey" name="nicheKey" className="input" defaultValue={lead.nicheKey ?? ""} disabled={!canEdit}>
          <option value="">—</option>
          {niches.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
      </div>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save details"}</button>
          <Msg state={state} />
        </div>
      )}
    </form>
  );
}
