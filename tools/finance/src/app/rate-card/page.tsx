import Link from "next/link";
import { PageHeader, StatusBadge } from "@genclover/ui";
import { requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getBuckets, getParams } from "../../lib/settings";
import { roleMetrics, split } from "../../lib/calc";
import { num, pct, usd, usd0 } from "@genclover/ui/format";

/** The 65 / 10 / 25 model: each fund's share is in "Allocation per $100" below the table. */
const CATEGORIES = [
  ["delivery", "Delivery"],
  ["growth", "Growth"],
  ["corporate", "Corporate"],
] as const;

export default async function RateCardPage() {
  const user = await requireUser();
  const [roles, p, buckets] = await Promise.all([
    prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getParams(),
    getBuckets(),
  ]);

  return (
    <>
      <PageHeader
        title="Client Rate Card"
        subtitle={`7+ years experience · India → USA · FX ₹${p.fxRate}/$ · ${p.billableHoursPerYear} billable hrs/yr · US load ×${p.usLoadFactor}`}
        actions={user.role === "ADMIN" && <Link href="/admin/rate-card" className="btn-primary">Edit rate card</Link>}
      />

      <div className="card overflow-x-auto">
        <table className="tbl [&_td]:px-2 [&_th]:px-2 [&_th]:whitespace-normal">
          <thead>
            <tr>
              <th>Role / Domain</th>
              <th className="num">India Market</th>
              <th className="num">US Salary</th>
              <th className="num">US Loaded</th>
              <th className="num">GC Standard</th>
              <th className="num">Floor</th>
              <th className="num">Premium</th>
              {CATEGORIES.map(([key, label]) => (
                <th key={key} className="num" title={`${label} share of the Standard rate, per hour`}>
                  {label} {Math.round(split(100, buckets)[key])}%
                </th>
              ))}
              <th className="num">Savings vs US</th>
              <th className="num">Mkt Position</th>
              <th className="num">Coverage</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const m = roleMetrics(r, p, buckets);
              const s = split(r.standardRate, buckets);
              return (
                <tr key={r.id}>
                  <td className="min-w-44">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-neutral-500">{r.family}</div>
                  </td>
                  <td className="num">${r.marketMin}–{r.marketMax}</td>
                  <td className="num">{usd0(r.usSalary)}</td>
                  <td className="num">{usd0(m.usLoaded)}</td>
                  <td className="num font-semibold text-brand-fg">{usd(r.standardRate)}</td>
                  <td className="num">{usd(m.floor)}</td>
                  <td className="num">{m.premium.min === m.premium.max ? `$${m.premium.min}` : `$${m.premium.min}–${m.premium.max}`}</td>
                  {CATEGORIES.map(([key]) => (
                    <td key={key} className="num text-neutral-600">{usd(s[key])}</td>
                  ))}
                  <td className="num">~{pct(m.savings)}</td>
                  <td className="num">{pct(m.position)}</td>
                  <td className="num">{m.coverage == null ? "—" : `${num(m.coverage, 2)}×`}</td>
                  <td><StatusBadge status={m.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="card-t mb-2">Packages</div>
          <ul className="space-y-1 text-sm">
            <li>Blended rate: <b>{usd(p.blendedRate)}/hr</b></li>
            <li>Monthly retainer: <b>{usd0(p.retainerAmount)}</b> for {p.retainerHours} hrs ({usd(p.retainerAmount / p.retainerHours)}/hr)</li>
            <li>Additional hours: <b>{usd(p.additionalHourRate)}/hr</b></li>
          </ul>
        </div>
        <div className="card p-5">
          <div className="card-t mb-2">Floor & premium rules</div>
          <ul className="space-y-1 text-sm">
            <li>Floor = Standard − ${p.floorDeltaLow} (below ${p.floorThreshold}) / − ${p.floorDeltaHigh} (at/above)</li>
            <li>Premium = Standard + {p.premiumPctMin}–{p.premiumPctMax}%, rounded to ${p.rateRounding}</li>
            <li>Coverage target ≥ {p.coverageTarget}× India CTC midpoint</li>
          </ul>
        </div>
        <div className="card p-5">
          <div className="card-t mb-2">Allocation per $100</div>
          <ul className="space-y-1 text-sm">
            {buckets.map((b) => (
              <li key={b.key} className="flex justify-between">
                <span>{b.name}</span>
                <b>${b.percent}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        Internal document. Never disclose the allocation split to clients; quote Standard, blended or retainer pricing.
      </p>
    </>
  );
}
