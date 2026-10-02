"use server";

// People: employees and contractors, their documents and checklists, and contractor work orders. Pay (salary,
// rate, retainer, work-order fees, TDS) is cost data: only roles with "cost.edit" can change it.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertPermission, can } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { type Result, fail, optDate, optStr } from "@genclover/ui/result";
import { costBasisOf, DOC_STATUSES, DOC_TYPES, PAY_MODELS, parseList, WORK_ORDER_PAY } from "../lib/pay";

const upper = z.string().trim().transform((s) => (s === "" ? null : s.toUpperCase())).nullable().optional();
const email = z.string().trim().transform((s) => (s === "" ? null : s.toLowerCase())).pipe(z.email("Invalid email").nullable()).optional();
const url = optStr.refine((v) => !v || /^https?:\/\/\S+$/.test(v), "Links must start with https://");
const num = (min = 0) => z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(min).nullable()).optional();

const touch = (id?: string) => {
  revalidatePath("/people");
  revalidatePath("/resources");
  if (id) revalidatePath(`/people/${id}`);
};

const Profile = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email,
  phone: optStr,
  title: optStr,
  department: optStr,
  managerName: optStr,
  type: z.enum(["EMPLOYEE", "CONTRACTOR"]),
  roleId: optStr,
  stdHoursPerMonth: z.coerce.number().positive("Standard hours must be more than 0"),
  startDate: optDate,
  endDate: optDate,
  pan: upper.refine((v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), "PAN should look like ABCDE1234F"),
  gstin: upper,
  notes: optStr,
});
const Pay = z.object({
  payModel: z.enum(Object.keys(PAY_MODELS) as [string, ...string[]]),
  costInr: z.coerce.number().min(0, "Pay must be 0 or more"),
  gstRegistered: z.boolean().default(false),
  tdsRatePct: num(0),
  nextReviewDate: optDate,
});

/**
 * Add or update a person. Everyone with "people.edit" can change the profile; pay only with "cost.edit".
 * A new person gets GCE-0001 (employee) or GCT-0001 (contractor); the ID doesn't change if the type changes.
 */
