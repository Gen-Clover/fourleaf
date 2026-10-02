"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ADD_ONS, CARE_PLANS, LOST_REASONS, NOT_FIT_REASONS, PACKAGES, REPLY_CATEGORIES, STAGE_LABEL, WIN_REASONS } from "../../lib/services";
import { setDoNotContact } from "../actions";
import {
  assignOwner,
  markLost,
  markNotFit,
  markProposalSent,
  markWon,
  setFollowUp,
  setStage,
  snoozeLead,
  sortReply,
} from "../stageActions";

type Result = { ok: boolean; message: string } | undefined;
type Panel = null | "reply" | "won" | "lost" | "notfit" | "snooze" | "stage";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const QUICK_SNOOZE: [string, number][] = [["2 weeks", 14], ["1 month", 30], ["3 months", 91], ["6 months", 182]];

export type StagePanelProps = {
  id: string;
  stage: string;
  stageDays: number | null;
  replyCategory: string | null;
  replyDueAt: string | null;
  snoozeUntil: string | null;
  nextFollowUpAt: string | null;
  doNotContact: boolean;
  ownerId: string | null;
  ownerName?: string | null;
  /** People this user may move the lead to; empty = they can't move it (owner shown as text). */
  users: { id: string; name: string }[];
  canEdit: boolean;
  /** The open deal that winning marks won ("GO-2026-0001 · Web app"), or null when the Won form records a new one. */
  openDeal: string | null;
  /** May set a deal value (owners and finance; Sales on their own leads). */
  canSetValue: boolean;
  defaultCurrency: string;
};

