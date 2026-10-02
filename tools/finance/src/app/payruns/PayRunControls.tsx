"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inr } from "@genclover/ui/format";
import { createPayRun, markPayRunPaid, rebuildPayRun, removeLine, saveLines, submitPayRun } from "./actions";

type Result = { ok: boolean; message: string } | undefined;
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>(undefined);
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        after?.(r);
        router.refresh();
      }
    });
  return { pending, msg, run, router };
}
const Msg = ({ msg }: { msg: Result }) => (msg ? <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span> : null);

export function NewPayRun({ month }: { month: string }) {
  const { pending, msg, run, router } = useRun();
  const [m, setM] = useState(month);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input-sm" type="month" value={m} onChange={(e) => setM(e.target.value)} aria-label="Month" />
      <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => createPayRun(m), (r) => { const id = (r as { id?: string }).id; if (id) router.push(`/finance/payruns/${id}`); })}>
        Prepare pay run
      </button>
      <Msg msg={msg} />
    </div>
  );
}

export type LineRow = { id: string; person: string; code: string | null; type: string; kind: string; description: string; hours: number; gross: number; gst: number; tds: number; otherDeductions: number; net: number; breakdown: { projectCode: string; hours: number; amount?: number }[] };

/** Draft lines, editable: amounts, GST, TDS, other deductions. Net = gross + GST − TDS − other. */
export function PayLines({ runId, lines, editable }: { runId: string; lines: LineRow[]; editable: boolean }) {
  const { pending, msg, run } = useRun();
  const [rows, setRows] = useState(lines);
  const set = (i: number, patch: Partial<LineRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const net = (r: LineRow) => Math.round((r.gross + r.gst - r.tds - r.otherDeductions) * 100) / 100;
  const cell = (i: number, k: "gross" | "gst" | "tds" | "otherDeductions") =>
    editable ? <input className="input-sm w-24 text-right" type="number" min={0} step="any" value={rows[i][k]} onChange={(e) => set(i, { [k]: Number(e.target.value) || 0 })} /> : inr(rows[i][k], 2);
  const total = (k: "gross" | "gst" | "tds" | "otherDeductions") => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="card overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr><th>Person</th><th>Pay</th><th className="num">Hours</th><th className="num">Gross ₹</th><th className="num">GST ₹</th><th className="num">TDS ₹</th><th className="num">Other ded. ₹</th><th className="num">Net pay ₹</th>{editable && <th />}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="min-w-40"><div className="font-medium">{r.person}</div><div className="text-xs text-neutral-500"><span className="font-mono">{r.code}</span> · {r.type === "EMPLOYEE" ? "employee" : "contractor"}</div></td>
              <td className="min-w-56 text-sm">
                {editable ? <input className="input-sm w-full" value={r.description} onChange={(e) => set(i, { description: e.target.value })} /> : r.description}
                {r.breakdown.length > 0 && <div className="mt-0.5 text-xs text-neutral-500">{r.breakdown.map((b) => `${b.projectCode} ${b.hours}h${b.amount != null ? ` (${inr(b.amount)})` : ""}`).join(" · ")}</div>}
              </td>
              <td className="num">{r.hours || "—"}</td>
              <td className="num">{cell(i, "gross")}</td>
              <td className="num">{cell(i, "gst")}</td>
              <td className="num">{cell(i, "tds")}</td>
              <td className="num">{cell(i, "otherDeductions")}</td>
              <td className="num font-semibold">{inr(net(r), 2)}</td>
              {editable && <td><button type="button" className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => removeLine(r.id), () => setRows(rows.filter((x) => x.id !== r.id)))}>✕</button></td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-neutral-500">Nobody to pay this month (no salaries, no approved hours, no fees due).</td></tr>}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}>TOTAL</td><td className="num">{inr(total("gross"), 2)}</td><td className="num">{inr(total("gst"), 2)}</td><td className="num">{inr(total("tds"), 2)}</td><td className="num">{inr(total("otherDeductions"), 2)}</td><td className="num">{inr(rows.reduce((s, r) => s + net(r), 0), 2)}</td>{editable && <td />}</tr>
        </tfoot>
      </table>
      {editable && (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => saveLines(runId, rows.map(({ id, gross, gst, tds, otherDeductions, description }) => ({ id, gross, gst, tds, otherDeductions, description }))))}>Save changes</button>
          <Msg msg={msg} />
        </div>
      )}
    </div>
  );
}

export function RunActions({ runId, status, pendingApproval, canEdit, canPay }: { runId: string; status: string; pendingApproval: boolean; canEdit: boolean; canPay: boolean }) {
  const { pending, msg, run } = useRun();
  const [pay, setPay] = useState({ date: new Date().toISOString().slice(0, 10), reference: "" });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && canEdit && (
        <>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => { if (confirm("Rebuild from the latest salaries, approved hours and work orders? Edits are lost.")) run(() => rebuildPayRun(runId)); }}>Rebuild</button>
          {!pendingApproval && <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => submitPayRun(runId))}>Send for approval</button>}
        </>
      )}
      {status === "APPROVED" && canPay && (
        <>
          <input className="input-sm" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} aria-label="Paid on" />
          <input className="input-sm w-48" placeholder="Bank reference" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => markPayRunPaid(runId, pay))}>Mark paid</button>
        </>
      )}
      <Msg msg={msg} />
    </div>
  );
}
