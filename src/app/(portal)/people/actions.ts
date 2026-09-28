"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addDays, monthRange } from "@/lib/finance";
import { type Result, fail, optDate, optStr } from "@/lib/result";

const PersonSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: optStr,
  title: optStr,
  type: z.enum(["EMPLOYEE", "CONTRACTOR"]),
  roleId: optStr,
  costBasis: z.enum(["MONTHLY", "HOURLY"]),
  costInr: z.coerce.number().min(0, "Cost must be ≥ 0"),
  stdHoursPerMonth: z.coerce.number().positive("Standard hours must be > 0"),
  startDate: optDate,
  endDate: optDate,
  nextReviewDate: optDate,
  notes: optStr,
});

/** People carry salary data, so creating and editing them is admin-only. */
export async function savePerson(_: Result, fd: FormData): Promise<Result> {
  const id = String(fd.get("id") ?? "");
  let personId = id;
  try {
    const user = await assertRole("ADMIN");
    const data = { ...PersonSchema.parse(Object.fromEntries(fd)), active: fd.get("active") === "on" || !id };
    if (id) {
      const prev = await prisma.person.findUniqueOrThrow({ where: { id } });
      await prisma.person.update({ where: { id }, data });
      const costChange = prev.costInr !== data.costInr || prev.costBasis !== data.costBasis ? ` (cost ${prev.costBasis} ₹${prev.costInr} → ${data.costBasis} ₹${data.costInr})` : "";
      await audit(user, "UPDATE", "Person", id, `Updated ${data.name}${costChange}`);
    } else {
      personId = (await prisma.person.create({ data })).id;
      await audit(user, "CREATE", "Person", personId, `Added ${data.name} (${data.type})`);
    }
    revalidatePath("/people");
  } catch (e) {
    return fail(e);
  }
  if (!id) redirect(`/people/${personId}`);
  return { ok: true, message: "Saved." };
}

export async function deletePerson(id: string) {
  const user = await assertRole("ADMIN");
  const p = await prisma.person.findUniqueOrThrow({ where: { id }, include: { _count: { select: { timeEntries: true, expenses: true } } } });
  if (p._count.timeEntries || p._count.expenses) throw new Error("Person has timesheets or payroll — mark inactive instead");
  await prisma.person.delete({ where: { id } });
  await audit(user, "DELETE", "Person", id, `Deleted ${p.name}`);
  revalidatePath("/people");
  redirect("/people");
}

/**
 * Payroll run → expenses for the month (unpaid until marked paid):
 * employees and monthly contractors at their monthly cost; hourly contractors at logged hours × rate.
 * Idempotent: people who already have a payroll expense for the month are skipped.
 */
export async function runPayroll(month: string): Promise<Result> {
  try {
    const user = await assertRole("ADMIN");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Pick a month");
    const { from, to } = monthRange(month);
    const [people, cats, done] = await Promise.all([
      prisma.person.findMany({
        where: { active: true, OR: [{ startDate: null }, { startDate: { lt: to } }], AND: [{ OR: [{ endDate: null }, { endDate: { gte: from } }] }] },
        include: { timeEntries: { where: { date: { gte: from, lt: to } } } },
      }),
      prisma.expenseCategory.findMany(),
      prisma.expense.findMany({ where: { payrollMonth: month }, select: { personId: true } }),
    ]);
    const salaries = cats.find((c) => c.name.startsWith("Salaries")) ?? cats.find((c) => c.bucketKey === "delivery");
    const contractors = cats.find((c) => c.name.startsWith("Contractor")) ?? salaries;
    if (!salaries || !contractors) throw new Error("Create a Delivery expense category for salaries first");
    const skip = new Set(done.map((d) => d.personId));
    const date = addDays(to, -1);
    let created = 0,
      total = 0;
    for (const p of people) {
      if (skip.has(p.id)) continue;
      const hours = p.timeEntries.reduce((s, e) => s + e.hours, 0);
      const amount = p.costBasis === "HOURLY" ? hours * p.costInr : p.costInr;
      if (amount <= 0) continue;
      await prisma.expense.create({
        data: {
          date,
          vendor: p.name,
          description: p.costBasis === "HOURLY" ? `${month} — ${hours} hrs × ₹${p.costInr}` : `${month} payroll`,
          categoryId: p.type === "EMPLOYEE" ? salaries.id : contractors.id,
          amount,
          amountInr: amount,
          personId: p.id,
          payrollMonth: month,
        },
      });
      created++;
      total += amount;
    }
    await audit(user, "CREATE", "Payroll", null, `${month}: ${created} payroll expense(s), ₹${Math.round(total)}`);
    revalidatePath("/expenses");
    revalidatePath("/people");
    return { ok: true, message: created ? `Created ${created} payroll expense(s) totalling ₹${Math.round(total).toLocaleString("en-IN")}.` : `Nothing to add — payroll for ${month} is already recorded.` };
  } catch (e) {
    return fail(e);
  }
}