export async function savePerson(id: string | null, input: Record<string, unknown>): Promise<Result & { id?: string }> {
  try {
    const user = await assertPermission("people.edit", "cost.edit");
    const profile = Profile.parse(input);
    const pay = can(user.role, "cost.edit") ? Pay.parse(input) : null;
    const payData = pay
      ? { payModel: pay.payModel, costBasis: costBasisOf(pay.payModel), costInr: pay.costInr, gstRegistered: pay.gstRegistered, tdsRatePct: pay.tdsRatePct ?? null, nextReviewDate: pay.nextReviewDate }
      : {};
    if (id) {
      const prev = await prisma.person.findUniqueOrThrow({ where: { id } });
      const active = input.active === undefined ? prev.active : !!input.active;
      await prisma.person.update({ where: { id }, data: { ...profile, ...payData, active } });
      const payChange = pay && (prev.costInr !== pay.costInr || prev.payModel !== pay.payModel) ? ` (pay ${prev.payModel} ₹${prev.costInr} → ${pay.payModel} ₹${pay.costInr})` : "";
      await audit(user, "UPDATE", "Person", id, `Updated ${profile.name}${payChange}`);
      touch(id);
      return { ok: true, message: "Saved.", id };
    }
    const code = await ids.nextPersonCode(prisma, profile.type);
    const person = await prisma.person.create({ data: { ...profile, ...payData, code, active: true } });
    await audit(user, "CREATE", "Person", person.id, `Added ${code} ${profile.name} (${profile.type})`);
    touch(person.id);
    return { ok: true, message: `${code} added.`, id: person.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePerson(id: string) {
  const user = await assertPermission("cost.edit");
  const p = await prisma.person.findUniqueOrThrow({ where: { id }, include: { _count: { select: { timeEntries: true, expenses: true, payLines: true } } } });
  if (p._count.timeEntries || p._count.expenses || p._count.payLines) throw new Error("This person has timesheets or pay records — mark them inactive instead");
  await prisma.person.delete({ where: { id } });
  await audit(user, "DELETE", "Person", id, `Deleted ${p.code ?? ""} ${p.name}`);
  touch();
  redirect("/people");
}

export async function toggleChecklist(id: string, list: "onboarding" | "offboarding", key: string, done: boolean): Promise<Result> {
  try {
    await assertPermission("people.edit");
    const p = await prisma.person.findUniqueOrThrow({ where: { id }, select: { onboarding: true, offboarding: true } });
    const next = { ...parseList(p[list]), [key]: done };
    await prisma.person.update({ where: { id }, data: { [list]: JSON.stringify(next) } });
    touch(id);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Documents ----------

const DocSchema = z.object({
  type: z.enum(Object.keys(DOC_TYPES) as [string, ...string[]]),
  title: z.string().trim().min(1, "Give it a title"),
  status: z.enum(DOC_STATUSES),
  documentUrl: url,
  signedAt: optDate,
  expiresAt: optDate,
  notes: optStr,
});

export async function saveDocument(personId: string, docId: string | null, input: Record<string, string>): Promise<Result> {
  try {
    const user = await assertPermission("people.edit");
    const d = DocSchema.parse(input);
    const data = { ...d, signedAt: d.status === "SIGNED" && !d.signedAt ? new Date() : d.signedAt };
    if (docId) await prisma.personDocument.update({ where: { id: docId }, data });
    else await prisma.personDocument.create({ data: { ...data, personId, createdBy: user.name } });
    await audit(user, docId ? "UPDATE" : "CREATE", "PersonDocument", personId, `${DOC_TYPES[d.type].label}: ${d.title} (${d.status})`);
    touch(personId);
    return { ok: true, message: "Document saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDocument(docId: string): Promise<Result> {
  try {
    const user = await assertPermission("people.edit");
    const d = await prisma.personDocument.delete({ where: { id: docId } });
    await audit(user, "DELETE", "PersonDocument", d.personId, `Removed ${d.title}`);
    touch(d.personId);
    return { ok: true, message: "Removed." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Work orders ----------

const WorkOrderSchema = z.object({
  projectId: z.string().min(1, "Pick the project"),
  role: optStr,
  expectedHoursPerMonth: z.coerce.number().min(0).max(400),
  startDate: optDate,
  endDate: optDate,
  payTreatment: z.enum(Object.keys(WORK_ORDER_PAY) as [string, ...string[]]),
  fixedFeeInr: num(0),
  status: z.enum(["DRAFT", "ISSUED", "ACTIVE", "CLOSED"]),
  documentUrl: url,
  reportingTo: optStr,
  notes: optStr,
});

/**
 * A work order puts a contractor on a project under their master agreement: GCT-0001-W01. Issuing it (or making
 * it active) also assigns them to the project team, so they can log time there. The fee is cost data.
 */
export async function saveWorkOrder(personId: string, woId: string | null, input: Record<string, string>): Promise<Result> {
  try {
    const user = await assertPermission("people.edit");
    const d = WorkOrderSchema.parse(input);
    const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
    if (!person.code) throw new Error("This person has no ID yet; run the ID backfill (npm run db:push)");
    const fee = can(user.role, "cost.edit") ? { fixedFeeInr: d.payTreatment === "FIXED_FEE" ? (d.fixedFeeInr ?? null) : null } : {};
    if (d.payTreatment === "FIXED_FEE" && can(user.role, "cost.edit") && !d.fixedFeeInr) throw new Error("A fixed-fee work order needs its fee");
    const data = { ...d, fixedFeeInr: undefined, ...fee };
    const wo = woId
      ? await prisma.workOrder.update({ where: { id: woId }, data })
      : await prisma.workOrder.create({ data: { ...data, code: await ids.nextWorkOrderCode(prisma, { id: person.id, code: person.code }), personId, createdBy: user.name } });
    if (["ISSUED", "ACTIVE"].includes(d.status)) {
      await prisma.assignment.upsert({
        where: { projectId_personId: { projectId: d.projectId, personId } },
        update: { hoursPerMonth: d.expectedHoursPerMonth, startDate: d.startDate, endDate: d.endDate },
        create: { projectId: d.projectId, personId, hoursPerMonth: d.expectedHoursPerMonth, startDate: d.startDate, endDate: d.endDate },
      });
    }
    await audit(user, woId ? "UPDATE" : "CREATE", "WorkOrder", wo.id, `${wo.code}: ${WORK_ORDER_PAY[d.payTreatment]} (${d.status})`);
    touch(personId);
    revalidatePath(`/projects/${d.projectId}`);
    revalidatePath("/people/work-orders");
    return { ok: true, message: `${wo.code} saved.` };
  } catch (e) {
    return fail(e);
  }
}
