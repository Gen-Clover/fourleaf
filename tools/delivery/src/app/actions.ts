"use server";

// Delivery & Resources: projects (no money), milestones and acceptance, team, resource requests, timesheets and
// their approval. Billing basis and billed hours are finance data: only roles with "finance.view" set them.
import { revalidatePath } from "next/cache";

import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertPermission, can } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { getBuckets, getParams } from "@genclover/finance/lib/settings";
import { addDays, utcDay, weekStart, ymd } from "@genclover/finance/lib/finance";
import { hourlyCost } from "@genclover/people/lib/pay";
import { MILESTONE_STATUSES, PROJECT_KINDS, PROJECT_STATUSES } from "@genclover/ui/format";
import { type Result, fail, optDate, optStr } from "@genclover/ui/result";
import { BILL_MODES, billedHours } from "../lib/billing";

const MODEL = z.enum(["TM", "RETAINER", "BLENDED", "FIXED", "FIXED_PRICE"]);

const touchProject = (id: string) => {
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath(`/finance/projects/${id}`);
  revalidatePath("/delivery");
};

// ---------- Projects ----------

const NewProject = z.object({
  clientId: z.string().min(1, "Pick the client"),
  name: z.string().trim().min(1, "Project name is required"),
  kind: z.enum(PROJECT_KINDS).default("PROJECT"),
  engagementModel: MODEL,
  status: z.enum(["DRAFT", "ACTIVE"]).default("ACTIVE"),
  // Empty = the client's billing currency.
  currency: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["INR", "USD"]).optional()),
  startDate: optDate,
  endDate: optDate,
  description: optStr,
  deliveryManager: optStr,
  opportunityId: optStr,
  sowId: optStr,
});

/**
 * Set up a project: its ID (ABR-P01), client, type and engagement model. Prices, quote and billing are added
 * in Finance (Commercials). A project from a won deal links the deal; a SOW can be attached straight away.
 */
export async function createProject(input: Record<string, string>): Promise<Result & { id?: string }> {
  try {
    const user = await assertPermission("projects.create");
    const d = NewProject.parse(input);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: d.clientId }, select: { id: true, code: true, currency: true } });
    const [buckets, p] = await Promise.all([getBuckets(), getParams()]);
    const code = await ids.nextProjectCode(prisma, client);
    const project = await prisma.project.create({
      data: {
        code,
        clientId: client.id,
        name: d.name,
        kind: d.kind,
        engagementModel: d.engagementModel,
        status: d.status,
        currency: d.currency ?? client.currency,
        startDate: d.startDate,
        endDate: d.endDate,
        description: d.description,
        deliveryManager: d.deliveryManager,
        opportunityId: d.opportunityId,
        agreedAt: d.status === "ACTIVE" ? new Date() : null,
        allocationSnapshot: JSON.stringify(buckets),
        createdById: user.id,
        // Package defaults; Finance changes them on the Commercials page.
        agreedBlendedRate: d.engagementModel === "BLENDED" ? p.blendedRate : null,
        agreedMonthly: d.engagementModel === "RETAINER" ? p.retainerAmount : null,
        agreedRetainerHrs: d.engagementModel === "RETAINER" ? p.retainerHours : null,
        agreedExtraRate: d.engagementModel === "RETAINER" ? p.additionalHourRate : null,
      },
    });
    if (d.opportunityId) await prisma.opportunity.update({ where: { id: d.opportunityId }, data: { projectId: project.id } });
    if (d.sowId) await prisma.agreement.update({ where: { id: d.sowId }, data: { projectId: project.id } });
    await audit(user, "CREATE", "Project", project.id, `Created ${code} — ${d.name}`);
    touchProject(project.id);
    revalidatePath(`/clients/${client.id}`);
    return { ok: true, message: `${code} created.`, id: project.id };
  } catch (e) {
    return fail(e);
  }
}

