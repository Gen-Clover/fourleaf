"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addDays, hourlyCostInr, utcDay, weekStart, ymd } from "@/lib/finance";
import { type Result, fail } from "@/lib/result";

const Week = z.object({
  personId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(z.object({ projectId: z.string().min(1, "Pick a project on every row"), billable: z.boolean(), hours: z.array(z.number().min(0).max(24)).length(7) })),
});

/** Replaces one person's week (Mon–Sun). Cost rate is snapshotted from the person's current cost. */
export async function saveWeek(input: unknown): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const d = Week.parse(input);
    const start = utcDay(d.weekStart);
    if (ymd(weekStart(start)) !== d.weekStart) throw new Error("Week must start on a Monday");
    const keys = d.rows.map((r) => `${r.projectId}:${r.billable}`);
    if (new Set(keys).size !== keys.length) throw new Error("Same project and billable type appears twice — merge the rows");
    for (let i = 0; i < 7; i++) {
      const day = d.rows.reduce((s, r) => s + r.hours[i], 0);
      if (day > 24) throw new Error(`${ymd(addDays(start, i))} has ${day} hours`);
    }
    const person = await prisma.person.findUniqueOrThrow({ where: { id: d.personId } });
    const rate = hourlyCostInr(person);
    const entries = d.rows.flatMap((r) =>
      r.hours.map((h, i) => ({ personId: person.id, projectId: r.projectId, billable: r.billable, date: addDays(start, i), hours: h, costRateInr: rate })).filter((e) => e.hours > 0),
    );
    await prisma.$transaction([
      prisma.timeEntry.deleteMany({ where: { personId: person.id, date: { gte: start, lt: addDays(start, 7) } } }),
      prisma.timeEntry.createMany({ data: entries }),
    ]);
    const total = entries.reduce((s, e) => s + e.hours, 0);
    await audit(user, "UPDATE", "Timesheet", person.id, `${person.name} week of ${d.weekStart}: ${total} hrs`);
    revalidatePath("/timesheets");
    return { ok: true, message: `Saved ${total} hrs for ${person.name}.` };
  } catch (e) {
    return fail(e);
  }
}
