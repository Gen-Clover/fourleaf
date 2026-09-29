"use client";

import { useState } from "react";
import { type FundDef, simulateHire } from "../../lib/finance";
import { inr, usd } from "@genclover/ui/format";

type Role = { id: string; name: string; standardRate: number; ctcMinL: number | null; ctcMaxL: number | null };
type Position = { survivalFundInr: number; monthlyBurnInr: number; availableCashInr: number };

const TONE = { red: "border-red-300 bg-red-50 text-red-800", amber: "border-orange-300 bg-orange-50 text-orange-800", green: "border-emerald-300 bg-emerald-50 text-emerald-800" };
const VERDICT = { red: "🔴 Not affordable as structured", amber: "🟠 Affordable, but tight", green: "🟢 Affordable" };

export default function HirePlanner({
  roles,
  funds,
  position,
  fx,
  coverageTarget,
  paymentLagMonths,
  runwayMinMonths,
  policy,
}: {
  roles: Role[];
  funds: (FundDef & { isProfit: boolean })[];
  position: Position;
  fx: number;
  coverageTarget: number;
  paymentLagMonths: number;
  runwayMinMonths: number;
  policy: string;
}) {
  const ctcMonthly = (r?: Role) => (r?.ctcMinL != null && r.ctcMaxL != null ? Math.round((((r.ctcMinL + r.ctcMaxL) / 2) * 1e5) / 12) : 0);
  const first = roles[0];
  const [f, setF] = useState({
    roleId: first?.id ?? "",
    billRateUsd: first?.standardRate ?? 60,
    billableHours: 160,
    contractMonths: 12,
    costType: "EMPLOYEE" as "EMPLOYEE" | "CONTRACTOR",
    monthlyCostInr: ctcMonthly(first),
    benchMonths: 1,
    onboardingInr: 50000,
    paymentLagMonths,
  });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const pickRole = (id: string) => {
    const r = roles.find((x) => x.id === id);
    set({ roleId: id, billRateUsd: r?.standardRate ?? f.billRateUsd, monthlyCostInr: ctcMonthly(r) || f.monthlyCostInr });
  };
  const r = simulateHire({ ...f, fxRate: fx, coverageTarget, funds, deliveryKey: "delivery", runwayMinMonths, ...position });

  const num = (k: keyof typeof f, label: string, step = "any", hint?: string) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" step={step} min={0} value={f[k] as number} onChange={(e) => set({ [k]: Number(e.target.value) || 0 } as Partial<typeof f>)} />
      {hint && <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="card space-y-3 p-5">
        <div className="card-t">The resource & the contract</div>
        <div>
          <label className="label">Rate-card role</label>
          <select className="input" value={f.roleId} onChange={(e) => pickRole(e.target.value)}>
            {roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {num("billRateUsd", "Client rate $/hr")}
          {num("billableHours", "Billable hrs / month")}
          {num("contractMonths", "Contract months", "1")}
          <div>
            <label className="label">Hire as</label>
            <select className="input" value={f.costType} onChange={(e) => set({ costType: e.target.value as "EMPLOYEE" | "CONTRACTOR", benchMonths: e.target.value === "EMPLOYEE" ? f.benchMonths : 0 })}>
              <option value="EMPLOYEE">Salaried employee</option><option value="CONTRACTOR">Direct contractor</option>
            </select>
          </div>
        </div>
        {num("monthlyCostInr", "Loaded cost ₹ / month", "1000", "Defaults to the role's India CTC midpoint ÷ 12")}
        <div className="grid grid-cols-2 gap-3">
          {f.costType === "EMPLOYEE" && num("benchMonths", "Bench months after", "0.5", "Kept, unbilled")}
          {num("onboardingInr", "Onboarding ₹", "1000", "Hiring fee, laptop…")}
          {num("paymentLagMonths", "Months to first cash", "0.5")}
        </div>
        <p className="text-xs text-neutral-500">Allocation policy: <b>{policy}</b> · FX ₹{fx}/$</p>
      </div>

      <div className="space-y-4">
        <div className={`rounded-xl border-2 p-4 ${TONE[r.verdict as keyof typeof TONE]}`}>
          <div className="text-lg font-semibold">{VERDICT[r.verdict as keyof typeof VERDICT]}</div>
          <p className="text-sm">
            If we onboard this resource, the contract brings {inr(r.contractRevenueInr)} ({usd(f.billRateUsd * f.billableHours * f.contractMonths, 0)}) and is expected to leave{" "}
            <b>{inr(r.expectedProfit)}</b> of profit for Gen Clover after the resource, bench and onboarding costs.
          </p>
          <ul className="mt-2 space-y-0.5 text-sm">{r.reasons.map((x, i) => <li key={i}>{x.level === "red" ? "✕" : x.level === "amber" ? "!" : "✓"} {x.text}</li>)}</ul>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <div className="card-t mb-3">Contract → funds</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between font-semibold"><dt>Contract revenue</dt><dd className="tabular-nums">{inr(r.contractRevenueInr)}</dd></div>
              {r.byFund.filter((x) => x.percent > 0).map((x) => (
                <div key={x.key} className="flex justify-between text-neutral-600"><dt>{x.name} ({x.percent}%)</dt><dd className="tabular-nums">{inr(x.amount)}</dd></div>
              ))}
            </dl>
          </div>
          <div className="card p-5">
            <div className="card-t mb-3">Delivery economics</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt>Delivery allocation</dt><dd className="tabular-nums">{inr(r.deliveryAlloc)}</dd></div>
              <div className="flex justify-between text-neutral-600"><dt>{f.costType === "EMPLOYEE" ? "Salaried resource" : "Direct contractor"} ({f.contractMonths} mo)</dt><dd className="tabular-nums">−{inr(r.directCost)}</dd></div>
              <div className="flex justify-between text-neutral-600"><dt>Bench impact</dt><dd className="tabular-nums">−{inr(r.benchCost)}</dd></div>
              <div className="flex justify-between text-neutral-600"><dt>Onboarding</dt><dd className="tabular-nums">−{inr(f.onboardingInr)}</dd></div>
              <div className={`flex justify-between border-t pt-1 font-semibold ${r.deliverySurplus < 0 ? "text-red-600" : ""}`}><dt>Delivery surplus</dt><dd className="tabular-nums">{inr(r.deliverySurplus)}</dd></div>
              <div className="flex justify-between"><dt>+ Retained profit fund</dt><dd className="tabular-nums">{inr(r.profitAlloc)}</dd></div>
              <div className={`flex justify-between border-t pt-1 text-base font-semibold ${r.expectedProfit < 0 ? "text-red-600" : "text-brand-fg"}`}><dt>Expected profit</dt><dd className="tabular-nums">{inr(r.expectedProfit)}</dd></div>
              <div className="flex justify-between text-xs text-neutral-500"><dt>Delivery coverage</dt><dd>{r.coverage == null ? "—" : `${r.coverage.toFixed(2)}× (target ${coverageTarget}×)`}</dd></div>
            </dl>
          </div>
          <div className="card p-5 md:col-span-2">
            <div className="card-t mb-3">Future obligations & company position</div>
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div><div className="text-xs text-neutral-500">Cash needed before first payment</div><div className="text-lg font-semibold tabular-nums">{inr(r.workingCapitalNeed)}</div><div className="text-xs text-neutral-500">vs {inr(position.availableCashInr)} available now</div></div>
              <div><div className="text-xs text-neutral-500">Monthly burn</div><div className="text-lg font-semibold tabular-nums">{inr(position.monthlyBurnInr)} → {inr(r.burnAfter)}</div><div className="text-xs text-neutral-500">{f.costType === "EMPLOYEE" ? "Salary becomes unavoidable" : "Contractor cost is variable"}</div></div>
              <div><div className="text-xs text-neutral-500">Survival runway</div><div className="text-lg font-semibold tabular-nums">{r.runwayBefore == null ? "—" : r.runwayBefore.toFixed(1)} → {r.runwayAfter == null ? "—" : r.runwayAfter.toFixed(1)} mo</div><div className="text-xs text-neutral-500">Survival fund {inr(position.survivalFundInr)}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
