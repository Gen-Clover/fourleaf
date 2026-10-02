"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertPermission } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { getBuckets, getParams } from "../../lib/settings";
import { isApproved, requestApproval } from "../../lib/approvals";
import { effectiveRate, floorRate, monthlyRevenue, premiumRates, quoteSummary } from "../../lib/calc";
import { addDays, monthRange, weekStart, ymd } from "../../lib/finance";
import { TIERS } from "@genclover/ui/format";

export type Result = { ok: boolean; message: string } | undefined;

const errMsg = (e: unknown) => (e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : String(e));
const optStr = z.string().trim().transform((s) => (s === "" ? null : s)).nullable().optional();
const optDate = z.string().trim().transform((s) => (s === "" ? null : new Date(s))).nullable().optional();
const MODEL = z.enum(["TM", "RETAINER", "BLENDED", "FIXED", "FIXED_PRICE"]);

/** Next ID for a project of this client: ABR-P01, ABR-P02 … */
async function nextCode(clientId: string) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, code: true } });
  return ids.nextProjectCode(prisma, client);
}

/** Quick Calculator → project: creates the project and its resource lines in one go. */
export async function createProjectFromCalculator(input: unknown): Promise<Result & { id?: string }> {
  try {
    const user = await assertPermission("finance.edit");
    const d = z
      .object({
        name: z.string().trim().min(1, "Project name is required"),
        clientId: z.string().min(1, "Select a client"),
        engagementModel: MODEL,
        lines: z.array(z.object({ roleId: z.string(), hoursPerMonth: z.number().min(0), headcount: z.number().int().min(1), tier: z.enum(TIERS as [string, ...string[]]), quotedRate: z.number().min(0) })).min(1, "Add at least one resource"),
      })
      .parse(input);
    const [p, buckets, roles] = await Promise.all([getParams(), getBuckets(), prisma.roleRate.findMany()]);
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const code = await nextCode(d.clientId);
    const project = await prisma.project.create({
      data: {
        code,
        name: d.name,
        clientId: d.clientId,
        engagementModel: d.engagementModel,
        status: "QUOTED",
        allocationSnapshot: JSON.stringify(buckets),
        createdById: user.id,
        agreedBlendedRate: d.engagementModel === "BLENDED" ? p.blendedRate : null,
        agreedMonthly: d.engagementModel === "RETAINER" ? p.retainerAmount : null,
        agreedRetainerHrs: d.engagementModel === "RETAINER" ? p.retainerHours : null,
        agreedExtraRate: d.engagementModel === "RETAINER" ? p.additionalHourRate : null,
        resources: {
          create: d.lines.map((l, i) => {
            const role = roleById.get(l.roleId);
            if (!role) throw new Error("Unknown role on the rate card");
            return { roleId: role.id, label: role.name, headcount: l.headcount, hoursPerMonth: l.hoursPerMonth, tier: l.tier, quotedRate: l.quotedRate, standardRate: role.standardRate, floorRate: floorRate(role, p), sortOrder: i };
          }),
        },
      },
    });
    await audit(user, "CREATE", "Project", project.id, `Created ${code} — ${d.name} from Quick Calculator`);
    revalidatePath("/projects");
    return { ok: true, message: `Created ${code}`, id: project.id };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

const ResourceRow = z.object({
  id: z.string().optional(),
  roleId: z.string().nullable(),
  label: z.string().trim().min(1, "Every resource needs a label"),
  headcount: z.number().int().min(1),
  hoursPerMonth: z.number().min(0),
  tier: z.enum(TIERS as [string, ...string[]]),
  quotedRate: z.number().min(0),
  agreedRate: z.number().min(0).nullable(),
});

export async function saveResources(projectId: string, rows: unknown): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const data = z.array(ResourceRow).parse(rows);
    const [p, roles, existing, project] = await Promise.all([
      getParams(),
      prisma.roleRate.findMany(),
      prisma.projectResource.findMany({ where: { projectId } }),
      prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    ]);
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const keep = new Set(data.filter((r) => r.id).map((r) => r.id));

    await prisma.$transaction(async (tx) => {
      await tx.projectResource.deleteMany({ where: { projectId, id: { notIn: [...keep] as string[] } } });
      for (const [i, r] of data.entries()) {
        const prev = r.id ? existing.find((e) => e.id === r.id) : undefined;
        const role = r.roleId ? roleById.get(r.roleId) : undefined;
        // Snapshot rate card values when the line is new or its role changed
        const snapshot =
          prev && prev.roleId === r.roleId
            ? { standardRate: prev.standardRate, floorRate: prev.floorRate }
            : role
              ? { standardRate: role.standardRate, floorRate: floorRate(role, p) }
              : { standardRate: r.quotedRate, floorRate: r.quotedRate };
        let quotedRate = r.quotedRate;
        if (r.tier === "STANDARD") quotedRate = snapshot.standardRate;
        if (r.tier === "FLOOR") quotedRate = snapshot.floorRate;
        if (r.tier === "PREMIUM" && !(prev && prev.tier === "PREMIUM" && prev.roleId === r.roleId)) quotedRate = r.quotedRate || premiumRates(snapshot.standardRate, p).min;
        const payload = { roleId: r.roleId, label: r.label, headcount: r.headcount, hoursPerMonth: r.hoursPerMonth, tier: r.tier, quotedRate, agreedRate: r.agreedRate, sortOrder: i, ...snapshot };
        if (prev) await tx.projectResource.update({ where: { id: prev.id }, data: payload });
        else await tx.projectResource.create({ data: { ...payload, projectId } });
      }
    });
    await audit(user, "UPDATE", "Project", projectId, `${project.code}: resources/quote saved (${data.length} lines)`);
    revalidatePath(`/finance/projects/${projectId}`);
    return { ok: true, message: "Resources & quote saved." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

const num = z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(0).nullable());

const AgreementSchema = z.object({
  engagementModel: MODEL,
  agreedMonthly: num,
  agreedBlendedRate: num,
  agreedRetainerHrs: num,
  agreedExtraRate: num,
  agreementNotes: optStr,
  agreedAt: optDate,
  markAgreed: z.string().optional(),
});

export async function saveAgreement(id: string, _: Result, fd: FormData): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const { markAgreed, ...d } = AgreementSchema.parse(Object.fromEntries(fd));
    if (d.engagementModel === "RETAINER" && (d.agreedMonthly == null || d.agreedRetainerHrs == null)) throw new Error("Retainer needs a monthly amount and included hours");
    if (d.engagementModel === "BLENDED" && d.agreedBlendedRate == null) throw new Error("Blended model needs a blended rate");
    if (d.engagementModel === "FIXED" && d.agreedMonthly == null) throw new Error("Fixed model needs a monthly fee");
    const prev = await prisma.project.findUniqueOrThrow({ where: { id }, include: { resources: true } });
    const agreeNow = markAgreed === "on";
    // Rates below the rate-card floor need a price exception, approved by a second person.
    const below = quoteSummary(prev.resources).belowFloor;
    if (agreeNow && below.length && !(await isApproved("PRICE_EXCEPTION", id))) {
      await requestApproval("PRICE_EXCEPTION", id, { summary: `${prev.code}: ${below.join(", ")} below the floor`, link: `/finance/projects/${id}?tab=pricing`, by: user });
      revalidatePath("/approvals");
      throw new Error(`Priced below the floor (${below.join(", ")}): sent to Approvals. Mark it agreed once the price exception is approved.`);
    }
    await prisma.project.update({
      where: { id },
      data: {
        ...d,
        agreedAt: agreeNow ? (d.agreedAt ?? new Date()) : d.agreedAt,
        status: agreeNow && ["DRAFT", "QUOTED", "NEGOTIATION"].includes(prev.status) ? "ACTIVE" : prev.status,
      },
    });
    await audit(user, "UPDATE", "Agreement", id, `${prev.code}: agreement saved (${d.engagementModel}${agreeNow ? ", marked agreed" : ""})`);
    revalidatePath(`/finance/projects/${id}`);
    return { ok: true, message: agreeNow ? "Agreement saved and project marked as agreed/active." : "Agreement saved." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function refreshSnapshot(id: string) {
  const user = await assertPermission("finance.settings");
  const buckets = await getBuckets();
  const p = await prisma.project.update({ where: { id }, data: { allocationSnapshot: JSON.stringify(buckets) } });
  await audit(user, "UPDATE", "Project", id, `${p.code}: allocation snapshot refreshed to current model`);
  revalidatePath(`/finance/projects/${id}`);
}

export async function deleteProject(id: string) {
  const user = await assertPermission("admin");
  const issued = await prisma.invoice.count({ where: { projectId: id, status: { not: "DRAFT" } } });
  if (issued) throw new Error("Project has issued invoices — set it to Cancelled or Completed instead of deleting");
  const p = await prisma.project.delete({ where: { id } });
  await audit(user, "DELETE", "Project", id, `Deleted ${p.code} — ${p.name}`);
  revalidatePath("/projects");
  redirect("/projects");
}

// ---------- Monthly ----------

const MonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  adjustment: z.number(),
  notes: z.string().nullable(),
  lines: z.array(z.object({ resourceId: z.string().nullable(), label: z.string().min(1), hours: z.number().min(0), rate: z.number().min(0) })),
});

export async function saveMonth(projectId: string, input: unknown, originalMonth?: string): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const d = MonthSchema.parse(input);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const calc = monthlyRevenue(project, d.lines, d.adjustment);
    const clash = await prisma.monthlyRecord.findUnique({ where: { projectId_month: { projectId, month: d.month } } });
    if (clash && d.month !== originalMonth) throw new Error(`${d.month} already exists for this project — edit it instead`);

    const fields = { month: d.month, adjustment: d.adjustment, hours: calc.hours, revenue: calc.revenue, notes: d.notes || null };
    const existing = originalMonth
      ? await prisma.monthlyRecord.findUnique({ where: { projectId_month: { projectId, month: originalMonth } }, include: { invoice: { select: { number: true } } } })
      : null;
    if (existing?.invoice) throw new Error(`${originalMonth} is on invoice ${existing.invoice.number} — delete or void that invoice to change the month`);
    await prisma.$transaction(async (tx) => {
      const rec = existing
        ? await tx.monthlyRecord.update({ where: { id: existing.id }, data: fields })
        : await tx.monthlyRecord.create({ data: { ...fields, projectId } });
      await tx.monthlyLine.deleteMany({ where: { recordId: rec.id } });
      await tx.monthlyLine.createMany({ data: d.lines.map((l) => ({ ...l, recordId: rec.id })) });
    });
    await audit(user, existing ? "UPDATE" : "CREATE", "Billing", projectId, `${project.code} ${d.month}: ${calc.hours} hrs, $${calc.revenue.toFixed(2)}`);
    revalidatePath(`/finance/projects/${projectId}`);
    revalidatePath("/billing");
    return { ok: true, message: `${d.month} saved — revenue $${calc.revenue.toFixed(2)}.` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function deleteMonth(projectId: string, month: string) {
  const user = await assertPermission("finance.edit");
  const rec = await prisma.monthlyRecord.findUniqueOrThrow({ where: { projectId_month: { projectId, month } }, include: { project: true } });
  if (rec.invoiceId) throw new Error("Month is on an invoice — delete or void the invoice first");
  await prisma.monthlyRecord.delete({ where: { id: rec.id } });
  await audit(user, "DELETE", "Billing", projectId, `${rec.project.code} ${month} deleted`);
  revalidatePath(`/finance/projects/${projectId}`);
  redirect(`/finance/projects/${projectId}?tab=monthly`);
}

/**
 * Billed hours for a month from approved timesheets, one line per resource of the quote. Billed hours already
 * carry each person's billing basis (hours worked, fixed hours per day, or a multiplier). People are mapped to a
 * resource line through their assignment; unmapped time gets its own line. Unapproved weeks are left out.
 */
export async function timesheetMonthLines(projectId: string, month: string) {
  await assertPermission("finance.edit");
  const { from, to } = monthRange(month);
  const [resources, assignments, entries] = await Promise.all([
    prisma.projectResource.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
    prisma.assignment.findMany({ where: { projectId } }),
    prisma.timeEntry.findMany({ where: { projectId, billable: true, date: { gte: from, lt: to } }, include: { person: { select: { name: true } } } }),
  ]);
  const approved = new Set(
    (await prisma.timesheetWeek.findMany({ where: { status: "APPROVED", weekStart: { gte: addDays(from, -6), lt: to } }, select: { personId: true, weekStart: true } })).map((w) => `${w.personId}:${ymd(w.weekStart)}`),
  );
  const counted = entries.filter((e) => approved.has(`${e.personId}:${ymd(weekStart(e.date))}`));
  const pending = entries.length - counted.length;
  const lineOf = new Map(assignments.map((a) => [a.personId, a.resourceId]));
  const hoursByResource = new Map<string, number>();
  const unmapped = new Map<string, number>();
  for (const e of counted) {
    const h = e.billedHours ?? e.hours;
    const rid = lineOf.get(e.personId);
    if (rid) hoursByResource.set(rid, (hoursByResource.get(rid) ?? 0) + h);
    else unmapped.set(e.person.name, (unmapped.get(e.person.name) ?? 0) + h);
  }
  return {
    total: counted.reduce((s, e) => s + (e.billedHours ?? e.hours), 0),
    pendingEntries: pending,
    lines: [
      ...resources.map((r) => ({ resourceId: r.id as string | null, label: r.headcount > 1 ? `${r.label} ×${r.headcount}` : r.label, hours: hoursByResource.get(r.id) ?? 0, rate: effectiveRate(r) })),
      ...[...unmapped.entries()].map(([name, hours]) => ({ resourceId: null, label: `${name} (not mapped to a quote line)`, hours, rate: 0 })),
    ],
  };
}
