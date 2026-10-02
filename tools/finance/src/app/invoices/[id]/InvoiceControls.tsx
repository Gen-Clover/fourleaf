"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { paymentFx } from "../../../lib/finance";
import { inr, money } from "@genclover/ui/format";
import { recordPayment, setInvoiceStatus } from "../actions";

type Msg = { ok: boolean; message: string } | null;

export function StatusActions({ id, status, hasPayments, isAdmin }: { id: string; status: string; hasPayments: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const go = (s: "SENT" | "DRAFT" | "VOID", confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const res = await setInvoiceStatus(id, s);
      setMsg(res ?? null);
      if (res?.ok) router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && <button className="btn-primary" disabled={pending} onClick={() => go("SENT", "Issue this invoice? It gets the next invoice number and can no longer be edited.")}>Issue invoice</button>}
      {status === "SENT" && !hasPayments && <button className="btn-secondary" disabled={pending} onClick={() => go("DRAFT")}>Reopen as draft</button>}
      {isAdmin && status !== "VOID" && status !== "DRAFT" && !hasPayments && (
        <button className="btn-danger" disabled={pending} onClick={() => go("VOID", "Void this invoice? Its number stays in the register; linked months become billable again.")}>Void</button>
      )}
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
    </div>
  );
}

/**
 * A receipt against the invoice. Settled = how much of the invoice it clears (invoice currency). Indian clients
 * often deduct TDS: enter it, and the settled amount is what was received plus the TDS (and any bank charges).
 */
export function PaymentForm({ invoiceId, balance, fxRate, currency }: { invoiceId: string; balance: number; fxRate: number; currency: string }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const inrInvoice = currency === "INR";
  const [f, setF] = useState({ date: today, amountUsd: String(balance.toFixed(2)), inrReceived: "", tdsInr: "0", bankChargesInr: "0", reference: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const n = (x: string) => Number(x) || 0;
  const fx = paymentFx({ amountUsd: n(f.amountUsd), inrReceived: n(f.inrReceived), bankChargesInr: n(f.bankChargesInr), tdsInr: n(f.tdsInr) }, fxRate);

  const save = () =>
    start(async () => {
      const res = await recordPayment(invoiceId, { date: f.date, amountUsd: n(f.amountUsd), inrReceived: n(f.inrReceived), bankChargesInr: n(f.bankChargesInr), tdsInr: n(f.tdsInr), reference: f.reference || null });
      setMsg(res ?? null);
      if (res?.ok) {
        setF({ ...f, inrReceived: "", tdsInr: "0", bankChargesInr: "0", reference: "" });
        router.refresh();
      }
    });

  const field = (k: keyof typeof f, label: string, type = "number") => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="card p-5">
      <div className="card-t mb-3">Record payment received</div>
      <div className="grid gap-3 md:grid-cols-6">
        {field("date", "Credited on", "date")}
        {field("amountUsd", `Settled (${currency})`)}
        {field("inrReceived", "₹ credited to bank")}
        {field("tdsInr", "TDS deducted ₹")}
        {field("bankChargesInr", "Bank charges ₹")}
        {field("reference", inrInvoice ? "Reference (UTR)" : "Reference (UTR / FIRC)", "text")}
      </div>
      {(n(f.inrReceived) > 0 || n(f.tdsInr) > 0) && (
        <p className="mt-3 text-sm text-neutral-600">
          {inrInvoice ? (
            <>Received {inr(n(f.inrReceived))} + TDS {inr(n(f.tdsInr))} + charges {inr(n(f.bankChargesInr))} = {inr(fx.grossInr)} against {inr(fx.bookedInr)} settled{Math.abs(fx.fxGainInr) > 0.5 && <b className="text-red-600"> · difference {inr(fx.fxGainInr)}</b>}</>
          ) : (
            <>
              Effective rate ₹{fx.effectiveRate.toFixed(2)}/$ vs booked ₹{fxRate} → booked {inr(fx.bookedInr)}, realised {inr(fx.grossInr)} ·{" "}
              <b className={fx.fxGainInr >= 0 ? "text-emerald-700" : "text-red-600"}>FX {fx.fxGainInr >= 0 ? "gain" : "loss"} {inr(Math.abs(fx.fxGainInr))}</b>
            </>
          )}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !n(f.amountUsd) || (!n(f.inrReceived) && !n(f.tdsInr))} onClick={save}>{pending ? "Saving…" : `Record ${money(n(f.amountUsd), currency, 2)}`}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
      </div>
    </div>
  );
}
