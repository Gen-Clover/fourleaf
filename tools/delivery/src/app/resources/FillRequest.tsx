"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelRequest, fillRequest } from "../actions";

/** Pick who fills a resource request: they're assigned to the project for the requested hours. */
export default function FillRequest({ id, people }: { id: string; people: { id: string; label: string }[] }) {
  const router = useRouter();
  const [personId, setPersonId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string } | undefined>) =>
    start(async () => {
      const r = await fn();
      setMsg(r?.ok ? null : (r?.message ?? null));
      if (r?.ok) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select className="input-sm w-56" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Person">
        <option value="">Pick a person…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <button type="button" className="btn-primary btn-sm" disabled={pending || !personId} onClick={() => run(() => fillRequest(id, personId))}>Assign</button>
      <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => cancelRequest(id, "Not needed"))}>Cancel</button>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </div>
  );
}
