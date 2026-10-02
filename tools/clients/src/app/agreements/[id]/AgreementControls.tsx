"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAgreementVersion, setAgreementStatus } from "../../actions";

type Result = { ok: boolean; message: string } | undefined;
const NEXT: Record<string, string[]> = {
  DRAFT: ["SENT", "SIGNED"],
  SENT: ["SIGNED", "DRAFT"],
  SIGNED: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["EXPIRED", "TERMINATED", "SUPERSEDED"],
  EXPIRED: ["ACTIVE"],
  TERMINATED: [],
  SUPERSEDED: [],
};
const LABEL: Record<string, string> = { SENT: "Mark sent", SIGNED: "Mark signed", ACTIVE: "Mark active", EXPIRED: "Mark expired", TERMINATED: "Terminate", SUPERSEDED: "Superseded", DRAFT: "Back to draft" };

/** Quick status moves, and a new version of the document (after redlines or a renewal). */
export default function AgreementControls({ id, status, canVersion }: { id: string; status: string; canVersion: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>(undefined);
  const [v, setV] = useState<{ documentUrl: string; note: string } | null>(null);
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(NEXT[status] ?? []).map((s) => (
          <button key={s} type="button" className={s === "SIGNED" || s === "ACTIVE" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} disabled={pending} onClick={() => run(() => setAgreementStatus(id, s as never))}>
            {LABEL[s]}
          </button>
        ))}
        {canVersion && !v && <button type="button" className="btn-secondary btn-sm" onClick={() => setV({ documentUrl: "", note: "" })}>+ New version</button>}
      </div>
      {v && (
        <div className="grid gap-2 rounded-lg bg-neutral-50 p-3 text-sm md:grid-cols-[1fr_1fr_auto]">
          <input className="input" placeholder="Link to the new version" value={v.documentUrl} onChange={(e) => setV({ ...v, documentUrl: e.target.value })} />
          <input className="input" placeholder="What changed" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => addAgreementVersion(id, v), () => setV(null))}>Add</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setV(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p>}
    </div>
  );
}
