"use client";

import { useState } from "react";
import { type Bucket, MODELS, type ResourceLine, monthlyRevenue, effectiveRate, lineHours, quoteSummary, split } from "../../../lib/calc";
import { pct, toInputDate, usd } from "@genclover/ui/format";
import { saveAgreement } from "../actions";
import { useFormAction } from "@genclover/ui/form-action";

type P = {
  id: string;
  name: string;
  clientId: string;
  kind: string;
  status: string;
  engagementModel: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  agreedAt: string | null;
  agreedMonthly: number | null;
  agreedBlendedRate: number | null;
  agreedRetainerHrs: number | null;
  agreedExtraRate: number | null;
  agreementNotes: string | null;
};

const d = (s: string | null) => (s ? toInputDate(new Date(s)) : "");

const VISIBLE: Record<string, string[]> = {
  TM: [],
  RETAINER: ["agreedMonthly", "agreedRetainerHrs", "agreedExtraRate"],
  BLENDED: ["agreedBlendedRate"],
  FIXED: ["agreedMonthly"],
  FIXED_PRICE: [],
};

export function AgreementForm({
  project,
  resources,
  buckets,
  readOnly,
}: {
  project: P;
  resources: ResourceLine[];
  buckets: Bucket[];
  readOnly: boolean;
}) {
  const { state, pending, form } = useFormAction(saveAgreement.bind(null, project.id));
  const [a, setA] = useState({
    engagementModel: project.engagementModel,
    agreedMonthly: project.agreedMonthly?.toString() ?? "",
    agreedBlendedRate: project.agreedBlendedRate?.toString() ?? "",
    agreedRetainerHrs: project.agreedRetainerHrs?.toString() ?? "",
    agreedExtraRate: project.agreedExtraRate?.toString() ?? "",
  });
  const n = (s: string) => (s === "" ? null : Number(s));
  const agreement = {
    engagementModel: a.engagementModel,
    agreedMonthly: n(a.agreedMonthly),
    agreedBlendedRate: n(a.agreedBlendedRate),
    agreedRetainerHrs: n(a.agreedRetainerHrs),
    agreedExtraRate: n(a.agreedExtraRate),
  };
  const planned = monthlyRevenue(agreement, resources.map((r) => ({ hours: lineHours(r), rate: effectiveRate(r) })));
  const q = quoteSummary(resources);
  const s = split(planned.revenue, buckets);
  const field = (key: keyof typeof a, label: string, unit: string) => (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-1">
        <input className="input" name={key} type="number" step="any" min={0} value={a[key]} disabled={readOnly} onChange={(e) => setA({ ...a, [key]: e.target.value })} />
        <span className="w-12 text-xs text-neutral-500">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <form {...form} className="card space-y-4 p-5">
        <div className="card-t">Final agreed commercial terms</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Engagement model</label>
            <select className="input" name="engagementModel" value={a.engagementModel} disabled={readOnly} onChange={(e) => setA({ ...a, engagementModel: e.target.value })}>
              {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              {a.engagementModel === "TM" && "Billed on actual hours × agreed rate per role (set agreed rates on the Resources & Quote tab)."}
              {a.engagementModel === "RETAINER" && "Fixed monthly retainer covering included hours; extra hours billed at the extra-hour rate."}
              {a.engagementModel === "BLENDED" && "All hours billed at a single blended rate."}
              {a.engagementModel === "FIXED" && "Fixed monthly fee regardless of hours."}
            </p>
          </div>
          {(a.engagementModel === "RETAINER" || a.engagementModel === "FIXED") && field("agreedMonthly", a.engagementModel === "RETAINER" ? "Monthly retainer" : "Monthly fee", "$")}
          {a.engagementModel === "RETAINER" && field("agreedRetainerHrs", "Included hours / month", "hrs")}
          {a.engagementModel === "RETAINER" && field("agreedExtraRate", "Extra hours rate", "$/hr")}
          {a.engagementModel === "BLENDED" && field("agreedBlendedRate", "Blended rate", "$/hr")}
          {/* keep hidden values so switching models doesn't wipe them */}
          {(["agreedMonthly", "agreedRetainerHrs", "agreedExtraRate", "agreedBlendedRate"] as const)
            .filter((k) => !VISIBLE[a.engagementModel]?.includes(k))
            .map((k) => <input key={k} type="hidden" name={k} value={a[k]} />)}
          <div>
            <label className="label">Agreed on</label>
            <input className="input" type="date" name="agreedAt" defaultValue={d(project.agreedAt)} disabled={readOnly} />
          </div>
        </div>
        <div>
          <label className="label">Agreement notes (payment terms, scope, SLAs, discounts…)</label>
          <textarea className="input" name="agreementNotes" rows={4} defaultValue={project.agreementNotes ?? ""} disabled={readOnly} />
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="markAgreed" /> Mark as agreed (moves Draft/Quoted/Negotiation → Active)
            </label>
            <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save agreement"}</button>
            {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
          </div>
        )}
      </form>

      <div className="card p-5">
        <div className="card-t mb-3">Expected monthly (planned hours)</div>
        <div className="mb-3 text-3xl font-semibold tabular-nums text-brand-fg">{usd(planned.revenue)}</div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-neutral-600">Planned hours</dt><dd>{planned.hours}</dd></div>
          {planned.extraHours > 0 && <div className="flex justify-between"><dt className="text-neutral-600">Extra hours over retainer</dt><dd>{planned.extraHours}</dd></div>}
          <div className="flex justify-between"><dt className="text-neutral-600">Effective rate</dt><dd>{planned.hours ? usd(planned.revenue / planned.hours) : "—"}/hr</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-600">vs standard ({usd(q.standard)})</dt><dd>{q.standard ? pct(planned.revenue / q.standard - 1, 1) : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-600">vs floor ({usd(q.floor)})</dt><dd className={planned.revenue < q.floor ? "font-semibold text-red-600" : ""}>{q.floor ? pct(planned.revenue / q.floor - 1, 1) : "—"}</dd></div>
        </dl>
        {planned.revenue < q.floor && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">⚠ Agreed deal is below the negotiation floor for this resource plan.</p>}
        <div className="card-t mt-5 mb-2">Allocation</div>
        <dl className="space-y-1 text-sm">
          {s.lines.map((l) => (
            <div key={l.key} className="flex justify-between"><dt className="text-neutral-600">{l.name} ({l.percent}%)</dt><dd className="tabular-nums">{usd(l.amount)}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}
