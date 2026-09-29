"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type Agreement, type Bucket, MODELS, monthlyRevenue, split } from "../../../lib/calc";
import { STATUS_LABEL, usd } from "@genclover/ui/format";
import { saveMonth, timesheetMonthLines } from "../actions";

export type MonthLine = { resourceId: string | null; label: string; hours: number; rate: number };
export type MonthData = { month: string; adjustment: number; notes: string; lines: MonthLine[] };

export default function MonthEditor({
  projectId,
  agreement,
  buckets,
  initial,
  isNew,
  readOnly,
  invoice,
}: {
  projectId: string;
  agreement: Agreement;
  buckets: Bucket[];
  initial: MonthData;
  isNew: boolean;
  readOnly: boolean;
  invoice: { id: string; number: string; status: string } | null;
}) {
  const router = useRouter();
  const [m, setM] = useState<MonthData>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const locked = readOnly || !!invoice;
  const calc = monthlyRevenue(agreement, m.lines, m.adjustment);
  const s = split(calc.revenue, buckets);
  const setLine = (i: number, patch: Partial<MonthLine>) => setM({ ...m, lines: m.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const perRole = agreement.engagementModel === "TM";

  const save = () =>
    start(async () => {
      const res = await saveMonth(projectId, { ...m, notes: m.notes || null }, isNew ? undefined : initial.month);
      setMsg(res ?? null);
      if (res?.ok) router.push(`/projects/${projectId}?tab=monthly`);
    });

  const loadTimesheets = () =>
    start(async () => {
      const res = await timesheetMonthLines(projectId, m.month);
      if (!res.total) return setMsg({ ok: false, message: `No billable timesheet hours logged for ${m.month}.` });
      setM({ ...m, lines: res.lines });
      setMsg({ ok: true, message: `Loaded ${res.total} billable hrs from timesheets. Review, then save.` });
    });

  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">{isNew ? "Add month" : `${locked ? "View" : "Edit"} ${initial.month}`} · {MODELS[agreement.engagementModel]}</div>
        <Link href={`/projects/${projectId}?tab=monthly`} className="text-sm text-neutral-500 hover:underline">Close</Link>
      </div>
      {invoice && (
        <div className="border-b border-neutral-200 bg-blue-50 px-5 py-2 text-sm text-blue-800">
          Billed on invoice <Link href={`/invoices/${invoice.id}`} className="font-semibold underline">{invoice.number}</Link> ({STATUS_LABEL[invoice.status]}). Hours and revenue are locked; delete or void the invoice to change them.
        </div>
      )}
      <div className="grid gap-4 p-5 md:grid-cols-6">
        <div><label className="label">Month</label><input className="input" type="month" value={m.month} disabled={locked} onChange={(e) => setM({ ...m, month: e.target.value })} /></div>
        <div><label className="label">Adjustment ($ ±)</label><input className="input" type="number" step="any" value={m.adjustment} disabled={locked} onChange={(e) => setM({ ...m, adjustment: Number(e.target.value) || 0 })} /></div>
        {!locked && (
          <div className="flex items-end md:col-span-2">
            <button className="btn-secondary" disabled={pending || !m.month} onClick={loadTimesheets}>↻ Load hours from timesheets</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Resource</th><th>Actual hours</th><th>Rate $/hr {perRole ? "" : "(reference)"}</th><th className="num">Hours × rate</th>{!locked && <th></th>}</tr>
          </thead>
          <tbody>
            {m.lines.map((l, i) => (
              <tr key={i}>
                <td><input className="input-sm w-72" value={l.label} disabled={locked || !!l.resourceId} onChange={(e) => setLine(i, { label: e.target.value })} /></td>
                <td><input className="input-sm w-24" type="number" min={0} step="any" value={l.hours} disabled={locked} onChange={(e) => setLine(i, { hours: Number(e.target.value) || 0 })} /></td>
                <td><input className="input-sm w-24" type="number" min={0} step="any" value={l.rate} disabled={locked} onChange={(e) => setLine(i, { rate: Number(e.target.value) || 0 })} /></td>
                <td className="num">{usd(l.hours * l.rate)}</td>
                {!locked && <td><button className="btn-danger btn-sm" onClick={() => setM({ ...m, lines: m.lines.filter((_, j) => j !== i) })}>✕</button></td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td>{calc.hours} hrs</td><td></td><td className="num">{usd(calc.tmValue)}</td>{!locked && <td></td>}</tr>
          </tfoot>
        </table>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-3">
        <div className="md:col-span-1">
          {!locked && <button className="btn-secondary btn-sm mb-3" onClick={() => setM({ ...m, lines: [...m.lines, { resourceId: null, label: "Additional work", hours: 0, rate: 0 }] })}>+ Add line</button>}
          <label className="label">Notes</label>
          <textarea className="input" rows={4} value={m.notes} disabled={locked} onChange={(e) => setM({ ...m, notes: e.target.value })} />
        </div>
        <div>
          <div className="card-t mb-2">Revenue for the month</div>
          <dl className="space-y-1 text-sm">
            {agreement.engagementModel === "RETAINER" && (
              <>
                <div className="flex justify-between"><dt>Retainer</dt><dd>{usd(agreement.agreedMonthly)}</dd></div>
                <div className="flex justify-between"><dt>Extra hours ({calc.extraHours} × {usd(agreement.agreedExtraRate)})</dt><dd>{usd(calc.extraHours * (agreement.agreedExtraRate ?? 0))}</dd></div>
              </>
            )}
            {agreement.engagementModel === "BLENDED" && <div className="flex justify-between"><dt>{calc.hours} hrs × {usd(agreement.agreedBlendedRate)}</dt><dd>{usd(calc.base)}</dd></div>}
            {agreement.engagementModel === "FIXED" && <div className="flex justify-between"><dt>Fixed fee</dt><dd>{usd(calc.base)}</dd></div>}
            {agreement.engagementModel === "TM" && <div className="flex justify-between"><dt>Σ hours × rate</dt><dd>{usd(calc.base)}</dd></div>}
            <div className="flex justify-between"><dt>Adjustment</dt><dd>{usd(m.adjustment)}</dd></div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><dt>Revenue</dt><dd className="text-brand-fg">{usd(calc.revenue)}</dd></div>
          </dl>
        </div>
        <div>
          <div className="card-t mb-2">Allocation</div>
          <dl className="space-y-1 text-sm">
            {s.lines.map((l) => <div key={l.key} className="flex justify-between"><dt className="text-neutral-600">{l.name} ({l.percent}%)</dt><dd className="tabular-nums">{usd(l.amount)}</dd></div>)}
          </dl>
        </div>
      </div>
      {!locked && (
        <div className="flex items-center gap-3 border-t border-neutral-200 px-5 py-3">
          <button className="btn-primary" disabled={pending || !m.month} onClick={save}>{pending ? "Saving…" : "Save month"}</button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
      {locked && msg && <p className="px-5 pb-3 text-sm text-red-600">{msg.message}</p>}
    </div>
  );
}
