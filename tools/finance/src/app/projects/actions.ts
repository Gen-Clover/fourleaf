"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertRole } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { getBuckets, getParams } from "../../lib/settings";
import { effectiveRate, floorRate, monthlyRevenue, premiumRates } from "../../lib/calc";
import { monthRange } from "../../lib/finance";
import { PROJECT_STATUSES, TIERS } from "@genclover/ui/format";

export type Result = { ok: boolean; message: string } | undefined;

const errMsg = (e: unknown) => (e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : String(e));
const optStr = z.string().trim().transform((s) => (s === "" ? null : s)).nullable().optional();
const optDate = z.string().trim().transform((s) => (s === "" ? null : new Date(s))).nullable().optional();
const MODEL = z.enum(["TM", "RETAINER", "BLENDED", "FIXED"]);

const ProjectInfo = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  clientId: z.string().min(1, "Select a client"),
  engagementModel: MODEL,
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]).optional(),
  startDate: optDate,
  endDate: optDate,
  description: optStr,
  probability: z.string().trim().transform((s) => (s === "" ? null : Math.round(Number(s)))).pipe(z.number().min(0).max(100, "Probability is 0–100%").nullable()).optional(),
  expectedCloseDate: optDate,
});

async function nextCode() {
  const { projectCodePrefix } = await getParams();
  const year = new Date().getFullYear();
  const prefix = `${projectCodePrefix}-${year}-`;
  const last = await prisma.project.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" } });
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function createProject(_: Result, fd: FormData): Promise<Result> {
  let id = "";
  try {
    const user = await assertRole("EDITOR");
    const d = ProjectInfo.parse(Object.fromEntries(fd));
    const buckets = await getBuckets();
    const p = await getParams();
    const code = await nextCode();
    const project = await prisma.project.create({
      data: {
        ...d,
        code,
        status: "DRAFT",
        allocationSnapshot: JSON.stringify(buckets),
        createdById: user.id,
        // sensible agreement defaults from packages
        agreedBlendedRate: d.engagementModel === "BLENDED" ? p.blendedRate : null,
        agreedMonthly: d.engagementModel === "RETAINER" ? p.retainerAmount : null,
        agreedRetainerHrs: d.engagementModel === "RETAINER" ? p.retainerHours : null,
        agreedExtraRate: d.engagementModel === "RETAINER" ? p.additionalHourRate : null,
      },
    });
    id = project.id;
    await audit(user, "CREATE", "Project", id, `Created ${code} — ${d.name}`);
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  revalidatePath("/projects");
  redirect(`/projects/${id}?tab=pricing`);
}

/** Quick Calculator → project: creates the project and its resource lines in one go. */
export async function createProjectFromCalculator(input: unknown): Promise<Result & { id?: string }> {
  try {
    const user = await assertRole("EDITOR");
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
    const code = await nextCode();
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

export async function updateProject(id: string, _: Result, fd: FormData): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const d = ProjectInfo.parse(Object.fromEntries(fd));
    const prev = await prisma.project.findUniqueOrThrow({ where: { id } });
    await prisma.project.update({ where: { id }, data: d });
    const changes = [prev.status !== d.status && `status ${prev.status} → ${d.status}`, prev.engagementModel !== d.engagementModel && `model ${prev.engagementModel} → ${d.engagementModel}`].filter(Boolean);
    await audit(user, "UPDATE", "Project", id, `${prev.code}: details updated${changes.length ? ` (${changes.join(", ")})` : ""}`);
    revalidatePath(`/projects/${id}`);
    return { ok: true, message: "Project saved." };
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
    const user = await assertRole("EDITOR");
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
    revalidatePath(`/projects/${projectId}`);
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
    const user = await assertRole("EDITOR");
    const { markAgreed, ...d } = AgreementSchema.parse(Object.fromEntries(fd));
    if (d.engagementModel === "RETAINER" && (d.agreedMonthly == null || d.agreedRetainerHrs == null)) throw new Error("Retainer needs a monthly amount and included hours");
    if (d.engagementModel === "BLENDED" && d.agreedBlendedRate == null) throw new Error("Blended model needs a blended rate");
    if (d.engagementModel === "FIXED" && d.agreedMonthly == null) throw new Error("Fixed model needs a monthly fee");
    const prev = await prisma.project.findUniqueOrThrow({ where: { id } });
    const agreeNow = markAgreed === "on";
    await prisma.project.update({
      where: { id },
      data: {
        ...d,
        agreedAt: agreeNow ? (d.agreedAt ?? new Date()) : d.agreedAt,
        status: agreeNow && ["DRAFT", "QUOTED", "NEGOTIATION"].includes(prev.status) ? "ACTIVE" : prev.status,
      },
    });
    await audit(user, "UPDATE", "Agreement", id, `${prev.code}: agreement saved (${d.engagementModel}${agreeNow ? ", marked agreed" : ""})`);
    revalidatePath(`/projects/${id}`);
    return { ok: true, message: agreeNow ? "Agreement saved and project marked as agreed/active." : "Agreement saved." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function refreshSnapshot(id: string) {
  const user = await assertRole("ADMIN");
  const buckets = await getBuckets();
  const p = await prisma.project.update({ where: { id }, data: { allocationSnapshot: JSON.stringify(buckets) } });
  await audit(user, "UPDATE", "Project", id, `${p.code}: allocation snapshot refreshed to current model`);
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  const user = await assertRole("ADMIN");
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
    const user = await assertRole("EDITOR");
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
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/billing");
    return { ok: true, message: `${d.month} saved — revenue $${calc.revenue.toFixed(2)}.` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function deleteMonth(projectId: string, month: string) {
  const user = await assertRole("EDITOR");
  const rec = await prisma.monthlyRecord.findUniqueOrThrow({ where: { projectId_month: { projectId, month } }, include: { project: true } });
  if (rec.invoiceId) throw new Error("Month is on an invoice — delete or void the invoice first");
  await prisma.monthlyRecord.delete({ where: { id: rec.id } });
  await audit(user, "DELETE", "Billing", projectId, `${rec.project.code} ${month} deleted`);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?tab=monthly`);
}

/**
 * Actual billable hours for a month from timesheets, one line per resource of the quote.
 * People are mapped to a resource line through their project assignment; unmapped time gets its own line.
 */
export async function timesheetMonthLines(projectId: string, month: string) {
  await assertRole("EDITOR");
  const { from, to } = monthRange(month);
  const [resources, assignments, entries] = await Promise.all([
    prisma.projectResource.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
    prisma.assignment.findMany({ where: { projectId } }),
    prisma.timeEntry.findMany({ where: { projectId, billable: true, date: { gte: from, lt: to } }, include: { person: { select: { name: true } } } }),
  ]);
  const lineOf = new Map(assignments.map((a) => [a.personId, a.resourceId]));
  const hoursByResource = new Map<string, number>();
  const unmapped = new Map<string, number>();
  for (const e of entries) {
    const rid = lineOf.get(e.personId);
    if (rid) hoursByResource.set(rid, (hoursByResource.get(rid) ?? 0) + e.hours);
    else unmapped.set(e.person.name, (unmapped.get(e.person.name) ?? 0) + e.hours);
  }
  return {
    total: entries.reduce((s, e) => s + e.hours, 0),
    lines: [
      ...resources.map((r) => ({ resourceId: r.id as string | null, label: r.headcount > 1 ? `${r.label} ×${r.headcount}` : r.label, hours: hoursByResource.get(r.id) ?? 0, rate: effectiveRate(r) })),
      ...[...unmapped.entries()].map(([name, hours]) => ({ resourceId: null, label: `${name} (not mapped to a quote line)`, hours, rate: 0 })),
    ],
  };
}
