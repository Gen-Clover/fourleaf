"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ISSUE_CATEGORIES, PRIORITIES } from "../../lib/governance";
import { saveIssue } from "../actions";

export type IssueInput = { id?: string; title: string; category: string; priority: string; projectId: string; description: string; impact: string; options: string; ownerId: string; dueDate: string };

/** Raise or edit an issue: what, who owns it, what it affects, options, by when. */
export default function IssueForm({ initial, projects, users }: { initial: IssueInput; projects: { id: string; label: string }[]; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof IssueInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block md:col-span-2"><span className="label">Issue *</span><input className="input" value={f.title} onChange={set("title")} placeholder="Two projects need the same developer next week" /></label>
        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={f.category} onChange={set("category")}>
            {Object.entries(ISSUE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">{ISSUE_CATEGORIES[f.category]?.owner}</span>
        </label>
        <label className="block">
          <span className="label">Priority</span>
          <select className="input" value={f.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Project</span>
          <select className="input" value={f.projectId} onChange={set("projectId")}>
            <option value="">— none —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Owner</span>
          <select className="input" value={f.ownerId} onChange={set("ownerId")}>
            <option value="">—</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Resolve by</span><input className="input" type="date" value={f.dueDate} onChange={set("dueDate")} /></label>
      </div>
      <label className="block"><span className="label">What happened</span><textarea className="input" rows={3} value={f.description} onChange={set("description")} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="label">Impact (people, delivery dates, money)</span><textarea className="input" rows={3} value={f.impact} onChange={set("impact")} /></label>
        <label className="block"><span className="label">Options considered</span><textarea className="input" rows={3} value={f.options} onChange={set("options")} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveIssue(f.id ?? null, f);
              if (r?.ok && r.id) {
                if (!f.id) router.push(`/issues/${r.id}`);
                else router.refresh();
                setMsg(null);
              } else setMsg(r?.message ?? null);
            })
          }
        >
          {pending ? "Saving…" : f.id ? "Save" : "Raise issue"}
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}
