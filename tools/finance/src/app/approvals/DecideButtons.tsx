"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideApproval } from "./actions";

/** Approve (a note is required when approving your own request) or reject with a reason. */
export default function DecideButtons({ id, own }: { id: string; own: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (d: "APPROVED" | "REJECTED") =>
    start(async () => {
      const r = await decideApproval(id, d, note);
      setMsg(r?.ok ? null : (r?.message ?? null));
      if (r?.ok) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input className="input-sm w-56" placeholder={own ? "Note (required: your own request)" : "Note (required to reject)"} value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => go("APPROVED")}>Approve</button>
      <button type="button" className="btn-danger btn-sm" disabled={pending} onClick={() => go("REJECTED")}>Reject</button>
      {msg && <span className="w-full text-right text-xs text-red-600">{msg}</span>}
    </div>
  );
}
