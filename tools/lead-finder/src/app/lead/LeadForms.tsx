"use client";

import { useActionState, useState, useTransition } from "react";
import { CLIENT_CODE_HINT } from "@genclover/ids";
import { LOST_REASONS, STAGE_LABEL, STAGES } from "../../lib/services";
import { convertToClient, logActivity, saveLeadDetails, saveStage, setDoNotContact } from "../actions";

const Msg = ({ state }: { state: { ok: boolean; message: string } | undefined }) =>
  state ? <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span> : null;

export function StageForm({ id, stage, lostReason, nextFollowUpAt, doNotContact, canEdit }: { id: string; stage: string; lostReason: string | null; nextFollowUpAt: string | null; doNotContact: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveStage.bind(null, id), undefined);
  const [value, setValue] = useState(stage);
  const [dncPending, startDnc] = useTransition();
  return (
    <div className="card space-y-3 p-4">
      <div className="card-t">Stage & follow-up</div>
      <form action={action} className="space-y-3">
        <div>
          <label className="label" htmlFor="stage">Stage</label>
          <select id="stage" name="stage" className="input" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit || stage === "WON"}>
            {STAGES.filter((s) => s !== "WON" || stage === "WON").map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </div>
        {value === "LOST" && (
          <div>
            <label className="label" htmlFor="lostReason">Why was it lost?</label>
            <select id="lostReason" name="lostReason" className="input" defaultValue={lostReason ?? ""} disabled={!canEdit}>
              <option value="" disabled>Pick a reason…</option>
              {LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="nextFollowUpAt">Next follow-up</label>
          <input id="nextFollowUpAt" name="nextFollowUpAt" type="date" className="input" defaultValue={nextFollowUpAt?.slice(0, 10) ?? ""} disabled={!canEdit || doNotContact} />
          <p className="mt-1 text-xs text-neutral-500">Set automatically for day 1, 3 and 7 after the first message.</p>
        </div>
        {canEdit && stage !== "WON" && (
          <div className="flex items-center gap-3">
            <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            <Msg state={state} />
          </div>
        )}
      </form>
      {canEdit && (
        <button
          type="button"
          className={doNotContact ? "btn-secondary btn-sm w-full" : "btn-danger btn-sm w-full"}
          disabled={dncPending}
          onClick={() => startDnc(() => setDoNotContact(id, !doNotContact))}
        >
          {doNotContact ? "Allow contact again" : "⛔ Do not contact"}
        </button>
      )}
    </div>
  );
}

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
  const [state, action, pending] = useActionState(saveLeadDetails.bind(null, id), undefined);
  return (
    <form action={action} className="card space-y-3 p-4">
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

export function ConvertForm({ id, defaults }: { id: string; defaults: { name: string; code: string; contactName: string | null; email: string | null; phone: string | null; country: string; city: string | null } }) {
  const [state, action, pending] = useActionState(convertToClient.bind(null, id), undefined);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-primary w-full" onClick={() => setOpen(true)}>
        Won it? Convert to client →
      </button>
    );
  return (
    <form action={action} className="card space-y-3 border-brand p-4">
      <div className="card-t">Convert to client</div>
      <p className="text-xs text-neutral-500">Creates the client with its Client ID, marks this lead won, then opens a new project for it in the Financial System.</p>
      <div><label className="label" htmlFor="c-name">Client / company *</label><input id="c-name" name="name" className="input" defaultValue={defaults.name} required /></div>
      <div>
        <label className="label" htmlFor="c-code">Client code *</label>
        <input id="c-code" name="code" className="input font-mono uppercase" defaultValue={defaults.code} required maxLength={10} pattern="[A-Za-z][A-Za-z0-9]{1,9}" title={CLIENT_CODE_HINT} />
        <p className="mt-1 text-xs text-neutral-500">{CLIENT_CODE_HINT}. Used in project IDs, Jira and folders. Can&apos;t be changed later.</p>
      </div>
      <div><label className="label" htmlFor="c-contact">Contact person</label><input id="c-contact" name="contactName" className="input" defaultValue={defaults.contactName ?? ""} /></div>
      <div><label className="label" htmlFor="c-email">Email</label><input id="c-email" name="email" type="email" className="input" defaultValue={defaults.email ?? ""} /></div>
      <div><label className="label" htmlFor="c-phone">Phone</label><input id="c-phone" name="phone" className="input" defaultValue={defaults.phone ?? ""} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="c-country">Country</label><input id="c-country" name="country" className="input" defaultValue={defaults.country} /></div>
        <div><label className="label" htmlFor="c-city">City</label><input id="c-city" name="city" className="input" defaultValue={defaults.city ?? ""} /></div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Creating…" : "Create client"}</button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Msg state={state} />
    </form>
  );
}
