"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MEETING_OUTCOMES, TASK_TYPES } from "../../lib/services";
import { cancelTask, completeTask, scheduleTask } from "../stageActions";

export type TaskView = {
  id: string;
  type: string;
  dueAt: string;
  durationMin: number;
  link: string | null;
  agenda: string | null;
  assigneeName: string | null;
  googleLink: string;
  ics: string;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
/** Tomorrow 11:00 IST as a datetime-local value. */
const tomorrow11 = () => {
  const d = new Date(Date.now() + 86_400_000 + 330 * 60_000);
  return `${d.toISOString().slice(0, 10)}T11:00`;
};

/**
 * Calls, meetings and visits for this lead. They live in the portal: the assignee sees them on Today and
 * Tasks, gets an email (if email is set up), and can add them to their own calendar in one click.
 */
export function TasksCard({ leadId, tasks, users, meId, canEdit }: { leadId: string; tasks: TaskView[]; users: { id: string; name: string }[]; meId: string; canEdit: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [doing, setDoing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ type: "CALL", dueAt: tomorrow11(), durationMin: "30", link: "", agenda: "", assigneeId: meId });
  const run = (fn: () => Promise<{ ok: boolean; message: string } | undefined>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r ?? null);
      if (r?.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="card-t">Calls & meetings</div>
        {canEdit && !adding && <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}>+ Schedule</button>}
      </div>

      {adding && (
        <div className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label">What</span>
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Who</span>
              <select className="input" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === meId ? " (me)" : ""}</option>)}
              </select>
            </label>
            <label>
              <span className="label">When (IST)</span>
              <input type="datetime-local" className="input" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
            </label>
            <label>
              <span className="label">Minutes</span>
              <select className="input" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })}>
                {["15", "30", "45", "60", "90"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
          {f.type === "MEETING" && <input className="input" placeholder="Video link (Google Meet, Zoom…)" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />}
          <input className="input" placeholder="What it's about (optional)" value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={pending}
              onClick={() => run(() => scheduleTask(leadId, { ...f, durationMin: Number(f.durationMin), link: f.link || undefined, agenda: f.agenda || undefined }), () => setAdding(false))}
            >
              Schedule
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !adding && <p className="text-sm text-neutral-500">Nothing scheduled.</p>}
      <ul className="space-y-3">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
            <div className="font-medium text-neutral-900">{TASK_TYPES[t.type] ?? t.type} · {fmt(t.dueAt)}</div>
            <div className="text-xs text-neutral-500">
              {t.assigneeName ?? "Unassigned"} · {t.durationMin} min
              {t.link && (
                <>
                  {" · "}
                  <a className="text-brand-fg underline" href={t.link} target="_blank" rel="noreferrer">join link</a>
                </>
              )}
            </div>
            {t.agenda && <div className="mt-1 text-neutral-600">{t.agenda}</div>}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <a className="underline hover:text-brand-fg" href={t.googleLink} target="_blank" rel="noreferrer">Add to Google Calendar</a>
              <a className="underline hover:text-brand-fg" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(t.ics)}`} download="meeting.ics">Outlook / Apple (.ics)</a>
              {canEdit && (
                <>
                  <button type="button" className="underline hover:text-brand-fg" onClick={() => setDoing(doing === t.id ? null : t.id)}>Done: how did it go?</button>
                  <button type="button" className="underline hover:text-brand-fg" disabled={pending} onClick={() => run(() => cancelTask(t.id))}>Cancel</button>
                </>
              )}
            </div>
            {doing === t.id && <OutcomeForm pending={pending} onSave={(d) => run(() => completeTask(t.id, d), () => setDoing(null))} />}
          </li>
        ))}
      </ul>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p>}
    </div>
  );
}

/** The meeting-notes template: what they need, budget, who decides, when, and the outcome. */
export function OutcomeForm({ pending, onSave }: { pending: boolean; onSave: (d: { outcome: string; notes: Record<string, string>; snoozeUntil?: string }) => void }) {
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState({ needs: "", budget: "", decider: "", timeline: "", other: "" });
  const [until, setUntil] = useState(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const field = (k: keyof typeof notes, label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={notes[k]} onChange={(e) => setNotes({ ...notes, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-3">
      {field("needs", "What they need")}
      <div className="grid grid-cols-2 gap-2">
        {field("budget", "Budget")}
        {field("decider", "Who decides")}
      </div>
      {field("timeline", "When they want it")}
      {field("other", "Other notes")}
      <label className="block">
        <span className="label">Outcome</span>
        <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="" disabled>Pick one…</option>
          {Object.entries(MEETING_OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {outcome === "NOT_NOW" && <input type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Check back on" />}
      <button type="button" className="btn-primary btn-sm" disabled={pending || !outcome} onClick={() => onSave({ outcome, notes, snoozeUntil: outcome === "NOT_NOW" ? until : undefined })}>
        Save
      </button>
    </div>
  );
}
