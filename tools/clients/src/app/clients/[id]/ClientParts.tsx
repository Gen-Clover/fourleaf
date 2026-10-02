"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ONBOARDING_CHECKLIST } from "../../../lib/agreements";
import { deleteContact, saveContact, setClientStatus, toggleChecklist } from "../../actions";

type Result = { ok: boolean; message: string } | undefined;

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>(undefined);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, msg, run };
}

const Msg = ({ msg }: { msg: Result }) => (msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p> : null);

/** Onboarding checklist: tick as each step is done; "Mark onboarded" makes the client active. */
export function Checklist({ clientId, done, status, canEdit }: { clientId: string; done: Record<string, boolean>; status: string; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const count = ONBOARDING_CHECKLIST.filter((i) => done[i.key]).length;
  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-baseline justify-between">
        <div className="card-t">Onboarding checklist</div>
        <span className="text-xs text-neutral-500">{count} of {ONBOARDING_CHECKLIST.length}</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-brand" style={{ width: `${(count / ONBOARDING_CHECKLIST.length) * 100}%` }} />
      </div>
      <ul className="space-y-1.5">
        {ONBOARDING_CHECKLIST.map((i) => (
          <li key={i.key}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={!!done[i.key]} disabled={!canEdit || pending} onChange={(e) => run(() => toggleChecklist(clientId, i.key, e.target.checked))} />
              <span className={done[i.key] ? "text-neutral-500 line-through" : ""}>{i.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3">
          {status !== "ACTIVE" && (
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => setClientStatus(clientId, "ACTIVE"))}>
              Mark onboarded (active)
            </button>
          )}
          {status === "ACTIVE" && (
            <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setClientStatus(clientId, "INACTIVE"))}>
              Mark inactive
            </button>
          )}
          {status === "INACTIVE" && (
            <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setClientStatus(clientId, "ACTIVE"))}>
              Reactivate
            </button>
          )}
        </div>
      )}
      <Msg msg={msg} />
    </div>
  );
}

type Contact = { id: string; name: string; title: string | null; email: string | null; phone: string | null; linkedinUrl: string | null; isPrimary: boolean; isBilling: boolean; notes: string | null };
const blank = { name: "", title: "", email: "", phone: "", linkedinUrl: "", isPrimary: false, isBilling: false, notes: "" };

/** People at the client: who decides, who approves, who pays. */
export function Contacts({ clientId, contacts, canEdit }: { clientId: string; contacts: Contact[]; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState(blank);
  const open = (c?: Contact) => {
    setEditing(c?.id ?? "new");
    setF(c ? { name: c.name, title: c.title ?? "", email: c.email ?? "", phone: c.phone ?? "", linkedinUrl: c.linkedinUrl ?? "", isPrimary: c.isPrimary, isBilling: c.isBilling, notes: c.notes ?? "" } : blank);
  };
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Contacts</div>
        {canEdit && editing === null && <button type="button" className="btn-secondary btn-sm" onClick={() => open()}>+ Contact</button>}
      </div>
      {editing !== null && (
        <div className="grid gap-2 border-b border-neutral-200 p-4 text-sm md:grid-cols-3">
          {(["name", "title", "email", "phone", "linkedinUrl", "notes"] as const).map((k) => (
            <input key={k} className="input" placeholder={{ name: "Name *", title: "Title / role", email: "Email", phone: "Phone", linkedinUrl: "LinkedIn URL", notes: "Notes" }[k]} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          ))}
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.isPrimary} onChange={(e) => setF({ ...f, isPrimary: e.target.checked })} /> Primary contact</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.isBilling} onChange={(e) => setF({ ...f, isBilling: e.target.checked })} /> Receives invoices</label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveContact(clientId, editing === "new" ? null : editing, f), () => setEditing(null))}>Save</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-neutral-100">
        {contacts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-neutral-900">
                {c.name}
                {c.isPrimary && <span className="ml-2 badge bg-brand-soft text-brand-fg">primary</span>}
                {c.isBilling && <span className="ml-1 badge bg-neutral-100 text-neutral-600">billing</span>}
              </div>
              <div className="text-xs text-neutral-500">
                {[c.title, c.email, c.phone].filter(Boolean).join(" · ")}
                {c.linkedinUrl && (
                  <>
                    {" · "}
                    <a className="text-brand-fg underline" href={c.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>
                  </>
                )}
              </div>
            </div>
            {canEdit && (
              <span className="flex gap-3 text-xs">
                <button type="button" className="underline" onClick={() => open(c)}>Edit</button>
                <button type="button" className="underline" disabled={pending} onClick={() => run(() => deleteContact(c.id))}>Remove</button>
              </span>
            )}
          </li>
        ))}
        {contacts.length === 0 && <li className="px-5 py-4 text-sm text-neutral-500">No contacts yet.</li>}
      </ul>
      {msg && !msg.ok && <div className="px-5 pb-3"><Msg msg={msg} /></div>}
    </div>
  );
}
