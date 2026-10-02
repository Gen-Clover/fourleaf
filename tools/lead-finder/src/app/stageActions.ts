"use server";

// Moving a lead through the pipeline: sorting replies, snoozing, lost, not a fit, won, proposals, calls and
// meetings, deal value (owners only) and lead owners. Every stage change goes through lib/stages.ts.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { audit } from "@genclover/db/audit";
import { assertPermission } from "@genclover/auth";
import { errMsg, type Result } from "@genclover/ui/result";
import {
  ADD_ONS,
  CARE_PLANS,
  CLOSED_STAGES,
  ENGAGED_STAGES,
  LOST_REASONS,
  MEETING_OUTCOMES,
  NOT_FIT_REASONS,
  PACKAGES,
  REPLY_CATEGORIES,
  TASK_TYPES,
  WIN_REASONS,
} from "../lib/services";
import { canSeeDeal } from "../lib/dealAccess";
import * as ids from "@genclover/ids";
import { OPEN_OPP_STAGES } from "../lib/b2b";
import { changeStage, wakeLead } from "../lib/stages";
import { notifyAssigned } from "../lib/tasks";
import { moveLeads } from "../lib/distribution";
import { assertLeadAccess } from "../lib/scope";
import { recordAtWon } from "@genclover/incentives";
import type { ServiceLine } from "@genclover/incentives/rules";

const day = 86_400_000;
const date = z.string({ error: "Pick a date" }).trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
/** A date picked in the form, as 10:00 IST that day. */
const istMorning = (d: string) => new Date(`${d}T10:00:00+05:30`);

/** Someone working leads; with a lead id, only one they may see (lib/scope.ts). */
async function editor(leadId?: string) {
  const user = await assertPermission("leads.edit");
  if (leadId) await assertLeadAccess(user, leadId);
  return { user, by: { id: user.id, name: user.name } };
}
function done(id: string, message: string): Result {
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads/today");
  return { ok: true, message };
}

/** A call or meeting: whoever it's assigned to, or someone who may see the lead. */
async function taskEditor(taskId: string) {
  const e = await editor();
  const task = await prisma.leadTask.findUniqueOrThrow({ where: { id: taskId }, select: { leadId: true, assigneeId: true } });
  if (task.assigneeId !== e.user.id) await assertLeadAccess(e.user, task.leadId);
  return e;
}

/** Snooze until a date: out of every queue, back in Today on that date (lib/stages.ts wakeSnoozed). */
async function snooze(id: string, until: Date, by: { id: string; name: string }, reason: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, select: { stage: true } });
  if (until.getTime() < Date.now()) throw new Error("Pick a date in the future");
  await changeStage(id, "SNOOZED", {
    by,
    reason: `${reason} until ${until.toISOString().slice(0, 10)}`,
    data: { snoozeUntil: until, snoozedFromStage: lead.stage === "SNOOZED" ? undefined : lead.stage, nextFollowUpAt: null },
  });
}

