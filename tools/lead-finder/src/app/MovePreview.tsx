"use client";

// The check before any lead move (list, lead page, Distribute): what will move, what needs a reason, what can't,
// grouped by the stage rules in lib/distribution.ts. Nothing moves until it's confirmed here.
import { useEffect, useState, useTransition } from "react";
import { type MovePreview as Preview, moveTo, previewMove } from "./distributeActions";

type Scope = { ids?: string[]; query?: string };
type Msg = { ok: boolean; message: string };

const TONE: Record<string, string> = {
  FREE: "text-emerald-700",
  WARN: "text-amber-700",
  REASON: "text-amber-700",
  OWNER_REASON: "text-amber-700",
  FORCE: "text-red-600",
  BLOCKED: "text-red-600",
  SAME: "text-neutral-500",
};
const SHOW = 4;

export default function MovePreview({ scope, to, note, onClose, onDone }: { scope: Scope; to: string | null; note?: string; onClose: () => void; onDone: (m: Msg) => void }) {
  const [p, setP] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    previewMove({ ...scope, to }).then((r) => live && setP(r));
    return () => {
      live = false;
    };
    // The scope is fixed for the life of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = (cls: string) => p?.groups?.find((g) => g.cls === cls)?.leads.length ?? 0;
  const needReason = n("REASON") + n("OWNER_REASON") + (force ? n("FORCE") : 0);
  const willMove = n("FREE") + n("WARN") + (reason.trim() ? needReason : 0);
  const confirm = () =>
    start(async () => {
      setErr("");
      const r = await moveTo({ ...scope, to, note, reason: reason.trim() || undefined, force });
      if (r?.ok) onDone(r);
      else setErr(r?.message ?? "Nothing moved");
    });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Check the move" className="card w-full max-w-2xl shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-h">
          <div className="card-t">{p?.ok ? `Move to ${p.to}` : "Move leads"}</div>
          <button type="button" className="text-sm text-neutral-500 hover:underline" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-4 p-5 text-sm">
          {!p && <p className="text-neutral-500">Checking each lead…</p>}
          {p && !p.ok && <p className="text-red-600">{p.message}</p>}
          {p?.ok && (
            <>
              <p className="font-medium">
                {p.groups!.map((g) => `${g.leads.length} ${g.label.toLowerCase()}`).join(" · ")}
              </p>
              {p.groups!.map((g) => (
                <div key={g.cls}>
                  <div className={`font-medium ${TONE[g.cls]}`}>{g.label} ({g.leads.length})</div>
                  <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
                    {g.leads.slice(0, SHOW).map((l) => (
                      <li key={l.id}>
                        <span className="font-mono">{l.code}</span> {l.name}
                        {l.owner && <span className="text-neutral-500"> · {l.owner}</span>}
                        {l.note && <span className="text-neutral-500"> · {l.note}</span>}
                      </li>
                    ))}
                    {g.leads.length > SHOW && <li className="text-neutral-500">+{g.leads.length - SHOW} more</li>}
                  </ul>
                </div>
              ))}
              {n("FORCE") > 0 && (
                <label className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                  <span>Force-move the {n("FORCE")} won lead(s). Logged and flagged in the review; the incentive stays with the original seller unless you correct it on the incentive.</span>
                </label>
              )}
              {n("REASON") + n("OWNER_REASON") + n("FORCE") > 0 && (
                <label className="block">
                  <span className="label">Reason {needReason ? `(moves ${needReason} more; both people are told)` : ""}</span>
                  <input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Asha is on leave for two weeks" />
                </label>
              )}
              {n("BLOCKED") > 0 && <p className="text-xs text-neutral-500">Blocked leads are skipped and stay where they are.</p>}
              {n("WARN") + needReason > 0 && to && <p className="text-xs text-neutral-500">Open calls and meetings on these leads move to the new owner; the timeline records the move and the reason.</p>}
            </>
          )}
          {err && <p className="text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" disabled={pending || !p?.ok || !willMove} onClick={confirm}>
              {pending ? "Moving…" : willMove ? `Move ${willMove} lead(s)` : "Nothing to move"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
