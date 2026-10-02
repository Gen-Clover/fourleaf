import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { BUCKET_GUIDE } from "../../../lib/allocation";
import { BucketsForm, SettingsForm } from "./FormulaEditor";
import Subcategories from "./Subcategories";

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

const TABS = [
  { key: "parameters", label: "Parameters" },
  { key: "allocation", label: "Allocation" },
  { key: "spending", label: "Where the money goes" },
  { key: "subcategories", label: "Subcategories" },
  { key: "formulas", label: "Formula reference" },
];

/** Settings for pricing and money, one tab per job: parameters, the split, what it pays for, spend items, formulas. */
export default async function FormulaPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "parameters";
  await requirePermission("finance.settings");
  const [settings, buckets, categories] = await Promise.all([
    // Lead Finder settings have their own page (Lead Finder → Settings).
    prisma.setting.findMany({ where: { NOT: { group: "Lead Finder" } }, orderBy: { sortOrder: "asc" } }),
    prisma.allocationBucket.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.expenseCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { expenses: true } } } }),
  ]);
  const subOf = (key: string) => categories.filter((c) => c.active && c.bucketKey === key).map((c) => c.name);
  return (
    <>
      <PageHeader title="Formula & Allocation" subtitle="Control every parameter the calculator, rate card and billing use." />
      <div className="mb-5 flex flex-wrap gap-x-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/formula?tab=${t.key}`} className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-semibold text-brand-fg" : "border-transparent text-neutral-600 hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </div>
      <div className="space-y-6">
        {tab === "allocation" && <BucketsForm buckets={buckets.map(({ id, key, name, percent, category, isProfit, description }) => ({ id, key, name, percent, category, isProfit, description }))} />}
        {tab === "spending" && <div className="card">
          <div className="card-h">
            <div className="card-t">Where the money goes</div>
            <Link href="/admin/formula?tab=subcategories" className="text-xs underline">Edit subcategories</Link>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Bucket</th><th className="num">%</th><th>Purpose</th><th>Subcategories (spent on)</th><th>Not included</th><th>Example</th></tr>
            </thead>
            <tbody>
              {buckets.map((b) => {
                const g = BUCKET_GUIDE[b.key];
                return (
                  <tr key={b.key} className="align-top">
                    <td className="font-medium whitespace-nowrap">{b.name}</td>
                    <td className="num font-semibold">{b.percent}%</td>
                    <td className="text-sm">{g?.purpose ?? b.description ?? "—"}</td>
                    <td className="text-xs text-neutral-700">{subOf(b.key).join(" · ") || "—"}</td>
                    <td className="text-xs text-neutral-600">{g?.exclusions ?? "—"}</td>
                    <td className="text-xs text-neutral-600">{g?.example ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
        {tab === "subcategories" && <Subcategories
          buckets={buckets.map((b) => ({ key: b.key, name: b.name }))}
          rows={categories.map((c) => ({ id: c.id, name: c.name, bucketKey: c.bucketKey, active: c.active, used: c._count.expenses }))}
        />}
        {tab === "parameters" && <SettingsForm settings={settings.map(({ key, value, label, group, type, unit, description }) => ({ key, value, label, group, type, unit, description }))} />}
        {tab === "formulas" && <div className="card">
          <div className="card-h"><div className="card-t">Formula reference</div></div>
          <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed text-neutral-700">{FORMULAS}</pre>
        </div>}
      </div>
    </>
  );
}
