import { PageHeader } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { BucketsForm, SettingsForm } from "./FormulaEditor";

const FORMULAS = `Monthly Revenue     = Client Rate × Hours × Headcount
Bucket Amount       = Monthly Revenue × Bucket %          (Delivery, Growth, Corporate Ops, Technology, Sales, Risk, Profit)
Blended Rate        = Σ Monthly Revenue ÷ Σ Hours
US Loaded $/hr      = (US Avg Salary ÷ US hours/yr) × US load factor
Client Savings %    = 1 − (GC Rate ÷ US Loaded Rate)
Negotiation Floor   = Standard − low deduction  (Standard < threshold)
                    | Standard − high deduction (Standard ≥ threshold)   — unless overridden per role
Premium Rate        = round(Standard × (1 + premium %), rate rounding)
Delivery Pool ₹L/yr = Rate × Delivery % × billable hrs/yr × FX ÷ 100,000
Cost Coverage       = Delivery Pool ÷ India CTC midpoint        (target ≥ coverage target)

Engagement models (monthly billing)
  Time & Materials  = Σ (hours × agreed rate per role) + adjustment
  Blended           = Σ hours × agreed blended rate + adjustment
  Retainer          = retainer amount + max(0, Σ hours − included hours) × extra-hour rate + adjustment
  Fixed Monthly     = agreed monthly fee + adjustment`;

export default async function FormulaPage() {
  await requireRole("ADMIN");
  const [settings, buckets] = await Promise.all([
    prisma.setting.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.allocationBucket.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Formula & Allocation" subtitle="Control every parameter the calculator, rate card and billing use." />
      <div className="space-y-6">
        <BucketsForm buckets={buckets.map(({ id, key, name, percent, category, isProfit, description }) => ({ id, key, name, percent, category, isProfit, description }))} />
        <SettingsForm settings={settings.map(({ key, value, label, group, type, unit, description }) => ({ key, value, label, group, type, unit, description }))} />
        <div className="card">
          <div className="card-h"><div className="card-t">Formula reference</div></div>
          <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed text-neutral-700">{FORMULAS}</pre>
        </div>
      </div>
    </>
  );
}
