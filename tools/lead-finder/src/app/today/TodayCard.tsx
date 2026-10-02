"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NOT_FIT_REASONS, REPLY_CATEGORIES } from "../../lib/services";
import { Composer, type MessageOption } from "../Composer";
import { RepliedButton } from "../ClaudePanel";
import { ReplyForm } from "../lead/StagePanel";
import { skipForToday } from "../moreActions";
import { markNotFit, snoozeLead, sortReply } from "../stageActions";

type Props = {
  id: string;
  kind: "REPLY" | "FOLLOW_UP" | "NEW";
  replyCategory: string | null;
  replyDueAt: string | null;
  options: MessageOption[];
  whatsapp: string | null;
  email: string | null;
  emailFirst: boolean;
  smtp: boolean;
};

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

/**
 * One lead in the Today queue. Replies: sort what they said, then send a suggested answer (1-hour target).
 * Others: send, or skip / snooze / not a fit. The next lead appears.
 */
export default function TodayCard({ id, kind, replyCategory, replyDueAt, options, whatsapp, email, emailFirst, smtp }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notFit, setNotFit] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; message: string } | undefined | void>) =>
    start(async () => {
      const r = await fn();
      setMsg(r && !r.ok ? r.message : null);
      router.refresh();
    });
  const engaged = kind === "REPLY";
  const overdue = replyDueAt != null && new Date(replyDueAt).getTime() < Date.now();
  return (
    <div className="space-y-4">
      {replyDueAt && (
        <div className={`rounded-md px-3 py-2 text-sm ${overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          {overdue
            ? "⏱ Reply overdue: they wrote over an hour ago. Answer now."
            : `⏱ Answer by ${new Date(replyDueAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} (1-hour target)`}
        </div>
      )}
      {engaged && !replyCategory && <ReplyForm pending={pending} onSave={(category, until) => act(() => sortReply(id, { category, snoozeUntil: until }))} />}
      {engaged && replyCategory && (
        <p className="text-sm text-neutral-600">
          Reply: <b>{REPLY_CATEGORIES[replyCategory]?.label ?? replyCategory}</b>. Pick a suggested answer below.
        </p>
      )}
      {(!engaged || replyCategory) && (
        <Composer
          // Remount per lead so the editor starts with this lead's message.
          key={`${id}-${replyCategory ?? ""}`}
          leadId={id}
          options={options}
          whatsapp={whatsapp}
          email={email}
          emailFirst={emailFirst}
          smtp={smtp}
          doNotContact={false}
          canEdit
          onSent={() => router.refresh()}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4">
        {kind === "FOLLOW_UP" && <RepliedButton id={id} small />}
        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => act(() => skipForToday(id))}>
          {engaged ? "Handled for today" : "Skip for today"}
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => act(() => snoozeLead(id, inDays(30), "not now"))}>
          Not now (1 month)
        </button>
        {!engaged && (
          <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => setNotFit(!notFit)}>
            Not a fit…
          </button>
        )}
        <Link href={`/leads/${id}`} className="btn-secondary btn-sm">
          {engaged ? "Open lead: schedule a call, won / lost →" : "Open lead page →"}
        </Link>
      </div>
      {notFit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 p-3 text-sm">
          <select className="input-sm" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Why not a fit">
            <option value="" disabled>Why not a fit?</option>
            {NOT_FIT_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button type="button" className="btn-primary btn-sm" disabled={pending || !reason} onClick={() => act(() => markNotFit(id, { reason }))}>
            Mark not a fit
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
