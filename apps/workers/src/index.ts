// Background worker: runs jobs from the Job table (searches, website audits…) so web requests never
// wait on slow work. Started with the portal by `npm run dev`; in production run `npm run worker`.
import { claimNext, completeJob, failJob, requeueStale, type ClaimedJob } from "@genclover/db/jobs";
import { prisma } from "@genclover/db";
import {
  leadFinderAutoEmail,
  leadFinderInbox,
  leadFinderJobs,
  leadFinderMaintenance,
  leadFinderRotation,
  leadFinderScheduler,
  type JobHandler,
} from "@genclover/lead-finder/jobs";
import { governanceReminders } from "@genclover/governance/jobs";

/** Every tool's job handlers. Add a tool's handlers here to run its jobs. */
const HANDLERS: Record<string, JobHandler> = { ...leadFinderJobs };
/** Recurring work, each on its own clock. */
const MAINTENANCE: { name: string; everyMs: number; firstAfterMs: number; run: () => Promise<unknown> }[] = [
  { name: "lead-finder schedules", everyMs: 60_000, firstAfterMs: 5_000, run: leadFinderScheduler },
  { name: "lead-finder inbox", everyMs: 10 * 60_000, firstAfterMs: 20_000, run: leadFinderInbox },
  { name: "lead-finder auto email", everyMs: 15 * 60_000, firstAfterMs: 40_000, run: leadFinderAutoEmail },
  { name: "lead-finder maintenance", everyMs: 6 * 3_600_000, firstAfterMs: 30_000, run: leadFinderMaintenance },
  { name: "lead-finder rotation", everyMs: 6 * 3_600_000, firstAfterMs: 90_000, run: leadFinderRotation },
  { name: "governance reminders", everyMs: 3 * 3_600_000, firstAfterMs: 60_000, run: governanceReminders },
];

/** Log a maintenance result only when it did something (skips {sent: 0}, {} …). */
const worthLogging = (r: unknown) => !!r && typeof r === "object" && Object.values(r).some((v) => (typeof v === "number" ? v > 0 : !!v));

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 4));
const POLL_MS = 1_000;
const types = Object.keys(HANDLERS);
let running = 0;
let stopping = false;

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);

async function run(job: ClaimedJob) {
  try {
    const result = await HANDLERS[job.type](job.payload as Record<string, unknown>, job);
    if (result === "PAUSED") await prisma.job.update({ where: { id: job.id }, data: { status: "PAUSED", lockedAt: null } });
    else await completeJob(job.id);
  } catch (e) {
    const retry = await failJob(job, e);
    log(`✗ ${job.type} ${retry ? "will retry" : "failed"}: ${e instanceof Error ? e.message : e}`);
  }
}

async function tick() {
  while (!stopping && running < CONCURRENCY) {
    const job = await claimNext(types);
    if (!job) return;
    running++;
    run(job).finally(() => running--);
  }
}

async function main() {
  const requeued = await requeueStale();
  log(`Worker started (${types.length} job types, ${CONCURRENCY} at a time)${requeued ? `, re-queued ${requeued} interrupted job(s)` : ""}`);

  for (const m of MAINTENANCE) {
    let busy = false;
    const go = async () => {
      if (busy || stopping) return; // the previous run is still going (slow inbox, many schedules)
      busy = true;
      try {
        const r = await m.run();
        if (worthLogging(r)) log(`${m.name}:`, JSON.stringify(r));
      } catch (e) {
        log(`${m.name} failed:`, e instanceof Error ? e.message : e);
      } finally {
        busy = false;
      }
    };
    setTimeout(go, m.firstAfterMs);
    setInterval(go, m.everyMs);
  }

  const loop = async () => {
    if (stopping) return;
    await tick().catch((e) => log("poll failed:", e instanceof Error ? e.message : e));
    setTimeout(loop, POLL_MS);
  };
  loop();
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  log("Stopping: finishing running jobs…");
  const deadline = Date.now() + 20_000;
  while (running > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
