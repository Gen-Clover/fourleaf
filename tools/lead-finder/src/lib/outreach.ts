// Recording outreach and replies. Used by the pages (a person sends) and the worker (automatic email
// follow-ups, replies found in the inbox), so the lead's stage and follow-up date move the same way.
import { prisma } from "@genclover/db";
import { ENGAGED_STAGES, SEQUENCE_DAYS } from "./services";

export const OUTREACH_TYPES = ["WHATSAPP", "EMAIL", "CALL", "VISIT"];
type By = { id: string | null; name: string };

/** The next message in the sequence for this lead: 0 = first, 1–3 = follow-ups, null = sequence done. */
export const nextStep = (lead: { contactCount: number }) => (lead.contactCount < SEQUENCE_DAYS.length ? lead.contactCount : null);

/**
 * A message went out (WhatsApp, email, call or visit). Moves New/Qualified to Contacted and sets the next
 * follow-up: day 1, 3 and 7 after the first message; after the last one, no more follow-ups.
 */
export async function recordOutreach(leadId: string, o: { channel: string; text: string; service?: string | null; by: By }) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.doNotContact) throw new Error("This business is on the do-not-contact list");
  const now = new Date();
  const first = lead.firstContactAt ?? now;
  const count = lead.contactCount + 1;
  const engaged = ENGAGED_STAGES.includes(lead.stage);
  const nextDay = SEQUENCE_DAYS[count];
  await prisma.leadActivity.create({ data: { leadId, type: o.channel, text: o.text, service: o.service ?? null, step: lead.contactCount, byId: o.by.id, byName: o.by.name } });
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      contactCount: count,
      lastContactAt: now,
      firstContactAt: first,
      firstService: lead.firstService ?? o.service ?? null,
      lastChannel: o.channel,
      stage: ["NEW", "QUALIFIED"].includes(lead.stage) ? "CONTACTED" : lead.stage,
      // Once they've replied, follow-ups are set by hand on the lead page.
      nextFollowUpAt: engaged ? lead.nextFollowUpAt : nextDay != null ? new Date(first.getTime() + nextDay * 86_400_000) : null,
    },
  });
}

/**
 * Take back a message or reply that was logged by mistake, then recompute the lead's outreach state
 * (message count, first/last contact, next follow-up, stage) from what's left on the timeline.
 * Emails sent through the portal can't be undone: they really went out.
 */
export async function undoActivity(activityId: string, by: By) {
  const act = await prisma.leadActivity.findUniqueOrThrow({ where: { id: activityId } });
  if (![...OUTREACH_TYPES, "REPLY"].includes(act.type)) throw new Error("Only messages, calls, visits and replies can be undone");
  if (act.type === "EMAIL") {
    const sent = await prisma.emailMessage.findFirst({ where: { leadId: act.leadId, sentAt: { gte: new Date(act.at.getTime() - 60_000), lte: new Date(act.at.getTime() + 60_000) } } });
    if (sent) throw new Error("This email was sent from the portal, so it can't be undone");
  }
  await prisma.leadActivity.delete({ where: { id: activityId } });
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: act.leadId } });
  const rest = await prisma.leadActivity.findMany({ where: { leadId: act.leadId, type: { in: [...OUTREACH_TYPES, "REPLY"] } }, orderBy: { at: "asc" } });
  const sends = rest.filter((a) => a.type !== "REPLY");
  const reply = rest.find((a) => a.type === "REPLY");
  const first = sends[0];
  const last = sends.at(-1);
  const count = sends.length;
  let stage = lead.stage;
  if (!reply && stage === "REPLIED") stage = count ? "CONTACTED" : "QUALIFIED";
  if (!count && stage === "CONTACTED") stage = "QUALIFIED";
  const nextDay = SEQUENCE_DAYS[count];
  await prisma.lead.update({
    where: { id: act.leadId },
    data: {
      contactCount: count,
      firstContactAt: first?.at ?? null,
      lastContactAt: last?.at ?? null,
      lastChannel: last?.type ?? null,
      firstService: first?.service ?? null,
      repliedAt: reply?.at ?? null,
      stage,
      nextFollowUpAt: ENGAGED_STAGES.includes(stage) ? lead.nextFollowUpAt : first && nextDay != null ? new Date(first.at.getTime() + nextDay * 86_400_000) : null,
    },
  });
  await prisma.leadActivity.create({
    data: { leadId: act.leadId, type: "SYSTEM", text: `Undone: ${act.type.toLowerCase()} logged ${act.at.toISOString().slice(0, 16).replace("T", " ")} UTC`, byId: by.id, byName: by.name },
  });
}

/** They replied: the sequence stops and the lead shows up today to be handled. */
export async function markReplied(leadId: string, o: { text: string; by: By }) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  await prisma.leadActivity.create({ data: { leadId, type: "REPLY", text: o.text, byId: o.by.id, byName: o.by.name } });
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      repliedAt: lead.repliedAt ?? new Date(),
      stage: ["NEW", "QUALIFIED", "CONTACTED", "LOST"].includes(lead.stage) ? "REPLIED" : lead.stage,
      lostReason: null,
      nextFollowUpAt: new Date(),
    },
  });
}
