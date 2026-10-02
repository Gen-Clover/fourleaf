// Every stage change goes through here, whether a person or an automatic rule makes it, so each one is
// recorded the same way: the stage, when it changed (stage age, "stuck" alerts), a history row (reports:
// days from first message to won) and a line on the lead's timeline.
import { type Prisma, prisma } from "@genclover/db";
import { STAGE_LABEL } from "./services";

export type By = { id: string | null; name: string };

export async function changeStage(leadId: string, to: string, o: { by: By; reason?: string | null; data?: Prisma.LeadUncheckedUpdateInput }) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } });
  const from = lead.stage;
  const changed = from !== to;
  await prisma.lead.update({ where: { id: leadId }, data: { ...o.data, stage: to, ...(changed ? { stageChangedAt: new Date() } : {}) } });
  if (!changed) return false;
  await prisma.leadStageChange.create({ data: { leadId, from, to, reason: o.reason ?? null, byName: o.by.name } });
  await prisma.leadActivity.create({
    data: { leadId, type: "STAGE", text: `${STAGE_LABEL[from] ?? from} → ${STAGE_LABEL[to] ?? to}${o.reason ? ` (${o.reason})` : ""}`, byId: o.by.id, byName: o.by.name },
  });
  return true;
}

const SYSTEM: By = { id: null, name: "Lead Finder" };

/**
 * Snoozed leads whose date has come go back to work: leads that had replied return as Replied (to check in);
 * the others return as Qualified. Either way they show in Today.
 */
export async function wakeSnoozed(now = new Date()) {
  const due = await prisma.lead.findMany({ where: { stage: "SNOOZED", snoozeUntil: { not: null, lte: now } }, select: { id: true, snoozedFromStage: true, repliedAt: true } });
  for (const l of due) await wake(l, SYSTEM, "back from snooze", now);
  return due.length;
}

/** Bring one snoozed lead back now (the Snoozed list's "Wake now"). */
export async function wakeLead(leadId: string, by: By) {
  const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { id: true, stage: true, snoozedFromStage: true, repliedAt: true } });
  if (l.stage !== "SNOOZED") throw new Error("This lead isn't snoozed");
  await wake(l, by, "woken early", new Date());
}

async function wake(l: { id: string; snoozedFromStage: string | null; repliedAt: Date | null }, by: By, reason: string, now: Date) {
  const to = l.repliedAt || ["REPLIED", "MEETING", "PROPOSAL"].includes(l.snoozedFromStage ?? "") ? "REPLIED" : "QUALIFIED";
  await changeStage(l.id, to, { by, reason, data: { snoozeUntil: null, nextFollowUpAt: now } });
}

/** Lost leads with a "try again" date come back as Qualified, ready for a fresh first message. */
export async function retryLost(now = new Date()) {
  const due = await prisma.lead.findMany({ where: { stage: "LOST", retryAt: { not: null, lte: now }, doNotContact: false }, select: { id: true } });
  for (const l of due) {
    await changeStage(l.id, "QUALIFIED", {
      by: SYSTEM,
      reason: "try again date reached",
      data: { retryAt: null, lostReason: null, contactCount: 0, firstContactAt: null, lastContactAt: null, nextFollowUpAt: null, replyCategory: null },
    });
  }
  return due.length;
}
