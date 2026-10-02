// Lead Finder background jobs and maintenance, run by apps/workers. Each handler is safe to retry.
//
//   LF_SEARCH_CELL  one search phrase in one map cell: up to 3 pages of 20 (Google's limit is 60).
//                   A thorough search splits a cell that hits the limit into four smaller cells;
//                   a quick search remembers it so it can go deeper later.
//   LF_AUDIT        check a lead's website and rescore it (speedTest adds Google PageSpeed)
//   LF_SPEED        add the PageSpeed score to a lead's latest audit
//   LF_REFRESH      fetch fresh Google data for a lead (pauses at the spend cap)
//   LF_BRANCHES     group leads sharing a website or phone into one business
//   LF_NIGHTLY      2 AM IST: speed tests on the best leads with websites, then schedules itself again
import { prisma } from "@genclover/db";
import { enqueue, openJobs } from "@genclover/db/jobs";
import { computeBranches } from "./lib/branches";
import { emailConfigured, sendLeadEmail } from "./lib/email";
import { isRect, quarters, sizeKm } from "./lib/geo";
import { BudgetError, searchPage } from "./lib/google";
import { checkInbox } from "./lib/inbox";
import { GOOGLE_FIELDS_CLEARED, SYSTEM_USER, auditLead, refreshFromGoogle, speedTestLead, upsertPlace } from "./lib/leads";
import { inBusinessHours } from "./lib/markets";
import { buildMessage } from "./lib/messages";
import { shortName } from "./lib/names";
import type { Reason } from "./lib/scoring";
import { type CellPayload, type SearchConfig, createSearch, nextNight, nextWeekly } from "./lib/searchPlan";
import { CLOSED_STAGES, isService, SERVICE, type ServiceKey } from "./lib/services";
import { getLfSettings } from "./lib/settings";
import { changeStage, retryLost, wakeSnoozed } from "./lib/stages";
import { sendDueReminders } from "./lib/tasks";

export type JobResult = void | "PAUSED";
export type JobHandler = (payload: Record<string, unknown>, job: { id: string; group: string | null }) => Promise<JobResult>;
export type { CellPayload };

const GOOGLE_MAX = 60;

async function pauseSearch(searchId: string) {
  await prisma.leadSearch.update({ where: { id: searchId }, data: { status: "PAUSED", error: new BudgetError().message } });
  await prisma.job.updateMany({ where: { group: searchId, status: "QUEUED" }, data: { status: "PAUSED" } });
}

/** Mark the search done once no cell is left (the calling job is still RUNNING, hence ≤ 1), then group branches. */
async function finishIfDone(searchId: string) {
  if ((await openJobs(searchId)) <= 1) {
    const { count } = await prisma.leadSearch.updateMany({ where: { id: searchId, status: "RUNNING" }, data: { status: "DONE", finishedAt: new Date() } });
    if (count) await enqueue(prisma, { type: "LF_BRANCHES", payload: {}, runAfter: new Date(Date.now() + 60_000) });
  }
}