/** The stage, how long it's been there, and the next steps as buttons that ask only what's needed. */
export default function StagePanel(p: StagePanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState<Panel>(null);
  const [msg, setMsg] = useState<Result>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        setOpen(null);
        router.refresh();
      }
    });
  const closed = ["WON", "LOST", "NOT_A_FIT"].includes(p.stage);
  const replyOverdue = p.replyDueAt && new Date(p.replyDueAt).getTime() < Date.now();

  const btn = (panel: Panel, label: string, primary = false) => (
    <button type="button" className={`${primary ? "btn-primary" : "btn-secondary"} btn-sm`} disabled={!p.canEdit} onClick={() => setOpen(open === panel ? null : panel)}>
      {label}
    </button>
  );

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="card-t">Stage</div>
        <span className="text-xs text-neutral-500">{p.stageDays == null ? "" : p.stageDays === 0 ? "since today" : `for ${p.stageDays} day${p.stageDays === 1 ? "" : "s"}`}</span>
      </div>
      <div className="text-base font-semibold text-ink">{STAGE_LABEL[p.stage] ?? p.stage}</div>
      {p.replyDueAt && (
        <div className={`rounded-md px-3 py-2 text-sm ${replyOverdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          {replyOverdue ? "⏱ Reply overdue: they wrote over an hour ago. Answer now." : `⏱ Answer by ${new Date(p.replyDueAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} (1-hour target)`}
        </div>
      )}
      {p.stage === "SNOOZED" && p.snoozeUntil && <div className="text-sm text-neutral-600">Back on {new Date(p.snoozeUntil).toLocaleDateString("en-IN", { dateStyle: "medium" })}</div>}

      {p.canEdit && !p.doNotContact && (
        <div className="flex flex-wrap gap-1.5">
          {p.stage === "REPLIED" && btn("reply", p.replyCategory ? `Reply: ${REPLY_CATEGORIES[p.replyCategory]?.label}` : "Sort the reply", !p.replyCategory)}
          {["REPLIED", "MEETING"].includes(p.stage) && (
            <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => markProposalSent(p.id))}>
              Proposal sent
            </button>
          )}
          {!closed && btn("won", "Won", p.stage === "PROPOSAL")}
          {!closed && btn("lost", "Lost")}
          {!closed && btn("notfit", "Not a fit")}
          {!closed && btn("snooze", p.stage === "SNOOZED" ? "Change snooze" : "Not now (snooze)")}
          {btn("stage", "Correct stage")}
        </div>
      )}

      {open === "reply" && <ReplyForm pending={pending} onSave={(category, until) => run(() => sortReply(p.id, { category, snoozeUntil: until }))} />}
      {open === "won" && <WonForm pending={pending} openDeal={p.openDeal} canSetValue={p.canSetValue} defaultCurrency={p.defaultCurrency} onSave={(d) => run(() => markWon(p.id, d))} />}
      {open === "lost" && <LostForm pending={pending} onSave={(d) => run(() => markLost(p.id, d))} />}
      {open === "notfit" && (
        <ReasonForm reasons={NOT_FIT_REASONS} label="Why aren't they a fit?" note="They won't be added again by future searches." pending={pending} onSave={(reason) => run(() => markNotFit(p.id, { reason }))} />
      )}
      {open === "snooze" && <SnoozeForm pending={pending} onSave={(until, note) => run(() => snoozeLead(p.id, until, note))} />}
      {open === "stage" && (
        <ReasonForm
          reasons={["NEW", "QUALIFIED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL"]}
          labels={STAGE_LABEL}
          label="Set the stage (for corrections)"
          note="Won, Lost, Not a fit and Snooze have their own buttons."
          pending={pending}
          onSave={(stage) => run(() => setStage(p.id, stage))}
        />
      )}

      {p.canEdit && (
        <div className="grid gap-3 border-t border-neutral-200 pt-3">
          <label className="text-sm">
            <span className="label">Owner</span>
            {p.users.length ? (
              <select className="input" value={p.ownerId ?? ""} disabled={pending} onChange={(e) => e.target.value && run(() => assignOwner([p.id], e.target.value))}>
                {!p.ownerId && <option value="">In the pool (nobody)</option>}
                {p.ownerId && !p.users.some((u) => u.id === p.ownerId) && <option value={p.ownerId}>{p.ownerName ?? "Current owner"}</option>}
                {p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <div className="input bg-neutral-50">{p.ownerName ?? "In the pool"}</div>
            )}
          </label>
          {!closed && p.stage !== "SNOOZED" && (
            <label className="text-sm">
              <span className="label">Next follow-up</span>
              <input
                type="date"
                className="input"
                defaultValue={p.nextFollowUpAt?.slice(0, 10) ?? ""}
                disabled={pending || p.doNotContact}
                onChange={(e) => run(() => setFollowUp(p.id, e.target.value || null))}
              />
            </label>
          )}
          <button
            type="button"
            className={p.doNotContact ? "btn-secondary btn-sm" : "btn-danger btn-sm"}
            disabled={pending}
            onClick={() => start(async () => { await setDoNotContact(p.id, !p.doNotContact); router.refresh(); })}
          >
            {p.doNotContact ? "Allow contact again" : "⛔ Do not contact"}
          </button>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p>}
    </div>
  );
}

export function ReplyForm({ pending, onSave }: { pending: boolean; onSave: (category: string, until?: string) => void }) {
  const [category, setCategory] = useState("");
  const [until, setUntil] = useState(inDays(30));
  return (
    <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
      <div className="text-xs font-medium text-neutral-600">What did they say?</div>
      <div className="grid gap-1.5">
        {Object.entries(REPLY_CATEGORIES).map(([k, v]) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="radio" name="reply" checked={category === k} onChange={() => setCategory(k)} className="mt-1" />
            <span>
              {v.label} <span className="text-xs text-neutral-500">· {v.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {category === "NOT_NOW" && (
        <label className="block text-sm">
          <span className="label">Check back on</span>
          <input type="date" className="input" value={until} min={inDays(1)} onChange={(e) => setUntil(e.target.value)} />
        </label>
      )}
      <button type="button" className="btn-primary btn-sm" disabled={pending || !category} onClick={() => onSave(category, category === "NOT_NOW" ? until : undefined)}>
        Save
      </button>
    </div>
  );
}

type WonInput = { pkg: string; carePlan: string; addOns: string[]; reason: string; note?: string; value?: string; currency?: string };

function WonForm({ pending, openDeal, canSetValue, defaultCurrency, onSave }: { pending: boolean; openDeal: string | null; canSetValue: boolean; defaultCurrency: string; onSave: (d: WonInput) => void }) {
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [pkg, setPkg] = useState("Growth");
  const [carePlan, setCarePlan] = useState("Care Plus");
  const [addOns, setAddOns] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm">
      <div className="text-xs text-neutral-600">What did they buy? The client is created later, in Client Onboarding.</div>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">Package</span>
          <select className="input" value={pkg} onChange={(e) => setPkg(e.target.value)}>{PACKAGES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label>
          <span className="label">Care plan</span>
          <select className="input" value={carePlan} onChange={(e) => setCarePlan(e.target.value)}>{CARE_PLANS.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
      </div>
      <fieldset>
        <legend className="label">Add-ons</legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {ADD_ONS.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={addOns.includes(a)} onChange={(e) => setAddOns(e.target.checked ? [...addOns, a] : addOns.filter((x) => x !== a))} />
              {a}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="label">Why did we win?</span>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="" disabled>Pick one…</option>
          {WIN_REASONS.map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      {openDeal ? (
        <div className="text-xs text-neutral-600">Deal <b>{openDeal}</b> is marked won, with the value it already has.</div>
      ) : (
        canSetValue && (
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2">
              <span className="label">Deal value (optional)</span>
              <input className="input" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="40000" />
            </label>
            <label>
              <span className="label">Currency</span>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>INR</option>
                <option>USD</option>
              </select>
            </label>
          </div>
        )
      )}
      <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={pending || !reason}
        onClick={() => onSave({ pkg, carePlan, addOns, reason, note: note || undefined, ...(!openDeal && canSetValue && value ? { value, currency } : {}) })}
      >
        Mark as won
      </button>
    </div>
  );
}

function LostForm({ pending, onSave }: { pending: boolean; onSave: (d: { reason: string; competitor?: string; retryAt?: string }) => void }) {
  const [reason, setReason] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [retry, setRetry] = useState("");
  return (
    <div className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm">
      <label className="block">
        <span className="label">Why was it lost?</span>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="" disabled>Pick one…</option>
          {LOST_REASONS.map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Who got the work? (only if you know)</span>
        <input className="input" placeholder="Leave empty if unknown or nobody" value={competitor} onChange={(e) => setCompetitor(e.target.value)} />
      </label>
      <div>
        <span className="label">Try again later? (optional)</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {[["3 months", 91], ["6 months", 182]].map(([l, d]) => (
            <button key={l} type="button" className="btn-secondary btn-sm" onClick={() => setRetry(inDays(Number(d)))}>{l}</button>
          ))}
          <input type="date" className="input-sm" value={retry} min={inDays(1)} onChange={(e) => setRetry(e.target.value)} aria-label="Try again on" />
          {retry && <button type="button" className="text-xs underline" onClick={() => setRetry("")}>no</button>}
        </div>
        {retry && <p className="mt-1 text-xs text-neutral-500">They come back into Today as a fresh lead on {retry}.</p>}
      </div>
      <button type="button" className="btn-primary btn-sm" disabled={pending || !reason} onClick={() => onSave({ reason, competitor: competitor || undefined, retryAt: retry || undefined })}>
        Mark as lost
      </button>
    </div>
  );
}

function SnoozeForm({ pending, onSave }: { pending: boolean; onSave: (until: string, note?: string) => void }) {
  const [until, setUntil] = useState(inDays(30));
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm">
      <div className="text-xs text-neutral-600">Out of the queue until then; back in Today on that date.</div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_SNOOZE.map(([l, d]) => (
          <button key={l} type="button" className={`btn-secondary btn-sm ${until === inDays(d) ? "border-brand" : ""}`} onClick={() => setUntil(inDays(d))}>{l}</button>
        ))}
      </div>
      <input type="date" className="input" value={until} min={inDays(1)} onChange={(e) => setUntil(e.target.value)} aria-label="Snooze until" />
      <input className="input" placeholder="Why / what they said (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="btn-primary btn-sm" disabled={pending || !until} onClick={() => onSave(until, note || undefined)}>
        Snooze
      </button>
    </div>
  );
}

function ReasonForm({ reasons, labels, label, note, pending, onSave }: { reasons: string[]; labels?: Record<string, string>; label: string; note?: string; pending: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm">
      <label className="block">
        <span className="label">{label}</span>
        <select className="input" value={v} onChange={(e) => setV(e.target.value)}>
          <option value="" disabled>Pick one…</option>
          {reasons.map((r) => <option key={r} value={r}>{labels?.[r] ?? r}</option>)}
        </select>
      </label>
      {note && <p className="text-xs text-neutral-500">{note}</p>}
      <button type="button" className="btn-primary btn-sm" disabled={pending || !v} onClick={() => onSave(v)}>Save</button>
    </div>
  );
}