const ProjectUpdate = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
  kind: z.enum(PROJECT_KINDS),
  engagementModel: MODEL,
  startDate: optDate,
  endDate: optDate,
  description: optStr,
  deliveryManager: optStr,
  probability: z.string().trim().transform((s) => (s === "" ? null : Math.round(Number(s)))).pipe(z.number().min(0).max(100).nullable()).optional(),
  expectedCloseDate: optDate,
});

export async function updateProject(id: string, _: Result, fd: FormData): Promise<Result> {
  try {
    const user = await assertPermission("projects.edit", "finance.edit");
    const d = ProjectUpdate.parse(Object.fromEntries(fd));
    const prev = await prisma.project.findUniqueOrThrow({ where: { id } });
    // The engagement model is commercial: only finance changes it.
    const data = can(user.role, "finance.edit") ? d : { ...d, engagementModel: prev.engagementModel };
    await prisma.project.update({ where: { id }, data });
    const changes = [prev.status !== d.status && `status ${prev.status} → ${d.status}`, prev.engagementModel !== data.engagementModel && `model ${prev.engagementModel} → ${data.engagementModel}`].filter(Boolean);
    await audit(user, "UPDATE", "Project", id, `${prev.code}: details updated${changes.length ? ` (${changes.join(", ")})` : ""}`);
    touchProject(id);
    return { ok: true, message: "Project saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Milestones ----------

const MilestoneRow = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Every milestone needs a title"),
  ownerId: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: z.enum(MILESTONE_STATUSES as [string, ...string[]]),
  notes: z.string().nullable(),
  acceptanceRef: z.string().nullable().optional(),
});

export async function saveMilestones(projectId: string, rows: unknown): Promise<Result> {
  try {
    const user = await assertPermission("projects.edit");
    const data = z.array(MilestoneRow).parse(rows);
    const [project, existing] = await Promise.all([prisma.project.findUniqueOrThrow({ where: { id: projectId } }), prisma.milestone.findMany({ where: { projectId } })]);
    const keep = new Set(data.filter((r) => r.id).map((r) => r.id as string));
    const billed = existing.filter((m) => !keep.has(m.id) && m.invoiceId);
    if (billed.length) throw new Error(`"${billed[0].title}" has been invoiced and can't be removed`);
    await prisma.$transaction(async (tx) => {
      await tx.milestone.deleteMany({ where: { projectId, id: { notIn: [...keep] } } });
      for (const [i, r] of data.entries()) {
        const prev = existing.find((e) => e.id === r.id);
        const completedAt = r.status === "DONE" ? (prev?.completedAt ?? new Date()) : null;
        const acceptanceRef = r.acceptanceRef?.trim() || null;
        const payload = {
          title: r.title,
          ownerId: r.ownerId || null,
          dueDate: r.dueDate ? utcDay(r.dueDate) : null,
          status: r.status,
          notes: r.notes || null,
          completedAt,
          acceptanceRef,
          acceptedAt: acceptanceRef ? (prev?.acceptedAt ?? new Date()) : null,
          sortOrder: i,
        };
        // Billing amount and invoice link are finance's: never touched here.
        if (prev) await tx.milestone.update({ where: { id: prev.id }, data: payload });
        else await tx.milestone.create({ data: { ...payload, projectId } });
      }
    });
    const done = data.filter((r) => r.status === "DONE").length;
    await audit(user, "UPDATE", "Milestones", projectId, `${project.code}: ${data.length} milestones (${done} done)`);
    touchProject(projectId);
    return { ok: true, message: "Milestones saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Team ----------

const AssignmentRow = z.object({
  personId: z.string().min(1, "Pick a person on every row"),
  resourceId: z.string().nullable(),
  hoursPerMonth: z.number().min(0),
  billable: z.boolean(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  billMode: z.enum(Object.keys(BILL_MODES) as [string, ...string[]]).optional(),
  billValue: z.number().min(0).max(24).optional(),
});

/** Re-work billed hours on a person's entries for a project after its billing basis changed. */
async function recomputeBilled(projectId: string, personId: string) {
  const a = await prisma.assignment.findUnique({ where: { projectId_personId: { projectId, personId } } });
  const entries = await prisma.timeEntry.findMany({ where: { projectId, personId }, select: { id: true, hours: true, billable: true } });
  for (const e of entries) {
    await prisma.timeEntry.update({ where: { id: e.id }, data: { billedHours: billedHours(e.hours, a ? { ...a, billable: e.billable } : null) } });
  }
}

export async function saveAssignments(projectId: string, rows: unknown): Promise<Result> {
  try {
    const user = await assertPermission("projects.edit", "resources.manage");
    const data = z.array(AssignmentRow).parse(rows);
    const people = data.map((r) => r.personId);
    if (new Set(people).size !== people.length) throw new Error("A person can only be assigned once per project");
    const finance = can(user.role, "finance.view");
    const [project, before] = await Promise.all([prisma.project.findUniqueOrThrow({ where: { id: projectId } }), prisma.assignment.findMany({ where: { projectId } })]);
    const changedBasis: string[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.assignment.deleteMany({ where: { projectId, personId: { notIn: people } } });
      for (const r of data) {
        const prev = before.find((b) => b.personId === r.personId);
        const basis = finance && r.billMode ? { billMode: r.billMode, billValue: r.billValue ?? 1 } : {};
        if (finance && r.billMode && (prev?.billMode !== r.billMode || prev?.billValue !== (r.billValue ?? 1) || prev?.billable !== r.billable)) changedBasis.push(r.personId);
        else if (prev && prev.billable !== r.billable) changedBasis.push(r.personId);
        const payload = { resourceId: r.resourceId || null, hoursPerMonth: r.hoursPerMonth, billable: r.billable, startDate: r.startDate ? utcDay(r.startDate) : null, endDate: r.endDate ? utcDay(r.endDate) : null, ...basis };
        await tx.assignment.upsert({ where: { projectId_personId: { projectId, personId: r.personId } }, update: payload, create: { ...payload, projectId, personId: r.personId } });
      }
    });
    for (const personId of changedBasis) await recomputeBilled(projectId, personId);
    await audit(user, "UPDATE", "Team", projectId, `${project.code}: ${data.length} people assigned${changedBasis.length ? `, billing basis changed for ${changedBasis.length}` : ""}`);
    touchProject(projectId);
    revalidatePath("/timesheets");
    revalidatePath("/resources");
    return { ok: true, message: "Team saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Resource requests ----------

const RequestInput = z.object({
  role: z.string().trim().min(1, "Which role or skill?"),
  skills: optStr,
  hoursPerMonth: z.coerce.number().min(1, "How many hours a month?").max(400),
  startDate: optDate,
  endDate: optDate,
  note: optStr,
});

/** A project manager asks for someone; the resource manager decides who (Resources page). */
export async function requestResource(projectId: string, input: Record<string, string>): Promise<Result> {
  try {
    const user = await assertPermission("projects.edit");
    const d = RequestInput.parse(input);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { code: true } });
    await prisma.resourceRequest.create({ data: { ...d, projectId, requestedBy: user.name } });
    await audit(user, "CREATE", "ResourceRequest", projectId, `${project.code}: needs ${d.role}, ${d.hoursPerMonth} hrs/month`);
    touchProject(projectId);
    revalidatePath("/resources");
    return { ok: true, message: "Request sent to the resource manager." };
  } catch (e) {
    return fail(e);
  }
}

/** Fill a request with a person: they are assigned to the project for the requested hours. */
export async function fillRequest(id: string, personId: string, note?: string): Promise<Result> {
  try {
    const user = await assertPermission("resources.manage");
    const r = await prisma.resourceRequest.findUniqueOrThrow({ where: { id }, include: { project: { select: { code: true } } } });
    if (r.status !== "OPEN") throw new Error("This request is already closed");
    const person = await prisma.person.findUniqueOrThrow({ where: { id: personId }, select: { name: true } });
    const existing = await prisma.assignment.findUnique({ where: { projectId_personId: { projectId: r.projectId, personId } } });
    if (existing) await prisma.assignment.update({ where: { id: existing.id }, data: { hoursPerMonth: existing.hoursPerMonth + r.hoursPerMonth } });
    else await prisma.assignment.create({ data: { projectId: r.projectId, personId, hoursPerMonth: r.hoursPerMonth, startDate: r.startDate, endDate: r.endDate } });
    await prisma.resourceRequest.update({ where: { id }, data: { status: "FILLED", personId, decidedBy: user.name, note: note || r.note } });
    await audit(user, "UPDATE", "ResourceRequest", r.projectId, `${r.project.code}: ${r.role} filled by ${person.name}`);
    touchProject(r.projectId);
    revalidatePath("/resources");
    revalidatePath("/approvals");
    return { ok: true, message: `${person.name} assigned to ${r.project.code}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelRequest(id: string, note?: string): Promise<Result> {
  try {
    const user = await assertPermission("resources.manage", "projects.edit");
    const r = await prisma.resourceRequest.update({ where: { id }, data: { status: "CANCELLED", decidedBy: user.name, note: note || undefined } });
    await audit(user, "UPDATE", "ResourceRequest", r.projectId, `Request for ${r.role} cancelled`);
    touchProject(r.projectId);
    revalidatePath("/resources");
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Timesheets ----------

const Week = z.object({
  personId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(z.object({ projectId: z.string().min(1, "Pick a project on every row"), billable: z.boolean(), hours: z.array(z.number().min(0).max(24)).length(7) })),
});

/** Who may touch this person's timesheet: themselves (hours.own, matched by email) or anyone with hours.all. */
async function timesheetUser(personId: string) {
  const user = await assertPermission("hours.own", "hours.all");
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  if (!can(user.role, "hours.all") && person.email?.toLowerCase() !== user.email.toLowerCase()) throw new Error("You can only log your own hours");
  return { user, person };
}

/**
 * Replace one person's week (Mon–Sun). Each entry snapshots the cost rate (pay model, fixed-fee work order)
 * and the billed hours (the assignment's billing basis), so later changes never rewrite history.
 */
export async function saveWeek(input: unknown): Promise<Result> {
  try {
    const d = Week.parse(input);
    const { user, person } = await timesheetUser(d.personId);
    const start = utcDay(d.weekStart);
    if (ymd(weekStart(start)) !== d.weekStart) throw new Error("Week must start on a Monday");
    const week = await prisma.timesheetWeek.findUnique({ where: { personId_weekStart: { personId: person.id, weekStart: start } } });
    if (week?.status === "APPROVED" && !can(user.role, "hours.approve")) throw new Error("This week is approved. Ask your manager to reopen it.");
    if (week?.status === "SUBMITTED" && !can(user.role, "hours.approve") && !can(user.role, "hours.all")) throw new Error("This week is submitted for approval. Ask your manager to reopen it.");
    const keys = d.rows.map((r) => `${r.projectId}:${r.billable}`);
    if (new Set(keys).size !== keys.length) throw new Error("Same project and billable type appears twice — merge the rows");
    for (let i = 0; i < 7; i++) {
      const day = d.rows.reduce((s, r) => s + r.hours[i], 0);
      if (day > 24) throw new Error(`${ymd(addDays(start, i))} has ${day} hours`);
    }
    const projectIds = [...new Set(d.rows.map((r) => r.projectId))];
    const [assignments, workOrders] = await Promise.all([
      prisma.assignment.findMany({ where: { personId: person.id, projectId: { in: projectIds } } }),
      prisma.workOrder.findMany({ where: { personId: person.id, projectId: { in: projectIds }, status: { in: ["ISSUED", "ACTIVE"] } } }),
    ]);
    const entries = d.rows.flatMap((r) => {
      const a = assignments.find((x) => x.projectId === r.projectId);
      const rate = hourlyCost(person, workOrders.find((w) => w.projectId === r.projectId));
      return r.hours
        .map((h, i) => ({
          personId: person.id,
          projectId: r.projectId,
          billable: r.billable,
          date: addDays(start, i),
          hours: h,
          billedHours: billedHours(h, a ? { ...a, billable: r.billable } : r.billable ? null : { billMode: "ACTUAL", billValue: 1, billable: false }),
          costRateInr: rate,
        }))
        .filter((e) => e.hours > 0);
    });
    const total = entries.reduce((s, e) => s + e.hours, 0);
    await prisma.$transaction([
      prisma.timeEntry.deleteMany({ where: { personId: person.id, date: { gte: start, lt: addDays(start, 7) } } }),
      prisma.timeEntry.createMany({ data: entries }),
      prisma.timesheetWeek.upsert({
        where: { personId_weekStart: { personId: person.id, weekStart: start } },
        create: { personId: person.id, weekStart: start, hours: total },
        update: { hours: total },
      }),
    ]);
    await audit(user, "UPDATE", "Timesheet", person.id, `${person.name} week of ${d.weekStart}: ${total} hrs`);
    revalidatePath("/timesheets");
    return { ok: true, message: `Saved ${total} hrs for ${person.name}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function submitWeek(personId: string, week: string): Promise<Result> {
  try {
    const { user, person } = await timesheetUser(personId);
    const start = utcDay(week);
    const w = await prisma.timesheetWeek.findUnique({ where: { personId_weekStart: { personId, weekStart: start } } });
    if (!w || w.hours <= 0) throw new Error("Save some hours first");
    if (w.status === "APPROVED") throw new Error("Already approved");
    await prisma.timesheetWeek.update({ where: { id: w.id }, data: { status: "SUBMITTED", submittedAt: new Date(), note: null } });
    await audit(user, "UPDATE", "Timesheet", personId, `${person.name} week of ${week} submitted (${w.hours} hrs)`);
    revalidatePath("/timesheets");
    revalidatePath("/timesheets/approve");
    revalidatePath("/approvals");
    return { ok: true, message: "Submitted for approval." };
  } catch (e) {
    return fail(e);
  }
}

/** Approve or send back a week. Only approved hours are paid (hourly people) and billed. */
export async function decideWeek(weekId: string, decision: "APPROVED" | "REJECTED" | "DRAFT", note?: string): Promise<Result> {
  try {
    const user = await assertPermission("hours.approve");
    const w = await prisma.timesheetWeek.findUniqueOrThrow({ where: { id: weekId }, include: { person: { select: { name: true, email: true } } } });
    if (decision !== "DRAFT" && w.person.email?.toLowerCase() === user.email.toLowerCase() && !can(user.role, "admin")) throw new Error("Someone else approves your own timesheet");
    if (decision === "REJECTED" && !note?.trim()) throw new Error("Say what needs fixing");
    await prisma.timesheetWeek.update({ where: { id: weekId }, data: { status: decision, decidedAt: new Date(), decidedBy: user.name, note: note?.trim() || null } });
    await audit(user, "UPDATE", "Timesheet", w.personId, `${w.person.name} week of ${ymd(w.weekStart)}: ${decision === "DRAFT" ? "reopened" : decision.toLowerCase()}${note ? ` (${note})` : ""}`);
    revalidatePath("/timesheets");
    revalidatePath("/timesheets/approve");
    revalidatePath("/approvals");
    return { ok: true, message: decision === "APPROVED" ? "Approved." : decision === "REJECTED" ? "Sent back." : "Reopened." };
  } catch (e) {
    return fail(e);
  }
}

