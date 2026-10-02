"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { OutcomeForm } from "../lead/TasksCard";
import { cancelTask, completeTask, wakeNow } from "../stageActions";

type Result = { ok: boolean; message: string } | undefined;

/** Done (with the notes template) or cancel, right from the Tasks list. */
export function TaskActions({ id, googleLink, ics }: { id: string; googleLink: string; ics: string }) {
  const router = useRouter();
  const [doing, setDoing] = useState(false);
  const [msg, setMsg] = useState<Result>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        setDoing(false);
        router.refresh();
      }
    });
  return (
    <div className="text-xs">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <a className="underline hover:text-brand-fg" href={googleLink} target="_blank" rel="noreferrer">Google Calendar</a>
        <a className="underline hover:text-brand-fg" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`} download="meeting.ics">.ics</a>
        <button type="button" className="underline hover:text-brand-fg" onClick={() => setDoing(!doing)}>Done…</button>
        <button type="button" className="underline hover:text-brand-fg" disabled={pending} onClick={() => run(() => cancelTask(id))}>Cancel</button>
      </div>
      {doing && <OutcomeForm pending={pending} onSave={(d) => run(() => completeTask(id, d))} />}
      {msg && !msg.ok && <p className="mt-1 text-red-600">{msg.message}</p>}
    </div>
  );
}

/** Bring a snoozed lead back into Today now. */
export function WakeButton({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Result>(undefined);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await wakeNow(id);
            setMsg(r);
            if (r?.ok) router.refresh();
          })
        }
      >
        Wake now
      </button>
      {msg && !msg.ok && <span className="text-xs text-red-600">{msg.message}</span>}
    </span>
  );
}
