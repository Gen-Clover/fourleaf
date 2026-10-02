"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideWeek } from "../../actions";

/** Approve, send back (with a reason), or reopen an approved week. */
export default function ApproveControls({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [back, setBack] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (d: "APPROVED" | "REJECTED" | "DRAFT") =>
    start(async () => {
      const r = await decideWeek(id, d, note);
      setMsg(r?.ok ? null : (r?.message ?? null));
      if (r?.ok) router.refresh();
    });
  if (status === "APPROVED") return <button type="button" className="text-xs underline" disabled={pending} onClick={() => run("DRAFT")}>Reopen</button>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {back ? (
        <>
          <input className="input-sm w-56" placeholder="What needs fixing?" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn-danger btn-sm" disabled={pending} onClick={() => run("REJECTED")}>Send back</button>
          <button type="button" className="text-xs underline" onClick={() => setBack(false)}>cancel</button>
        </>
      ) : (
        <>
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run("APPROVED")}>Approve</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setBack(true)}>Send back…</button>
        </>
      )}
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </div>
  );
}
