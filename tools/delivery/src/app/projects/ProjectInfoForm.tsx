"use client";

import { MODELS } from "@genclover/finance/lib/calc";
import { KIND_LABEL, PROJECT_KINDS, PROJECT_STATUSES, STATUS_LABEL, toInputDate } from "@genclover/ui/format";
import { updateProject } from "../actions";
import { useFormAction } from "@genclover/ui/form-action";

export type ProjectInfo = {
  id: string;
  name: string;
  kind: string;
  status: string;
  engagementModel: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  deliveryManager: string | null;
};

const d = (s: string | null) => (s ? toInputDate(new Date(s)) : "");

/** Project details. The engagement model is commercial, so only finance roles change it. */
export default function ProjectInfoForm({
  project,
  client,
  readOnly,
  canModel,
  managers,
}: {
  project: ProjectInfo;
  client: { code: string; name: string };
  readOnly: boolean;
  canModel: boolean;
  managers: string[];
}) {
  const { state, pending, form } = useFormAction(updateProject.bind(null, project.id));
  return (
    <form {...form} className="card space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="label">Project name</label>
          <input className="input" name="name" defaultValue={project.name} required disabled={readOnly} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" name="status" defaultValue={project.status} disabled={readOnly}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Client</label>
          <input className="input" value={`${client.code} · ${client.name}`} disabled title="Fixed: the project ID belongs to this client" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" name="kind" defaultValue={project.kind} disabled={readOnly}>
            {PROJECT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Engagement model</label>
          {canModel && !readOnly ? (
            <select className="input" name="engagementModel" defaultValue={project.engagementModel}>
              {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          ) : (
            <>
              <input type="hidden" name="engagementModel" value={project.engagementModel} />
              <input className="input" value={MODELS[project.engagementModel] ?? project.engagementModel} disabled />
            </>
          )}
        </div>
        <div>
          <label className="label">Delivery manager</label>
          <input className="input" name="deliveryManager" list="managers" defaultValue={project.deliveryManager ?? ""} disabled={readOnly} />
          <datalist id="managers">{managers.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-3 md:col-span-2">
          <div><label className="label">Start</label><input className="input" type="date" name="startDate" defaultValue={d(project.startDate)} disabled={readOnly} /></div>
          <div><label className="label">End</label><input className="input" type="date" name="endDate" defaultValue={d(project.endDate)} disabled={readOnly} /></div>
        </div>
      </div>
      <div>
        <label className="label">Scope / description</label>
        <textarea className="input" name="description" rows={3} defaultValue={project.description ?? ""} disabled={readOnly} />
      </div>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save details"}</button>
          {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
        </div>
      )}
    </form>
  );
}
