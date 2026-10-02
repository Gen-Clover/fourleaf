"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addIssueNote, decideIssue, escalateIssue, setIssueStatus } from "../../actions";

type Result = { ok: boolean; message: string } | undefined;

/** Add a note, escalate a level, record the decision, close with lessons learned. */
export default function IssueControls({ id, status, level, canDecide }: { id: string; status: string; level: number; canDecide: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>(undefined);
  const [panel, setPanel] = useState<null | "note" | "escalate" | "decide" | "close">(null);
  const [text, setText] = useState("");
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        setPanel(null);
        setText("");
        router.refresh();
      }
    });
  const btn = (p: typeof panel, label: string) => (
    <button type="button" className="btn-secondary btn-sm" onClick={() => { setPanel(panel === p ? null : p); setText(""); }}>{label}</button>
  );
  const closed = status === "CLOSED";
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        {btn("note", "+ Note")}
        {!closed && status !== "IN_REVIEW" && <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setIssueStatus(id, "IN_REVIEW"))}>Mark in review</button>}
        {!closed && level < 4 && btn("escalate", `Escalate to level ${level + 1}`)}
        {!closed && canDecide && btn("decide", "Record decision")}
        {!closed && btn("close", "Close")}
        {closed && <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setIssueStatus(id, "OPEN"))}>Reopen</button>}
      </div>
      {panel && (
        <div className="space-y-2">
          <textarea
            className="input"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={{ note: "Update, evidence, what was agreed with whom…", escalate: "Why it needs the next level", decide: "The decision, who it affects, and what happens next", close: "Lessons learned / process change (optional)" }[panel]}
          />
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={pending}
            onClick={() =>
              run(() => (panel === "note" ? addIssueNote(id, text) : panel === "escalate" ? escalateIssue(id, text) : panel === "decide" ? decideIssue(id, text) : setIssueStatus(id, "CLOSED", text)))
            }
          >
            Save
          </button>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p>}
    </div>
  );
}
