// Background job queue on MongoDB (the Job table), shared by the portal (adds jobs) and apps/workers
// (runs them). No extra services: a job is claimed by flipping QUEUED → RUNNING in one conditional
// update, so two workers never run the same job.
import type { Tx } from "./index";
import { prisma } from "./index";

type Db = Pick<Tx, "job">;

export type NewJob = { type: string; payload: unknown; group?: string | null; runAfter?: Date };

export async function enqueue(db: Db, jobs: NewJob | NewJob[]) {
  const list = Array.isArray(jobs) ? jobs : [jobs];
  if (!list.length) return;
  await db.job.createMany({
    data: list.map((j) => ({ type: j.type, payload: JSON.stringify(j.payload ?? {}), group: j.group ?? null, runAfter: j.runAfter ?? new Date() })),
  });
}

export type ClaimedJob = { id: string; type: string; payload: unknown; group: string | null; attempts: number };

/** Claim the oldest runnable job of one of `types`, or null when there is none. */
export async function claimNext(types: string[]): Promise<ClaimedJob | null> {
  for (let tries = 0; tries < 5; tries++) {
    const next = await prisma.job.findFirst({
      where: { status: "QUEUED", type: { in: types }, runAfter: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;
    const { count } = await prisma.job.updateMany({
      where: { id: next.id, status: "QUEUED" },
      data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (count === 1) return { id: next.id, type: next.type, payload: JSON.parse(next.payload), group: next.group, attempts: next.attempts + 1 };
    // Another worker took it first: try the next one.
  }
  return null;
}

export const completeJob = (id: string) => prisma.job.update({ where: { id }, data: { status: "DONE", finishedAt: new Date(), error: null } });

/** Retry with backoff up to `maxAttempts`, then mark FAILED. */
export async function failJob(job: ClaimedJob, error: unknown, maxAttempts = 3) {
  const message = error instanceof Error ? error.message : String(error);
  const retry = job.attempts < maxAttempts;
  await prisma.job.update({
    where: { id: job.id },
    data: retry
      ? { status: "QUEUED", lockedAt: null, error: message, runAfter: new Date(Date.now() + 30_000 * job.attempts) }
      : { status: "FAILED", finishedAt: new Date(), error: message },
  });
  return retry;
}

/** Put jobs left RUNNING by a worker that stopped (crash, restart) back in the queue. */
export async function requeueStale(olderThanMs = 10 * 60_000) {
  const { count } = await prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: "QUEUED", lockedAt: null },
  });
  return count;
}

/** Jobs of a group still to run (queued or running). */
export const openJobs = (group: string) => prisma.job.count({ where: { group, status: { in: ["QUEUED", "RUNNING"] } } });
