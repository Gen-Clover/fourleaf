"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claudeBrief, markRepliedNow, saveClaudeAnswer, undoLoggedActivity } from "./moreActions";

/** The steps shown next to every Claude box, so anyone can do it without training. */
export function ClaudeSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-600">
      <li>
        Click <b>Copy for Claude</b> (or <b>Download .md</b>). It copies the instructions and the lead details together.
      </li>
      <li>
        Open <a className="text-brand-fg underline" href="https://claude.ai/new" target="_blank" rel="noreferrer">claude.ai</a> (or Claude Cowork / Code), paste it, and send.
      </li>
      <li>Copy Claude&apos;s whole answer (every block from &quot;### GL-…&quot; to &quot;END&quot;).</li>
      <li>
        Paste it below and click <b>Save review</b>. Each block is saved to its lead by the GL- ID; its message appears first in the composer.
      </li>
    </ol>
  );
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/** Copy/download a brief for these leads, and paste Claude's answer back. */
export function ClaudePanel({ ids, fileName, compact }: { ids: string[]; fileName: string; compact?: boolean }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const brief = (then: (text: string) => void) =>
    start(async () => {
      const r = await claudeBrief(ids);
      if (!r.ok) return setMsg({ ok: false, message: r.message });
      then(r.text);
    });
  return (
    <div className="space-y-3">
      {!compact && <ClaudeSteps />}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending || !ids.length}
          onClick={() =>
            brief(async (t) => {
              await navigator.clipboard.writeText(t);
              setMsg({ ok: true, message: `Copied the brief for ${ids.length} lead(s). Paste it into Claude.` });
            })
          }
        >
          Copy for Claude
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={pending || !ids.length} onClick={() => brief((t) => download(fileName, t))}>
          Download .md
        </button>
      </div>
      <textarea className="input font-mono text-xs" rows={compact ? 5 : 10} placeholder="Paste Claude's answer here…" value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Claude's answer" />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending || answer.trim().length < 10}
          onClick={() =>
            start(async () => {
              const r = await saveClaudeAnswer(answer);
              setMsg(r);
              if (r.ok) {
                setAnswer("");
                router.refresh();
              }
            })
          }
        >
          Save review
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
      </div>
    </div>
  );
}

/** Undo on a timeline entry that was logged by mistake. */
export function UndoButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="text-xs text-neutral-500 underline hover:text-brand-fg"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Undo this? It's removed from the timeline and the follow-up dates are recalculated.")) return;
          start(async () => {
            const r = await undoLoggedActivity(id);
            if (!r?.ok) setError(r?.message ?? "Couldn't undo");
            router.refresh();
          });
        }}
      >
        Undo
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </>
  );
}

/** "They replied" for WhatsApp and phone replies (email replies are found automatically). */
export function RepliedButton({ id, small }: { id: string; small?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`btn-secondary ${small ? "btn-sm" : ""}`}
      disabled={pending}
      onClick={() => {
        const note = window.prompt("They replied. What did they say? (optional)") ?? undefined;
        start(async () => {
          await markRepliedNow(id, note);
          router.refresh();
        });
      }}
    >
      💬 They replied
    </button>
  );
}
