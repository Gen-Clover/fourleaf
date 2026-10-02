"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KIND_LABEL, PROJECT_KINDS } from "@genclover/ui/format";
import { createProject } from "../../actions";

type Opt = { id: string; label: string };

/** Project set-up: client, type, model, dates, delivery manager, and (optionally) the won deal and SOW it comes from. */
export default function NewProjectForm({
  clients,
  models,
  deals,
  sows,
  initial,
  internalClientId,
}: {
  clients: (Opt & { currency: string })[];
  models: Record<string, string>;
  deals: (Opt & { clientId: string | null; model: string })[];
  sows: (Opt & { clientId: string })[];
  initial: { clientId: string; opportunityId: string; name: string; kind: string; engagementModel: string };
  internalClientId: string | null;
}) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, status: "ACTIVE", currency: "", startDate: "", endDate: "", description: "", deliveryManager: "", sowId: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const internal = f.kind === "PRODUCT" || f.kind === "INTERNAL";
  const clientDeals = deals.filter((d) => !d.clientId || d.clientId === f.clientId);
  const clientSows = sows.filter((s) => s.clientId === f.clientId);
  return (
    <div className="card max-w-4xl space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block md:col-span-2">
          <span className="label">Project name *</span>
          <input className="input" value={f.name} onChange={set("name")} placeholder="e.g. Website redesign, Data migration phase 1" />
        </label>
        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, clientId: (e.target.value === "PRODUCT" || e.target.value === "INTERNAL") && internalClientId ? internalClientId : f.clientId })}>
            {PROJECT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Client *</span>
          <select className="input" value={f.clientId} onChange={set("clientId")} disabled={internal && !!internalClientId}>
            <option value="">Pick…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {internal && <span className="mt-1 block text-xs text-neutral-500">Products and internal work sit under Gen Clover (internal), so their cost is tracked apart from client work.</span>}
        </label>
        <label className="block">
          <span className="label">Engagement model</span>
          <select className="input" value={f.engagementModel} onChange={set("engagementModel")}>
            {Object.entries(models).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select className="input" value={f.status} onChange={set("status")}>
            <option value="ACTIVE">Active (agreed, work starts)</option>
            <option value="DRAFT">Draft (being quoted)</option>
          </select>
        </label>
        <label className="block"><span className="label">Start</span><input className="input" type="date" value={f.startDate} onChange={set("startDate")} /></label>
        <label className="block"><span className="label">End (if known)</span><input className="input" type="date" value={f.endDate} onChange={set("endDate")} /></label>
        <label className="block"><span className="label">Delivery manager</span><input className="input" value={f.deliveryManager} onChange={set("deliveryManager")} /></label>
        {!internal && (
          <>
            <label className="block">
              <span className="label">From deal</span>
              <select className="input" value={f.opportunityId} onChange={set("opportunityId")}>
                <option value="">—</option>
                {clientDeals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Attach SOW</span>
              <select className="input" value={f.sowId} onChange={set("sowId")}>
                <option value="">— add later —</option>
                {clientSows.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      <label className="block">
        <span className="label">Scope / description</span>
        <textarea className="input" rows={3} value={f.description} onChange={set("description")} />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createProject(f);
              if (r?.ok && r.id) router.push(`/projects/${r.id}?tab=milestones`);
              else setMsg(r?.message ?? null);
            })
          }
        >
          {pending ? "Creating…" : "Create project →"}
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
      <p className="text-xs text-neutral-500">Prices, quote and billing are added by Finance on the project&apos;s Commercials page.</p>
    </div>
  );
}
