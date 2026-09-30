import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { emailConfigured, inboxConfigured } from "../../lib/email";
import { resumePausedJobs, retryFailedJobs } from "../moreActions";

const LABEL: Record<string, string> = {
  LF_SEARCH_CELL: "search cells",
  LF_AUDIT: "website checks",
  LF_SPEED: "speed tests",
  LF_REFRESH: "Google refreshes",
  LF_BRANCHES: "branch grouping",
  LF_NIGHTLY: "nightly run",
};

/** Background work at a glance: what's waiting, paused at the spend cap, or failed, and whether the worker runs. */
export default async function WorkerStatus({ canEdit }: { canEdit: boolean }) {
  const lf = { type: { startsWith: "LF_" } };
  const [groups, lastDone, oldestQueued] = await Promise.all([
    prisma.job.groupBy({ by: ["type", "status"], where: { ...lf, status: { in: ["QUEUED", "RUNNING", "PAUSED", "FAILED"] }, NOT: { type: "LF_NIGHTLY" } }, _count: { _all: true } }),
    prisma.job.findFirst({ where: { ...lf, status: "DONE" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    prisma.job.findFirst({ where: { ...lf, status: "QUEUED", runAfter: { lte: new Date() }, NOT: { type: "LF_NIGHTLY" } }, orderBy: { runAfter: "asc" }, select: { runAfter: true } }),
  ]);
  const count = (status: string) => groups.filter((g) => g.status === status).reduce((n, g) => n + g._count._all, 0);
  const detail = (status: string) =>
    groups
      .filter((g) => g.status === status)
      .map((g) => `${g._count._all} ${LABEL[g.type] ?? g.type}`)
      .join(", ");
  const waiting = count("QUEUED") + count("RUNNING");
  // Work has been waiting over 3 minutes: the worker is probably not running.
  const stuck = !!oldestQueued && Date.now() - oldestQueued.runAfter.getTime() > 3 * 60_000 && count("RUNNING") === 0;

  return (
    <section className="card">
      <div className="card-h">
        <div className="card-t">Background work</div>
        <span className="text-xs text-neutral-500">{lastDone?.finishedAt ? `last finished ${date(lastDone.finishedAt)} ${lastDone.finishedAt.toTimeString().slice(0, 5)}` : "nothing run yet"}</span>
      </div>
      <div className="space-y-2 p-5 text-sm">
        {stuck && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">
            Work is waiting but nothing is running. Start the worker: <span className="font-mono">npm run dev</span> (starts it with the portal) or <span className="font-mono">npm run worker</span>.
          </p>
        )}
        <div>Waiting: {waiting ? `${waiting} (${detail("QUEUED") || detail("RUNNING")})` : "nothing"}</div>
        {count("PAUSED") > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-700">Paused at the spend cap: {detail("PAUSED")}</span>
            {canEdit && <form action={async () => { "use server"; await resumePausedJobs(); }}><button className="btn-secondary btn-sm">Resume</button></form>}
          </div>
        )}
        {count("FAILED") > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-red-700">Failed: {detail("FAILED")}</span>
            {canEdit && <form action={async () => { "use server"; await retryFailedJobs(); }}><button className="btn-secondary btn-sm">Retry</button></form>}
          </div>
        )}
        <div className="text-xs text-neutral-500">
          Email sending: {emailConfigured() ? "on" : "not set up (SMTP in .env)"} · Reply checking: {inboxConfigured() ? "on" : "off"}
        </div>
      </div>
    </section>
  );
}
