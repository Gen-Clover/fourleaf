"use server";

// Compliance calendar, issues and escalations, decision register.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertPermission, can } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { type Result, fail, optDate, optStr } from "@genclover/ui/result";
import { COMPLIANCE_CATEGORIES, DECISION_TYPES, FREQUENCIES, ISSUE_CATEGORIES, ISSUE_STATUSES, nextDue, PRIORITIES } from "../lib/governance";

const url = optStr.refine((v) => !v || /^https?:\/\/\S+$/.test(v), "Links must start with https://");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").transform((s) => new Date(`${s}T00:00:00.000Z`));

// ---------- Compliance ----------

const ItemSchema = z.object({
  name: z.string().trim().min(1, "What is it?"),
  category: z.enum(Object.keys(COMPLIANCE_CATEGORIES) as [string, ...string[]]),
  authority: optStr,
  frequency: z.enum(Object.keys(FREQUENCIES) as [string, ...string[]]),
  dueDate: day,
  ownerId: optStr,
  professional: optStr,
  remindDays: z.coerce.number().int().min(0).max(90),
  notes: optStr,
});

const touchCompliance = () => {
  revalidatePath("/compliance");
  revalidatePath("/governance");
};

export async function saveComplianceItem(id: string | null, input: Record<string, string>): Promise<Result> {
  try {
    const user = await assertPermission("compliance.edit");
    const d = ItemSchema.parse(input);
    const owner = d.ownerId ? await prisma.user.findUnique({ where: { id: d.ownerId }, select: { id: true, name: true } }) : null;
    const data = { ...d, ownerId: owner?.id ?? null, ownerName: owner?.name ?? null };
    if (id) await prisma.complianceItem.update({ where: { id }, data: { ...data, remindedAt: null } });
    else await prisma.complianceItem.create({ data });
    await audit(user, id ? "UPDATE" : "CREATE", "Compliance", id, `${d.name} due ${d.dueDate.toISOString().slice(0, 10)}`);
    touchCompliance();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

const FilingSchema = z.object({ period: z.string().trim().min(1, "Which period?"), filedAt: day, reference: optStr, evidenceUrl: url, notes: optStr });

/** Record that it's done (with the acknowledgement / challan and evidence); the next due date rolls forward. */
export async function markFiled(itemId: string, input: Record<string, string>): Promise<Result> {
  try {
    const user = await assertPermission("compliance.edit");
    const d = FilingSchema.parse(input);
    const item = await prisma.complianceItem.findUniqueOrThrow({ where: { id: itemId } });
    await prisma.complianceFiling.create({ data: { ...d, itemId, dueDate: item.dueDate, filedBy: user.name } });
    const next = nextDue(item.dueDate, item.frequency);
    await prisma.complianceItem.update({ where: { id: itemId }, data: next ? { dueDate: next, remindedAt: null } : { active: false } });
    await audit(user, "UPDATE", "Compliance", itemId, `${item.name} ${d.period}: filed ${d.filedAt.toISOString().slice(0, 10)}${d.reference ? ` (${d.reference})` : ""}`);
    touchCompliance();
    return { ok: true, message: next ? `Filed. Next due ${next.toISOString().slice(0, 10)}.` : "Filed. One-off item closed." };
  } catch (e) {
    return fail(e);
  }
}

export async function setComplianceActive(id: string, active: boolean): Promise<Result> {
  try {
    const user = await assertPermission("compliance.edit");
    const item = await prisma.complianceItem.update({ where: { id }, data: { active } });
    await audit(user, "UPDATE", "Compliance", id, `${item.name}: ${active ? "reactivated" : "stopped"}`);
    touchCompliance();
    return { ok: true, message: active ? "Reactivated." : "Stopped (no longer applies)." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Issues ----------

const IssueSchema = z.object({
  title: z.string().trim().min(1, "Describe the issue in a line"),
  category: z.enum(Object.keys(ISSUE_CATEGORIES) as [string, ...string[]]),
  priority: z.enum(PRIORITIES),
  projectId: optStr,
  clientId: optStr,
  description: optStr,
  impact: optStr,
  options: optStr,
  ownerId: optStr,
  dueDate: optDate,
});

const touchIssue = (id?: string, projectId?: string | null) => {
  revalidatePath("/issues");
  revalidatePath("/governance");
  revalidatePath("/delivery");
  if (id) revalidatePath(`/issues/${id}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
};

/** Raise (or update) an issue: owner, impact and deadline, logged with an ID so it can't get lost in chat. */
export async function saveIssue(id: string | null, input: Record<string, string>): Promise<Result & { id?: string }> {
  try {
    const user = await assertPermission("issues.edit");
    const d = IssueSchema.parse(input);
    const owner = d.ownerId ? await prisma.user.findUnique({ where: { id: d.ownerId }, select: { id: true, name: true } }) : null;
    const project = d.projectId ? await prisma.project.findUnique({ where: { id: d.projectId }, select: { clientId: true } }) : null;
    const data = { ...d, clientId: d.clientId ?? project?.clientId ?? null, ownerId: owner?.id ?? null, ownerName: owner?.name ?? null };
    let saved;
    if (id) {
      saved = await prisma.issue.update({ where: { id }, data });
      await audit(user, "UPDATE", "Issue", id, `${saved.code} updated`);
    } else {
      saved = await prisma.issue.create({ data: { ...data, code: await ids.nextIssueCode(prisma), raisedBy: user.name, level: 1, status: "OPEN" } });
      await audit(user, "CREATE", "Issue", saved.id, `${saved.code} raised: ${d.title}`);
    }
    touchIssue(saved.id, saved.projectId);
    return { ok: true, message: `${saved.code} saved.`, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addIssueNote(issueId: string, text: string): Promise<Result> {
  try {
    const user = await assertPermission("issues.edit");
    const t = z.string().trim().min(1, "Write something").max(4000).parse(text);
    await prisma.issueNote.create({ data: { issueId, text: t, byName: user.name } });
    touchIssue(issueId);
    return { ok: true, message: "Added." };
  } catch (e) {
    return fail(e);
  }
}

/** Move it up a level (1 → 4): the next level's owners decide. */
export async function escalateIssue(issueId: string, reason: string): Promise<Result> {
  try {
    const user = await assertPermission("issues.edit");
    const i = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
    if (i.level >= 4) throw new Error("Already at the highest level (board / adviser)");
    const r = z.string().trim().min(1, "Why does it need a higher level?").parse(reason);
    await prisma.issue.update({ where: { id: issueId }, data: { level: i.level + 1, status: "ESCALATED" } });
    await prisma.issueNote.create({ data: { issueId, text: `Escalated to level ${i.level + 1}: ${r}`, byName: user.name } });
    await audit(user, "UPDATE", "Issue", issueId, `${i.code}: escalated to level ${i.level + 1}`);
    touchIssue(issueId, i.projectId);
    return { ok: true, message: `Escalated to level ${i.level + 1}.` };
  } catch (e) {
    return fail(e);
  }
}

/** Record the decision (who decided, what, when). Level 3+ needs an owner; level 4 is recorded as a board matter. */
export async function decideIssue(issueId: string, decision: string): Promise<Result> {
  try {
    const user = await assertPermission("issues.edit");
    const i = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
    if (i.level >= 3 && !can(user.role, "admin")) throw new Error(`Level ${i.level} issues are decided by an owner`);
    const d = z.string().trim().min(1, "What was decided?").parse(decision);
    await prisma.issue.update({ where: { id: issueId }, data: { decision: d, decidedBy: user.name, decidedAt: new Date(), status: "DECIDED" } });
    await audit(user, "UPDATE", "Issue", issueId, `${i.code}: decided — ${d}`);
    touchIssue(issueId, i.projectId);
    return { ok: true, message: "Decision recorded. Close it once it's done." };
  } catch (e) {
    return fail(e);
  }
}

export async function setIssueStatus(issueId: string, status: (typeof ISSUE_STATUSES)[number], lessons?: string): Promise<Result> {
  try {
    const user = await assertPermission("issues.edit");
    const i = await prisma.issue.update({
      where: { id: issueId },
      data: { status, ...(status === "CLOSED" ? { closedAt: new Date(), lessons: lessons?.trim() || undefined } : { closedAt: null }) },
    });
    await audit(user, "UPDATE", "Issue", issueId, `${i.code}: ${status.toLowerCase()}`);
    touchIssue(issueId, i.projectId);
    return { ok: true, message: status === "CLOSED" ? "Closed." : "Updated." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Decisions ----------

const DecisionSchema = z.object({
  title: z.string().trim().min(1, "Title"),
  type: z.enum(Object.keys(DECISION_TYPES) as [string, ...string[]]),
  date: day,
  decision: z.string().trim().min(1, "What was decided?"),
  decidedBy: z.string().trim().min(1, "Who decided?"),
  reference: optStr,
  issueId: optStr,
});

/** The decision register: board resolutions and major decisions, with a reference to the minutes. */
export async function saveDecision(input: Record<string, string>): Promise<Result> {
  try {
    const user = await assertPermission("admin");
    const d = DecisionSchema.parse(input);
    const saved = await prisma.decision.create({ data: { ...d, code: await ids.nextDecisionCode(prisma, d.date), createdBy: user.name } });
    await audit(user, "CREATE", "Decision", saved.id, `${saved.code}: ${d.title}`);
    revalidatePath("/decisions");
    revalidatePath("/governance");
    return { ok: true, message: `${saved.code} recorded.` };
  } catch (e) {
    return fail(e);
  }
}
