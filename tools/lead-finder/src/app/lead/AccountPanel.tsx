"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { B2B_SERVICES, COMPANY_SIZES, INDUSTRIES, serviceLabel } from "../../lib/b2b";
import { deleteLeadContact, saveAccountInfo, saveLeadContact } from "../salesActions";

type Result = { ok: boolean; message: string } | undefined;
type Contact = { id: string; name: string; title: string | null; email: string | null; phone: string | null; linkedinUrl: string | null; isPrimary: boolean; notes: string | null };
type Info = { kind: string; industry: string | null; subIndustry: string | null; companySize: string | null; linkedinUrl: string | null; services: string[] };

/** Company details (industry, size, LinkedIn, services they may need) and the people at the company. */
export default function AccountPanel({ leadId, info, contacts, canEdit }: { leadId: string; info: Info; contacts: Contact[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>(undefined);
  const [editInfo, setEditInfo] = useState(false);
  const [i, setI] = useState({ ...info, industry: info.industry ?? "", subIndustry: info.subIndustry ?? "", companySize: info.companySize ?? "", linkedinUrl: info.linkedinUrl ?? "" });
  const [editing, setEditing] = useState<string | null>(null);
  const blank = { name: "", title: "", email: "", phone: "", linkedinUrl: "", isPrimary: contacts.length === 0, notes: "" };
  const [c, setC] = useState(blank);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <section className="card">
      <div className="card-h">
        <div className="card-t">{info.kind === "B2B" ? "Company account" : "Contacts"}</div>
        {canEdit && !editInfo && <button type="button" className="text-xs underline" onClick={() => setEditInfo(true)}>{info.kind === "B2B" ? "Edit company details" : "Make it a company account"}</button>}
      </div>
      {editInfo ? (
        <div className="space-y-3 border-b border-neutral-200 p-4 text-sm">
          <div className="grid gap-2 md:grid-cols-3">
            <select className="input" value={i.kind} onChange={(e) => setI({ ...i, kind: e.target.value })} aria-label="Kind">
              <option value="LOCAL">Local business</option>
              <option value="B2B">Company account (B2B)</option>
            </select>
            <select className="input" value={i.industry} onChange={(e) => setI({ ...i, industry: e.target.value })} aria-label="Industry">
              <option value="">Industry…</option>
              {INDUSTRIES.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input className="input" placeholder="Sub-industry" value={i.subIndustry} onChange={(e) => setI({ ...i, subIndustry: e.target.value })} />
            <select className="input" value={i.companySize} onChange={(e) => setI({ ...i, companySize: e.target.value })} aria-label="Company size">
              <option value="">Size…</option>
              {COMPANY_SIZES.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input className="input md:col-span-2" placeholder="Company LinkedIn URL" value={i.linkedinUrl} onChange={(e) => setI({ ...i, linkedinUrl: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(B2B_SERVICES).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setI({ ...i, services: i.services.includes(k) ? i.services.filter((x) => x !== k) : [...i.services, k] })} className={`rounded-full border px-2.5 py-0.5 text-xs ${i.services.includes(k) ? "border-brand bg-brand-soft text-brand-fg" : "border-neutral-200 text-neutral-600"}`}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveAccountInfo(leadId, { ...i, kind: i.kind as "LOCAL" | "B2B" }), () => setEditInfo(false))}>Save</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditInfo(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        info.kind === "B2B" && (
          <div className="space-y-1 border-b border-neutral-200 px-5 py-3 text-sm">
            <div>
              {[info.industry, info.subIndustry, info.companySize && `${info.companySize} staff`].filter(Boolean).join(" · ") || "Industry not set"}
              {info.linkedinUrl && (
                <>
                  {" · "}
                  <a className="text-brand-fg underline" href={info.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn page</a>
                </>
              )}
            </div>
            <div className="text-xs text-neutral-500">May need: {info.services.map(serviceLabel).join(", ") || "not set"}</div>
          </div>
        )
      )}

      <ul className="divide-y divide-neutral-100">
        {contacts.map((x) => (
          <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-neutral-900">{x.name}{x.isPrimary && <span className="ml-2 badge bg-brand-soft text-brand-fg">primary</span>}</div>
              <div className="text-xs text-neutral-500">
                {[x.title, x.email, x.phone].filter(Boolean).join(" · ")}
                {x.linkedinUrl && (
                  <>
                    {" · "}
                    <a className="text-brand-fg underline" href={x.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>
                  </>
                )}
              </div>
            </div>
            {canEdit && (
              <span className="flex gap-3 text-xs">
                <button type="button" className="underline" onClick={() => { setEditing(x.id); setC({ name: x.name, title: x.title ?? "", email: x.email ?? "", phone: x.phone ?? "", linkedinUrl: x.linkedinUrl ?? "", isPrimary: x.isPrimary, notes: x.notes ?? "" }); }}>Edit</button>
                <button type="button" className="underline" disabled={pending} onClick={() => run(() => deleteLeadContact(x.id))}>Remove</button>
              </span>
            )}
          </li>
        ))}
        {contacts.length === 0 && <li className="px-5 py-3 text-sm text-neutral-500">No contacts yet.</li>}
      </ul>
      {canEdit &&
        (editing ? (
          <div className="grid gap-2 border-t border-neutral-200 p-4 text-sm md:grid-cols-3">
            {(["name", "title", "email", "phone", "linkedinUrl", "notes"] as const).map((k) => (
              <input key={k} className="input" placeholder={{ name: "Name *", title: "Title", email: "Email", phone: "Phone", linkedinUrl: "LinkedIn profile URL", notes: "Notes" }[k]} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
            ))}
            <label className="flex items-center gap-2"><input type="checkbox" checked={c.isPrimary} onChange={(e) => setC({ ...c, isPrimary: e.target.checked })} /> Primary (messages go to them)</label>
            <div className="flex gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveLeadContact(leadId, editing === "new" ? null : editing, c), () => setEditing(null))}>Save</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="border-t border-neutral-200 px-5 py-2.5">
            <button type="button" className="text-xs underline" onClick={() => { setEditing("new"); setC(blank); }}>+ Add a contact</button>
          </div>
        ))}
      {msg && !msg.ok && <p className="px-5 pb-3 text-sm text-red-600">{msg.message}</p>}
    </section>
  );
}
