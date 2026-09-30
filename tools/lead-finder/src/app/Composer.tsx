"use client";

import { useState, useTransition } from "react";
import { emailLink, whatsappLink } from "../lib/messages";
import { logActivity } from "./actions";
import { sendEmailNow } from "./moreActions";

export type MessageOption = { key: string; label: string; service: string | null; subject: string; text: string };

/**
 * Pick a message (per service, or Claude's), edit it, then open WhatsApp or send the email.
 * WhatsApp is always sent by a person: the link opens WhatsApp with the text; it's logged once they confirm they sent it.
 * Email goes out from the portal when SMTP is set up, otherwise it opens your email app.
 */
export function Composer({
  leadId,
  options,
  whatsapp,
  email,
  emailFirst,
  smtp,
  doNotContact,
  canEdit,
  onSent,
}: {
  leadId: string;
  options: MessageOption[];
  whatsapp: string | null;
  email: string | null;
  emailFirst: boolean;
  smtp: boolean;
  doNotContact: boolean;
  canEdit: boolean;
  onSent?: () => void;
}) {
  const [key, setKey] = useState(options[0]?.key ?? "");
  const current = options.find((o) => o.key === key);
  const [text, setText] = useState(current?.text ?? "");
  const [subject, setSubject] = useState(current?.subject ?? "");
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">(emailFirst && email ? "EMAIL" : whatsapp ? "WHATSAPP" : email ? "EMAIL" : "WHATSAPP");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // WhatsApp and your email app can't tell us whether you pressed send, so we ask before logging it.
  const [awaiting, setAwaiting] = useState<"WHATSAPP" | "EMAIL" | null>(null);
  const [pending, start] = useTransition();
  if (!current) return <p className="text-sm text-neutral-500">No opportunity found yet. The message appears once the website check finds something to offer.</p>;
  const blocked = doNotContact || !canEdit;

  const log = (type: "WHATSAPP" | "EMAIL") =>
    start(async () => {
      const r = await logActivity(leadId, { type, text: type === "EMAIL" ? `${subject}\n\n${text}` : text, service: current.service });
      setMsg(r ?? null);
      if (r?.ok) {
        setAwaiting(null);
        onSent?.();
      }
    });
  const send = () =>
    start(async () => {
      const r = await sendEmailNow(leadId, { subject, text, service: current.service });
      setMsg(r ?? null);
      if (r?.ok) onSent?.();
    });

  return (
    <div className="space-y-3">
      {options.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setKey(o.key);
                setText(o.text);
                setSubject(o.subject);
              }}
              className={`rounded-full border px-3 py-1 text-xs ${o.key === key ? "border-brand bg-brand-soft font-medium text-brand-fg" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1 text-xs" role="radiogroup" aria-label="Channel">
        {(["WHATSAPP", "EMAIL"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={channel === c}
            onClick={() => setChannel(c)}
            className={`rounded-md px-2.5 py-1 ${channel === c ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-900"}`}
          >
            {c === "WHATSAPP" ? "WhatsApp" : "Email"}
          </button>
        ))}
      </div>
      {channel === "EMAIL" && <input className="input" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={blocked} />}
      <textarea className="input font-sans text-sm leading-relaxed" rows={10} value={text} onChange={(e) => setText(e.target.value)} disabled={blocked} aria-label="Message" />
      {doNotContact ? (
        <p className="text-sm text-red-600">This business is on the do-not-contact list.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {channel === "WHATSAPP" &&
            (whatsapp ? (
              <a className={`btn-primary btn-sm ${blocked || pending ? "pointer-events-none opacity-50" : ""}`} href={whatsappLink(whatsapp, text)} target="_blank" rel="noreferrer" onClick={() => setAwaiting("WHATSAPP")}>
                Open in WhatsApp
              </a>
            ) : (
              <span className="text-xs text-neutral-500">No phone number for WhatsApp.</span>
            ))}
          {channel === "EMAIL" &&
            (!email ? (
              <span className="text-xs text-neutral-500">No email address. Add one under Contact details.</span>
            ) : smtp ? (
              <button type="button" className="btn-primary btn-sm" disabled={blocked || pending} onClick={send}>
                {pending ? "Sending…" : `Send email to ${email}`}
              </button>
            ) : (
              <a className={`btn-primary btn-sm ${blocked || pending ? "pointer-events-none opacity-50" : ""}`} href={emailLink(email, subject, text)} onClick={() => setAwaiting("EMAIL")}>
                Open in email app
              </a>
            ))}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(channel === "EMAIL" ? `${subject}\n\n${text}` : text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
      {awaiting && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          <span>Did you send it {awaiting === "WHATSAPP" ? "in WhatsApp" : "from your email app"}? It&apos;s only logged (and follow-ups scheduled) when you confirm.</span>
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => log(awaiting)}>
            Yes, I sent it
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAwaiting(null)}>
            No, not sent
          </button>
        </div>
      )}
      {channel === "EMAIL" && smtp && <p className="text-xs text-neutral-500">Your business address and a line saying they can reply &quot;unsubscribe&quot; to opt out are added at the bottom.</p>}
    </div>
  );
}
