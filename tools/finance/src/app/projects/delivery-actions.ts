"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertRole } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { MILESTONE_STATUSES } from "@genclover/ui/format";
import { utcDay } from "../../lib/finance";
import { type Result, fail } from "@genclover/ui/result";

const MilestoneRow = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Every milestone needs a title"),
  ownerId: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: z.enum(MILESTONE_STATUSES as [string, ...string[]]),
  notes: z.string().nullable(),
});

export async function saveMilestones(projectId: string, rows: unknown): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const data = z.array(MilestoneRow).parse(rows);
    const [project, existing] = await Promise.all([
      prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
      prisma.milestone.findMany({ where: { projectId } }),
    ]);
    const keep = data.filter((r) => r.id).map((r) => r.id as string);
    await prisma.$transaction(async (tx) => {
      await tx.milestone.deleteMany({ where: { projectId, id: { notIn: keep } } });
      for (const [i, r] of data.entries()) {
        const prev = existing.find((e) => e.id === r.id);
        const completedAt = r.status === "DONE" ? (prev?.completedAt ?? new Date()) : null;
        const payload = { title: r.title, ownerId: r.ownerId || null, dueDate: r.dueDate ? utcDay(r.dueDate) : null, status: r.status, notes: r.notes || null, completedAt, sortOrder: i };
        if (prev) await tx.milestone.update({ where: { id: prev.id }, data: payload });
        else await tx.milestone.create({ data: { ...payload, projectId } });
      }
    });
    const done = data.filter((r) => r.status === "DONE").length;
    await audit(user, "UPDATE", "Milestones", projectId, `${project.code}: ${data.length} milestones (${done} done)`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Milestones saved." };
  } catch (e) {
    return fail(e);
  }
}

const AssignmentRow = z.object({
  personId: z.string().min(1, "Pick a person on every row"),
  resourceId: z.string().nullable(),
  hoursPerMonth: z.number().min(0),
  billable: z.boolean(),
});

export async function saveAssignments(projectId: string, rows: unknown): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const data = z.array(AssignmentRow).parse(rows);
    const ids = data.map((r) => r.personId);
    if (new Set(ids).size !== ids.length) throw new Error("A person can only be assigned once per project");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await prisma.$transaction(async (tx) => {
      await tx.assignment.deleteMany({ where: { projectId, personId: { notIn: ids } } });
      for (const r of data) {
        const payload = { resourceId: r.resourceId || null, hoursPerMonth: r.hoursPerMonth, billable: r.billable };
        await tx.assignment.upsert({ where: { projectId_personId: { projectId, personId: r.personId } }, update: payload, create: { ...payload, projectId, personId: r.personId } });
      }
    });
    await audit(user, "UPDATE", "Team", projectId, `${project.code}: ${data.length} people assigned`);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/timesheets");
    return { ok: true, message: "Team saved." };
  } catch (e) {
    return fail(e);
  }
}
