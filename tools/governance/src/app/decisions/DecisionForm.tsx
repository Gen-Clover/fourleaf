"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DECISION_TYPES } from "../../lib/governance";
import { saveDecision } from "../actions";

export default function DecisionForm({ me }: { me: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const blank = { title: "", type: "MANAGEMENT", date: new Date().toISOString().slice(0, 10), decision: "", decidedBy: me, reference: "", issueId: "" };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ Record a decision</button>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card mb-6 grid w-full gap-2 p-4 text-sm md:grid-cols-4">
      <input className="input md:col-span-2" placeholder="Title *" value={f.title} onChange={set("title")} />
      <select className="input" value={f.type} onChange={set("type")}>
        {Object.entries(DECISION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input className="input" type="date" value={f.date} onChange={set("date")} />
      <textarea className="input md:col-span-4" rows={3} placeholder="The decision *" value={f.decision} onChange={set("decision")} />
      <input className="input" placeholder="Decided by *" value={f.decidedBy} onChange={set("decidedBy")} />
      <input className="input md:col-span-2" placeholder="Reference (resolution no., minutes link)" value={f.reference} onChange={set("reference")} />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveDecision(f);
              if (r?.ok) {
                setOpen(false);
                setF(blank);
                router.refresh();
              } else setMsg(r?.message ?? null);
            })
          }
        >
          Save
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <p className="text-red-600 md:col-span-4">{msg}</p>}
    </div>
  );
}
