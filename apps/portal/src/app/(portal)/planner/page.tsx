import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBuckets, getParams } from "@/lib/settings";
import { activePolicyName, cfoSnapshot } from "@/lib/treasury";
import HirePlanner from "./HirePlanner";

export default async function PlannerPage() {
  await requireRole("EDITOR");
  const [roles, buckets, p, snap, policy] = await Promise.all([
    prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, standardRate: true, ctcMinL: true, ctcMaxL: true } }),
    getBuckets(),
    getParams(),
    cfoSnapshot(),
    activePolicyName(),
  ]);
  return (
    <>
      <PageHeader title="Hire Planner" subtitle="Can we afford to onboard this resource? Hiring is a financial decision: revenue → cost → allocation → margin → future obligations." />
      <HirePlanner
        roles={roles}
        funds={buckets.map((b) => ({ key: b.key, name: b.name, percent: b.percent, isProfit: b.isProfit }))}
        position={{ survivalFundInr: snap.survivalAvailable, monthlyBurnInr: snap.burn, availableCashInr: snap.availableCash }}
        fx={p.fxRate}
        coverageTarget={p.coverageTarget}
        paymentLagMonths={snap.settings.paymentLagMonths}
        runwayMinMonths={snap.settings.runwayMinMonths}
        policy={policy}
      />
    </>
  );
}
