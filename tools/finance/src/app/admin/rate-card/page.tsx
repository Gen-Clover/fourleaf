import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getBuckets, getParams } from "../../../lib/settings";
import RateCardEditor from "./RateCardEditor";

export default async function AdminRateCardPage() {
  await requirePermission("finance.settings");
  const [roles, params, buckets] = await Promise.all([prisma.roleRate.findMany({ orderBy: { sortOrder: "asc" } }), getParams(), getBuckets()]);
  const initial = roles.map((r) => ({
    id: r.id,
    name: r.name,
    family: r.family,
    marketMin: r.marketMin,
    marketMax: r.marketMax,
    usSalary: r.usSalary,
    standardRate: r.standardRate,
    floorRate: r.floorRate,
    ctcMinL: r.ctcMinL,
    ctcMaxL: r.ctcMaxL,
    notes: r.notes,
    active: r.active,
  }));
  return (
    <>
      <PageHeader
        title="Manage Rate Card"
        subtitle="Changes apply to new quotes. Existing project resources keep the rates they were quoted at."
      />
      <RateCardEditor initial={initial} params={params} buckets={buckets} />
    </>
  );
}