const searchCell: JobHandler = async (payload) => {
  const p = payload as unknown as CellPayload;
  if (!isRect(p.rect)) throw new Error("bad cell");
  const search = await prisma.leadSearch.findUnique({ where: { id: p.searchId } });
  if (!search || ["STOPPED", "PAUSED", "DONE", "FAILED"].includes(search.status)) return;
  if (search.status === "QUEUED") await prisma.leadSearch.update({ where: { id: search.id }, data: { status: "RUNNING" } });
  const speedTest = isService(search.service) && !!SERVICE[search.service].speedTest;

  let pageToken: string | undefined;
  let results = 0;
  let requests = 0;
  let newLeads = 0;
  const audits: string[] = [];
  do {
    let page;
    try {
      page = await searchPage(p.phrase, p.rect, p.market, pageToken);
    } catch (e) {
      if (e instanceof BudgetError) {
        await prisma.leadSearch.update({ where: { id: search.id }, data: { requests: { increment: requests }, found: { increment: results }, newLeads: { increment: newLeads } } });
        await pauseSearch(search.id);
        return "PAUSED";
      }
      throw e;
    }
    requests++;
    for (const place of page.places ?? []) {
      results++;
      if (place.businessStatus === "CLOSED_PERMANENTLY") continue;
      const lead = await upsertPlace(place, { nicheKey: search.nicheKey, area: p.area, market: p.market ?? search.market });
      const hit = await prisma.searchHit.findUnique({ where: { searchId_leadId: { searchId: search.id, leadId: lead.id } } });
      if (!hit) await prisma.searchHit.create({ data: { searchId: search.id, leadId: lead.id, isNew: lead.isNew } });
      if (lead.isNew) newLeads++;
      if (lead.isNew || lead.websiteChanged) audits.push(lead.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  await enqueue(prisma, audits.map((leadId) => ({ type: "LF_AUDIT", payload: { leadId, speedTest }, group: `audit:${search.id}` })));

  // Hit Google's 60 limit: there are probably more here. Thorough: search the four quarters too.
  // Quick: remember the cell so the search page can offer to go deeper on just these areas.
  const settings = await getLfSettings();
  let split = 0;
  const saturated = results >= GOOGLE_MAX;
  if (saturated && p.depth === "THOROUGH" && sizeKm(p.rect) / 2 >= settings.minCellKm) {
    const cells = quarters(p.rect).map((rect) => ({ type: "LF_SEARCH_CELL", group: search.id, payload: { ...p, rect } satisfies CellPayload }));
    await enqueue(prisma, cells);
    split = cells.length;
  }
  await prisma.leadSearch.update({
    where: { id: search.id },
    data: {
      requests: { increment: requests },
      found: { increment: results },
      newLeads: { increment: newLeads },
      cellsDone: { increment: 1 },
      cellsTotal: { increment: split },
      ...(saturated && p.depth === "QUICK" ? { saturated: { push: JSON.stringify({ phrase: p.phrase, rect: p.rect, area: p.area }) } } : {}),
    },
  });
  await finishIfDone(search.id);
};

/** Speed tests on the best open leads with working websites that haven't had one in 30 days. */
async function nightlySpeedTests() {
  const s = await getLfSettings();
  if (s.nightlySpeedTests <= 0) return 0;
  const tested = new Set(
    (await prisma.websiteAudit.findMany({ where: { psiAt: { not: null, gte: new Date(Date.now() - 30 * 86_400_000) } }, select: { leadId: true } })).map((a) => a.leadId),
  );
  const candidates = await prisma.lead.findMany({
    where: { siteState: "OK", stage: { notIn: CLOSED_STAGES }, doNotContact: false, branchOfId: null },
    orderBy: [{ bestScore: "desc" }, { reviewCount: "desc" }],
    select: { id: true },
    take: s.nightlySpeedTests * 3,
  });
  const pick = candidates.filter((c) => !tested.has(c.id)).slice(0, s.nightlySpeedTests);
  await enqueue(prisma, pick.map((c) => ({ type: "LF_SPEED", payload: { leadId: c.id }, group: "nightly" })));
  return pick.length;
}

export const leadFinderJobs: Record<string, JobHandler> = {
  LF_SEARCH_CELL: searchCell,
  LF_AUDIT: async (payload) => {
    await auditLead(String(payload.leadId), { speedTest: !!payload.speedTest });
  },
  LF_SPEED: async (payload) => {
    await speedTestLead(String(payload.leadId));
  },
  // A bulk refresh that reaches the spend cap pauses; resume from the dashboard after raising the cap.
  LF_REFRESH: async (payload) => {
    try {
      await refreshFromGoogle(String(payload.leadId));
    } catch (e) {
      if (e instanceof BudgetError) return "PAUSED";
      throw e;
    }
  },
  LF_BRANCHES: async () => {
    await computeBranches();
  },
  LF_NIGHTLY: async () => {
    await nightlySpeedTests();
    await enqueue(prisma, { type: "LF_NIGHTLY", payload: {}, runAfter: nextNight() });
  },
};

/**
 * Every 6 hours.
 * · Google Maps Platform terms: only place IDs may be stored indefinitely. Closed leads (won, lost, not a fit,
 *   do-not-contact) have Google fields cleared once 30 days old; open leads are refreshed instead.
 * · Leads whose last follow-up got no reply for the set number of days are closed as Lost (No reply).
 */
export async function leadFinderMaintenance() {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const stale = { placeId: { not: null }, googleFetchedAt: { not: null, lt: cutoff } };
  const cleared = await prisma.lead.updateMany({
    where: { ...stale, OR: [{ stage: { in: CLOSED_STAGES } }, { doNotContact: true }] },
    data: GOOGLE_FIELDS_CLEARED,
  });
  const active = await prisma.lead.findMany({ where: { ...stale, stage: { notIn: CLOSED_STAGES }, doNotContact: false }, select: { id: true }, take: 200 });
  const queued = new Set(
    (await prisma.job.findMany({ where: { type: "LF_REFRESH", status: { in: ["QUEUED", "RUNNING", "PAUSED"] } }, select: { payload: true } })).map((j) => JSON.parse(j.payload).leadId),
  );
  const toRefresh = active.filter((l) => !queued.has(l.id));
  await enqueue(prisma, toRefresh.map((l) => ({ type: "LF_REFRESH", payload: { leadId: l.id }, group: "refresh" })));

  const s = await getLfSettings();
  let closed = 0;
  if (s.noReplyDays > 0) {
    const silent = await prisma.lead.findMany({
      where: { stage: "CONTACTED", contactCount: { gte: 4 }, lastContactAt: { not: null, lt: new Date(Date.now() - s.noReplyDays * 86_400_000) } },
      select: { id: true },
    });
    for (const l of silent) {
      await changeStage(l.id, "LOST", {
        by: { id: null, name: SYSTEM_USER },
        reason: `automatic: no reply ${s.noReplyDays} days after the last follow-up`,
        data: { lostReason: "No reply", nextFollowUpAt: null },
      });
    }
    closed = silent.length;
  }
  return { cleared: cleared.count, refreshQueued: toRefresh.length, closedNoReply: closed };
}

/**
 * Every minute: start weekly searches that are due, wake snoozed leads whose date has come, bring back lost
 * leads on their "try again" date, send meeting reminders, and make sure tonight's speed tests are queued.
 */
export async function leadFinderScheduler() {
  const [woken, retried, reminders] = [await wakeSnoozed(), await retryLost(), await sendDueReminders()];
  const due = await prisma.leadSchedule.findMany({ where: { active: true, nextRunAt: { lte: new Date() } } });
  for (const sch of due) {
    // Move the schedule on first, so a failing search can't start again every minute.
    await prisma.leadSchedule.update({ where: { id: sch.id }, data: { nextRunAt: nextWeekly(sch.dayOfWeek, sch.hour), lastRunAt: new Date() } });
    const search = await createSearch(JSON.parse(sch.config) as SearchConfig, { id: null, name: `Schedule: ${sch.name}` }, sch.id);
    await prisma.leadSchedule.update({ where: { id: sch.id }, data: { lastSearchId: search.id } });
  }
  const nightly = await prisma.job.count({ where: { type: "LF_NIGHTLY", status: { in: ["QUEUED", "RUNNING"] } } });
  if (!nightly) await enqueue(prisma, { type: "LF_NIGHTLY", payload: {}, runAfter: nextNight() });
  return { schedulesStarted: due.length, snoozedWoken: woken, lostRetried: retried, remindersSent: reminders };
}

/** Every 10 minutes: read replies, unsubscribes and bounces from the sending mailbox. */
export const leadFinderInbox = () => checkInbox();

/**
 * Every 15 minutes, only if turned on in Settings: send due email follow-ups (day 1, 3, 7) for leads whose
 * first message was an email sent by a person, during the lead's business hours, within the daily limit.
 * The sequence stops by itself when they reply (inbox check), unsubscribe or bounce.
 */
export async function leadFinderAutoEmail() {
  const s = await getLfSettings();
  if (!s.autoEmailFollowUps || !emailConfigured()) return { sent: 0 };
  const due = await prisma.lead.findMany({
    where: {
      stage: "CONTACTED",
      lastChannel: "EMAIL",
      doNotContact: false,
      emailBounced: false,
      email: { not: null },
      branchOfId: null,
      contactCount: { gte: 1, lte: 3 },
      nextFollowUpAt: { not: null, lte: new Date() },
    },
    orderBy: { nextFollowUpAt: "asc" },
    take: 50,
  });
  let sent = 0;
  for (const lead of due) {
    if (!inBusinessHours(lead.market, lead.lng)) continue;
    const firstEmail = await prisma.leadActivity.findFirst({ where: { leadId: lead.id, type: "EMAIL" }, orderBy: { at: "asc" } });
    const service: ServiceKey = isService(lead.firstService) ? lead.firstService : isService(lead.bestService) ? lead.bestService : "NEW_WEBSITE";
    const msg = buildMessage({
      service,
      market: lead.market === "US" ? "US" : "IN",
      step: lead.contactCount,
      business: shortName(lead.name),
      person: lead.contactName ?? lead.personName,
      area: lead.area,
      reasons: (lead.reasons ? JSON.parse(lead.reasons) : []) as Reason[],
      sender: (firstEmail?.byName ?? "Gen Clover").split(" ")[0],
    });
    try {
      await sendLeadEmail(lead.id, { subject: msg.subject, text: msg.text, service, by: { id: firstEmail?.byId ?? null, name: firstEmail?.byName ?? SYSTEM_USER }, auto: true });
      sent++;
    } catch (e) {
      if (/daily email limit/i.test(String(e))) break;
      await prisma.leadActivity.create({ data: { leadId: lead.id, type: "SYSTEM", text: `Automatic follow-up not sent: ${e instanceof Error ? e.message : e}`, byName: SYSTEM_USER } });
    }
  }
  return { sent };
}
