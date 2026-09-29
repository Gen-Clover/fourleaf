"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STAGES } from "@genclover/ui/format";
import { activatePolicy, saveCurrentAsPolicy } from "./actions";

type Msg = { ok: boolean; message: string } | null;

export function ActivateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Make "${name}" the live allocation? New projects, the rate card coverage check and all future receipts will use it.`)) return;
          start(async () => {
            const r = await activatePolicy(id);
            setMsg(r ?? null);
            if (r?.ok) router.refresh();
          });
        }}
      >
        {pending ? "Activating…" : "Activate"}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
    </div>
  );
}

export function SaveAsPolicy() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", stage: "CUSTOM", description: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card p-5">
      <div className="card-t mb-3">Save the current allocation as a policy</div>
      <div className="grid gap-3 md:grid-cols-[1fr_10rem_2fr_auto] md:items-end">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div>
          <label className="label">Stage</label>
          <select className="input" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
            {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">Description</label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <button className="btn-primary" disabled={pending || !f.name} onClick={() => start(async () => { const r = await saveCurrentAsPolicy({ ...f, description: f.description || null }); setMsg(r ?? null); if (r?.ok) router.refresh(); })}>Save</button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p>}
      <p className="mt-2 text-xs text-neutral-500">To create a new policy: edit the percentages under Formula & Allocation, then save them here with a name. Saving with an existing name overwrites it.</p>
    </div>
  );
}
