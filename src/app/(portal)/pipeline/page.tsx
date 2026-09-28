import Link from "next/link";
import { PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getParams } from "@/lib/settings";
import { payrollPlan } from "@/lib/treasury";
import { plannedMonthly } from "@/lib/calc";
import { date, inr, pct, usd0 } from "@/lib/format";

const PIPELINE = ["DRAFT", "QUOTED", "NEGOTIATION"];

/** Contract value = planned monthly × contract months (start→end), or 12 months when no end date is set. */
const contractMonths = (start: Date | null, end: Date | null) =>
  start && end ? Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1) : 12;

export default async function PipelinePage() {
  await requireRole("EDITOR");
  const [projects, p, payroll] = await Promise.all([
    prisma.project.findMany({ where: { status: { in: [...PIPELINE, "ACTIVE"] } }, include: { client: { select: { name: true } }, resources: true }, orderBy: [{ expectedCloseDate: "asc" }, { code: "desc" }] }),
    getParams(),
    payrollPlan(),
  ]);
  const rows = projects.map((pr) => {
    const monthly = plannedMonthly(pr, pr.resources);
    const months = contractMonths(pr.startDate, pr.endDate);
    const prob = pr.status === "ACTIVE" ? 100 : (pr.probability ?? 0);
    return { pr, monthly, months, contract: monthly * months, prob, weightedMonthly: (monthly * prob) / 100 };
  });
  const pipe = rows.filter((r) => PIPELINE.includes(r.pr.status));
  const active = rows.filter((r) => r.pr.status === "ACTIVE");
  const runRate = active.reduce((s, r) => s + r.monthly, 0);
  const weighted = pipe.reduce((s, r) => s + r.weightedMonthly, 0);
  const payrollUsd = payroll.reduce((s, x) => s + x.monthlyInr, 0) / p.fxRate;
  const cover = payrollUsd ? (runRate + weighted) / payrollUsd : null;

  return (
    <>
      <PageHeader title="Sales Pipeline" subtitle="Future revenue matters: opportunities weighted by probability, compared with what we must pay every month." actions={<Link href="/projects/new" className="btn-primary">+ New opportunity</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Active run-rate / month" value={usd0(runRate)} hint={`${active.length} active project(s)`} />
        <Stat label="Pipeline / month (unweighted)" value={usd0(pipe.reduce((s, r) => s + r.monthly, 0))} hint={`${pipe.length} opportunit${pipe.length === 1 ? "y" : "ies"}`} />
        <Stat label="Weighted pipeline / month" value={usd0(weighted)} hint="Monthly value × probability" accent />
        <Stat label="Weighted contract value" value={usd0(pipe.reduce((s, r) => s + (r.contract * r.prob) / 100, 0))} />
        <Stat label="Coverage of payroll" value={<span className={cover != null && cover < 1.3 ? "text-orange-600" : ""}>{cover == null ? "—" : `${cover.toFixed(1)}×`}</span>} hint={`(run-rate + weighted) ÷ payroll ${inr(payrollUsd * p.fxRate)}`} />
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Opportunity</th><th>Client</th><th>Stage</th><th>Expected close</th><th className="num">Monthly</th><th className="num">Contract value</th><th className="num">Probability</th><th className="num">Weighted / mo</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pr.id}>
                <td><Link href={`/projects/${r.pr.id}`} className="text-brand hover:underline"><span className="font-mono text-xs">{r.pr.code}</span> {r.pr.name}</Link></td>
                <td>{r.pr.client.name}</td>
                <td><StatusBadge status={r.pr.status} /></td>
                <td className={`whitespace-nowrap ${r.pr.expectedCloseDate && r.pr.expectedCloseDate < new Date() && r.pr.status !== "ACTIVE" ? "text-red-600" : ""}`}>{r.pr.status === "ACTIVE" ? "Won" : date(r.pr.expectedCloseDate)}</td>
                <td className="num">{usd0(r.monthly)}</td>
                <td className="num">{usd0(r.contract)} <span className="text-xs text-neutral-500">/ {r.months} mo</span></td>
                <td className="num">{r.pr.status !== "ACTIVE" && r.pr.probability == null ? <Link href={`/projects/${r.pr.id}`} className="text-xs text-amber-700 underline">set</Link> : pct(r.prob / 100)}</td>
                <td className="num font-semibold">{usd0(r.weightedMonthly)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-neutral-500">No opportunities. Create a project in Draft to track a lead.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">Leads and opportunities are projects in Draft, Quoted or Negotiation. Set probability and expected close on the project&apos;s Overview. The CFO cash forecast counts weighted pipeline from the month after expected close.</p>
    </>
  );
}
