import { PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getBuckets, getParams } from "../../lib/settings";
import { floorRate, premiumRates, usLoadedRate } from "../../lib/calc";
import Calculator from "./Calculator";

export default async function CalculatorPage() {
  const user = await requireUser();
  const [p, buckets, roles, clients] = await Promise.all([
    getParams(),
    can(user.role, "cost.view") ? getBuckets() : Promise.resolve([]),
    prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Quick Calculator" subtitle="Price a team in seconds using the live rate card and formula. Nothing is saved unless you create a project." />
      <Calculator
        canSave={can(user.role, "finance.edit")}
        clients={can(user.role, "finance.edit") ? clients : []}
        buckets={buckets}
        showAllocation={can(user.role, "cost.view")}
        pkg={{ blendedRate: p.blendedRate, retainerAmount: p.retainerAmount, retainerHours: p.retainerHours, additionalHourRate: p.additionalHourRate }}
        roles={roles.map((r) => ({ id: r.id, name: r.name, standard: r.standardRate, floor: floorRate(r, p), premium: premiumRates(r.standardRate, p).min, usLoaded: usLoadedRate(r.usSalary, p) }))}
      />
    </>
  );
}
