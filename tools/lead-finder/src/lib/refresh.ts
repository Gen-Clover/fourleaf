// Bulk refresh of Google data (Place Details, one request per lead). Leads added by hand have no
// Google place and are skipped; leads already waiting for a refresh aren't queued twice.
import { prisma } from "@genclover/db";
import { enqueue } from "@genclover/db/jobs";
import { costOf } from "./google";

async function alreadyQueued() {
  const jobs = await prisma.job.findMany({ where: { type: "LF_REFRESH", status: { in: ["QUEUED", "RUNNING", "PAUSED"] } }, select: { payload: true } });
  return new Set(jobs.map((j) => JSON.parse(j.payload).leadId as string));
}

/** Of these leads, the ones a refresh would actually run for. */
export async function refreshable(leadIds: string[]) {
  const [leads, queued] = await Promise.all([prisma.lead.findMany({ where: { id: { in: leadIds }, placeId: { not: null } }, select: { id: true } }), alreadyQueued()]);
  return leads.map((l) => l.id).filter((id) => !queued.has(id));
}

export async function refreshEstimate(leadIds: string[]) {
  const ids = await refreshable(leadIds);
  return { count: ids.length, costUsd: await costOf("DETAILS", ids.length) };
}

export async function queueRefresh(leadIds: string[]) {
  const ids = await refreshable(leadIds);
  await enqueue(prisma, ids.map((leadId) => ({ type: "LF_REFRESH", payload: { leadId }, group: "refresh:bulk" })));
  return ids.length;
}