/** Sort what they replied. Some answers move the lead on straight away. */
export async function sortReply(id: string, input: { category: string; snoozeUntil?: string }): Promise<Result> {
  try {
    const { by } = await editor(id);
    const category = z.enum(Object.keys(REPLY_CATEGORIES) as [string, ...string[]]).parse(input.category);
    await prisma.lead.update({ where: { id }, data: { replyCategory: category } });
    if (category === "NOT_NOW") await snooze(id, istMorning(date.parse(input.snoozeUntil)), by, "they said not now");
    else if (category === "NOT_INTERESTED") await changeStage(id, "LOST", { by, reason: "Not interested", data: { lostReason: "Not interested", nextFollowUpAt: null } });
    else await prisma.leadActivity.create({ data: { leadId: id, type: "NOTE", text: `Reply sorted: ${REPLY_CATEGORIES[category].label}`, byId: by.id, byName: by.name } });
    return done(id, category === "NOT_NOW" ? "Snoozed." : category === "NOT_INTERESTED" ? "Closed as Lost." : "Saved. Pick a suggested answer below.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Bring a snoozed lead back today, before its date. */
export async function wakeNow(id: string): Promise<Result> {
  try {
    const { by } = await editor(id);
    await wakeLead(id, by);
    revalidatePath("/leads/snoozed");
    return done(id, "Back in Today.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function snoozeLead(id: string, until: string, note?: string): Promise<Result> {
  try {
    const { by } = await editor(id);
    await snooze(id, istMorning(date.parse(until)), by, note?.trim() || "not now");
    return done(id, "Snoozed.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Lost: why (required), who got the work (only if known) and, optionally, when to try again. */
export async function markLost(id: string, input: { reason: string; competitor?: string; retryAt?: string }): Promise<Result> {
  try {
    const { by } = await editor(id);
    const reason = z.enum(LOST_REASONS as [string, ...string[]]).parse(input.reason);
    const competitor = input.competitor?.trim().slice(0, 120) || null;
    const retryAt = input.retryAt ? istMorning(date.parse(input.retryAt)) : null;
    if (retryAt && retryAt.getTime() < Date.now()) throw new Error("The try-again date must be in the future");
    await changeStage(id, "LOST", {
      by,
      reason: [reason, competitor && `went with ${competitor}`, retryAt && `try again ${input.retryAt}`].filter(Boolean).join("; "),
      data: { lostReason: reason, lostCompetitor: competitor, retryAt, nextFollowUpAt: null },
    });
    return done(id, "Marked lost.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Not a fit: never a prospect. Searches keep the lead (same place ID), so it's never added again. */
export async function markNotFit(id: string, input: { reason: string }): Promise<Result> {
  try {
    const { by } = await editor(id);
    const reason = z.enum(NOT_FIT_REASONS as [string, ...string[]]).parse(input.reason);
    await changeStage(id, "NOT_A_FIT", { by, reason, data: { notFitReason: reason, nextFollowUpAt: null } });
    return done(id, "Marked not a fit.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function markProposalSent(id: string, note?: string): Promise<Result> {
  try {
    const { by } = await editor(id);
    // Follow up on day 2 and day 5 after the proposal (set by hand after the first).
    await changeStage(id, "PROPOSAL", { by, reason: note?.trim() || null, data: { nextFollowUpAt: new Date(Date.now() + 2 * day) } });
    return done(id, "Proposal sent. Follow-up set for 2 days from now.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/**
 * Won: what they bought and why. No client is created here: won leads wait for Client Onboarding, which
 * creates the client (Client ID) and links this lead. Deal value is for owners only.
 */
export async function markWon(id: string, input: { pkg: string; carePlan: string; addOns: string[]; reason: string; note?: string; value?: string; currency?: string }): Promise<Result> {
  try {
    const { user, by } = await editor(id);
    const d = z
      .object({
        pkg: z.enum(PACKAGES as [string, ...string[]]),
        carePlan: z.enum(CARE_PLANS as [string, ...string[]]),
        addOns: z.array(z.enum(ADD_ONS as [string, ...string[]])).max(ADD_ONS.length),
        reason: z.enum(WIN_REASONS as [string, ...string[]]),
        note: z.string().trim().max(500).optional(),
        value: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).optional()),
        currency: z.enum(["INR", "USD"]).optional(),
      })
      .parse(input);
    await changeStage(id, "WON", {
      by,
      reason: `${d.pkg}${d.carePlan !== "None" ? ` + ${d.carePlan}` : ""}${d.addOns.length ? ` + ${d.addOns.join(", ")}` : ""} · ${d.reason}`,
      data: { wonAt: new Date(), wonPackage: d.pkg, wonCarePlan: d.carePlan, wonAddOns: d.addOns, wonReason: d.reason, nextFollowUpAt: null, snoozeUntil: null },
    });
    if (d.note) await prisma.leadActivity.create({ data: { leadId: id, type: "NOTE", text: d.note, byId: by.id, byName: by.name } });
    // Every win is an opportunity too: the open one is marked won, or one is recorded. Onboarding works from these.
    const title = `${d.pkg}${d.carePlan !== "None" ? ` + ${d.carePlan}` : ""}`;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, select: { dealValue: true, dealCurrency: true, market: true, ownerId: true, ownerName: true, bestService: true } });
    const open = await prisma.opportunity.findFirst({ where: { leadId: id, stage: { in: OPEN_OPP_STAGES } }, orderBy: { updatedAt: "desc" } });
    const opp = open
      ? await prisma.opportunity.update({ where: { id: open.id }, data: { stage: "WON", probability: 100, wonAt: new Date() } })
      : await prisma.opportunity.create({
          data: {
            code: await ids.nextOpportunityCode(prisma),
            leadId: id,
            title,
            model: d.carePlan !== "None" ? "MAINTENANCE" : "FIXED_SCOPE",
            services: lead.bestService ? [lead.bestService] : [],
            stage: "WON",
            probability: 100,
            wonAt: new Date(),
            // The value given on the Won form (only by someone who may see it), else one saved on the lead before deals existed.
            value: d.value != null && canSeeDeal(user, lead) ? d.value : lead.dealValue,
            currency: (d.value != null ? d.currency : lead.dealCurrency) ?? (lead.market === "US" ? "USD" : "INR"),
            ownerId: lead.ownerId ?? user.id,
            ownerName: lead.ownerName ?? user.name,
            notes: [d.addOns.length ? `Add-ons: ${d.addOns.join(", ")}` : null, `Why we won: ${d.reason}`].filter(Boolean).join("\n"),
            createdBy: user.name,
          },
        });
    // The sales incentive is recorded now (who owned the lead, what was sold); onboarding decides it.
    const market = lead.market === "US" ? "US" : "IN";
    const inc = await recordAtWon({ opportunityId: opp.id, by, services: wonServices(d, opp.value, market), summary: `${title}${d.addOns.length ? ` + ${d.addOns.join(", ")}` : ""}` });
    await audit(user, "UPDATE", "Lead", id, `Won: ${d.pkg} (deal ${opp.code}, incentive ${inc.code})`);
    revalidatePath("/leads/won");
    revalidatePath("/leads/incentives");
    revalidatePath("/clients/onboarding");
    return done(id, `Won! Deal ${opp.code} is waiting for onboarding.`);
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/**
 * What was sold, as incentive service lines: the package (at the deal value given, else its list price), the care
 * plan (monthly, first month counts) and add-ons (priced at onboarding). India list prices are the strategy doc's;
 * US deals are priced at onboarding.
 */
const LIST_PRICE_INR: Record<string, number> = { Starter: 30000, Growth: 40000, Premium: 50000 };
const CARE_PRICE_INR: Record<string, number> = { "Care Basic": 2500, "Care Plus": 3500, "Care Pro": 5000 };
function wonServices(d: { pkg: string; carePlan: string; addOns: string[] }, value: number | null, market: "IN" | "US"): ServiceLine[] {
  const india = market === "IN";
  const lines: ServiceLine[] = [{ key: "PACKAGE", label: `Website: ${d.pkg}`, kind: "ONE_TIME", value: value ?? (india ? (LIST_PRICE_INR[d.pkg] ?? null) : null) }];
  if (d.carePlan !== "None") lines.push({ key: "CARE", label: d.carePlan, kind: "MONTHLY", value: india ? (CARE_PRICE_INR[d.carePlan] ?? null) : null });
  for (const a of d.addOns) lines.push({ key: `ADDON:${a}`, label: a, kind: "ONE_TIME", value: null });
  return lines;
}

/** Correct the stage by hand (moves that need details have their own forms). */
export async function setStage(id: string, stage: string): Promise<Result> {
  try {
    const { by } = await editor(id);
    if (["WON", "LOST", "NOT_A_FIT", "SNOOZED"].includes(stage)) throw new Error("Use the Won, Lost, Not a fit or Snooze buttons: they ask for the details");
    if (!["NEW", "QUALIFIED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL"].includes(stage)) throw new Error("Unknown stage");
    await changeStage(id, stage, { by, reason: "set by hand", data: { snoozeUntil: null, retryAt: null } });
    return done(id, "Stage saved.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function setFollowUp(id: string, on: string | null): Promise<Result> {
  try {
    await editor(id);
    await prisma.lead.update({ where: { id }, data: { nextFollowUpAt: on ? istMorning(date.parse(on)) : null } });
    return done(id, "Follow-up saved.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/**
 * Move leads to a person (null = back to the pool). Owners: anyone's leads, won ones too. A manager the owner allows:
 * their team's leads (not won) within their team. Nobody else (lib/distribution.ts checkMove).
 */
export async function assignOwner(ids: string[], userId: string | null, note?: string): Promise<Result> {
  try {
    const { user } = await editor();
    const leadIds = z.array(z.string()).min(1, "Select some leads").max(500).parse(ids);
    const n = await moveLeads(user, leadIds, userId, note?.trim() || undefined);
    revalidatePath("/leads/list");
    revalidatePath("/leads/distribute");
    for (const id of leadIds.slice(0, 1)) revalidatePath(`/leads/${id}`);
    return { ok: true, message: `${n} lead(s) ${userId ? "moved" : "back in the pool"}.` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

// ---------- Calls, meetings and visits ----------

const TaskInput = z.object({
  type: z.enum(Object.keys(TASK_TYPES) as [string, ...string[]]),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time"),
  durationMin: z.coerce.number().int().min(5).max(480),
  link: z.string().trim().max(500).optional(),
  agenda: z.string().trim().max(1000).optional(),
  assigneeId: z.string().optional(),
});

/** Schedule a call-back, meeting or visit. A meeting or visit moves the lead to "Call / meeting". */
export async function scheduleTask(id: string, input: z.input<typeof TaskInput>): Promise<Result> {
  try {
    const { user, by } = await editor(id);
    const d = TaskInput.parse(input);
    const dueAt = new Date(`${d.dueAt}:00+05:30`); // entered in IST
    if (dueAt.getTime() < Date.now() - 60_000) throw new Error("Pick a time in the future");
    if (d.link && !/^https?:\/\/\S+$/.test(d.link)) throw new Error("The link must start with https://");
    const assignee = d.assigneeId ? await prisma.user.findUniqueOrThrow({ where: { id: d.assigneeId }, select: { id: true, name: true } }) : { id: user.id, name: user.name };
    const task = await prisma.leadTask.create({
      data: { leadId: id, type: d.type, dueAt, durationMin: d.durationMin, link: d.link || null, agenda: d.agenda || null, assigneeId: assignee.id, assigneeName: assignee.name, createdBy: user.name },
    });
    const text = `${TASK_TYPES[d.type]} scheduled for ${dueAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST with ${assignee.name}`;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, select: { stage: true } });
    const moveToMeeting = d.type !== "CALL" && ["NEW", "QUALIFIED", "CONTACTED", "REPLIED"].includes(lead.stage);
    if (moveToMeeting) await changeStage(id, "MEETING", { by, reason: text, data: { nextFollowUpAt: dueAt } });
    else {
      await prisma.lead.update({ where: { id }, data: { nextFollowUpAt: dueAt } });
      await prisma.leadActivity.create({ data: { leadId: id, type: "SYSTEM", text, byId: by.id, byName: by.name } });
    }
    const emailed = assignee.id !== user.id ? await notifyAssigned(task.id) : false;
    revalidatePath("/leads/tasks");
    return done(id, `Scheduled${emailed ? `; ${assignee.name} was emailed` : ""}.`);
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

const Notes = z.object({ needs: z.string().max(1000), budget: z.string().max(300), decider: z.string().max(300), timeline: z.string().max(300), other: z.string().max(2000) }).partial();

/** Record how the call or meeting went (notes template), then move the lead on accordingly. */
export async function completeTask(taskId: string, input: { outcome: string; notes: z.input<typeof Notes>; snoozeUntil?: string }): Promise<Result> {
  try {
    const { by } = await taskEditor(taskId);
    const outcome = z.enum(Object.keys(MEETING_OUTCOMES) as [string, ...string[]]).parse(input.outcome);
    const notes = Notes.parse(input.notes);
    const task = await prisma.leadTask.update({ where: { id: taskId }, data: { status: "DONE", outcome, notes: JSON.stringify(notes), doneAt: new Date() } });
    const lines = [
      notes.needs && `Needs: ${notes.needs}`,
      notes.budget && `Budget: ${notes.budget}`,
      notes.decider && `Decides: ${notes.decider}`,
      notes.timeline && `When: ${notes.timeline}`,
      notes.other,
    ].filter(Boolean);
    await prisma.leadActivity.create({
      data: { leadId: task.leadId, type: "NOTE", text: `${TASK_TYPES[task.type]} done: ${MEETING_OUTCOMES[outcome]}${lines.length ? `\n${lines.join("\n")}` : ""}`, byId: by.id, byName: by.name },
    });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: task.leadId }, select: { stage: true } });
    if (outcome === "NOT_INTERESTED") await changeStage(task.leadId, "LOST", { by, reason: "Not interested (after the call)", data: { lostReason: "Not interested", nextFollowUpAt: null } });
    else if (outcome === "NOT_NOW") await snooze(task.leadId, istMorning(date.parse(input.snoozeUntil)), by, "not now (after the call)");
    else {
      // Next step: send the proposal today, check back in 3 days, or rebook.
      const next = outcome === "THINKING" ? new Date(Date.now() + 3 * day) : new Date();
      if (ENGAGED_STAGES.includes(lead.stage) || lead.stage === "CONTACTED") await changeStage(task.leadId, lead.stage === "CONTACTED" ? "REPLIED" : lead.stage, { by, data: { nextFollowUpAt: next } });
      else if (!CLOSED_STAGES.includes(lead.stage)) await prisma.lead.update({ where: { id: task.leadId }, data: { nextFollowUpAt: next } });
    }
    revalidatePath("/leads/tasks");
    return done(task.leadId, "Saved.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function cancelTask(taskId: string): Promise<Result> {
  try {
    const { by } = await taskEditor(taskId);
    const task = await prisma.leadTask.update({ where: { id: taskId }, data: { status: "CANCELLED", doneAt: new Date() } });
    await prisma.leadActivity.create({ data: { leadId: task.leadId, type: "SYSTEM", text: `${TASK_TYPES[task.type]} cancelled`, byId: by.id, byName: by.name } });
    revalidatePath("/leads/tasks");
    return done(task.leadId, "Cancelled.");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}
