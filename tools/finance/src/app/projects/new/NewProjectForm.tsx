"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MODELS } from "../../../lib/calc";
import { createProject } from "../actions";

export default function NewProjectForm({ clients, defaultClient }: { clients: { id: string; name: string }[]; defaultClient?: string }) {
  const [state, action, pending] = useActionState(createProject, undefined);
  return (
    <form action={action} className="card space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Project name *</label>
          <input className="input" name="name" required />
        </div>
        <div>
          <label className="label">Client * <Link href="/clients/new" className="ml-2 text-brand-fg">+ new client</Link></label>
          <select className="input" name="clientId" defaultValue={defaultClient ?? ""} required>
            <option value="" disabled>Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Engagement model</label>
          <select className="input" name="engagementModel" defaultValue="TM">
            {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Start date</label><input className="input" type="date" name="startDate" /></div>
          <div><label className="label">End date</label><input className="input" type="date" name="endDate" /></div>
        </div>
      </div>
      <div>
        <label className="label">Scope / description</label>
        <textarea className="input" name="description" rows={3} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create project →"}</button>
        {state && !state.ok && <span className="text-sm text-red-600">{state.message}</span>}
      </div>
    </form>
  );
}
