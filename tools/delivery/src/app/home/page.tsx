import Link from "next/link";
import { PageHeader, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";

/** Delivery at a glance: active projects, late milestones, timesheets to approve, resource clashes and requests. */
export default async function DeliveryHome() {
  const user = await requireUser();
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 86_400_000);
  const [active, late, dueSoon, submitted, requests, issues, people, openCRs] = await Promise.all([
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.milestone.findMany({ where: { status: { not: "DONE" }, dueDate: { not: null, lt: now } }, orderBy: { dueDate: "asc" }, take: 10, include: { project: { select: { id: true, code: true } } } }),
    prisma.milestone.findMany({ where: { status: { not: "DONE" }, dueDate: { not: null, gte: now, lte: soon } }, orderBy: { dueDate: "asc" }, take: 10, include: { project: { select: { id: true, code: true } } } }),
    prisma.timesheetWeek.count({ where: { status: "SUBMITTED" } }),
    prisma.resourceRequest.count({ where: { status: "OPEN" } }),
    prisma.issue.findMany({ where: { status: { notIn: ["CLOSED"] }, projectId: { not: null } }, orderBy: [{ level: "desc" }, { createdAt: "asc" }], take: 8, select: { id: true, code: true, title: true, priority: true, status: true, project: { select: { code: true } } } }),
    prisma.person.findMany({ where: { active: true }, select: { stdHoursPerMonth: true, assignments: { where: { project: { status: { in: ["ACTIVE", "ON_HOLD"] } } }, select: { hoursPerMonth: true } } } }),
    prisma.agreement.count({ where: { type: "CR", status: { in: ["DRAFT", "SENT"] } } }),
  ]);
  const clashes = people.filter((p) => p.assignments.reduce((s, a) => s + a.hoursPerMonth, 0) > p.stdHoursPerMonth).length;
  const bench = people.filter((p) => p.assignments.length === 0).length;
  const list = (items: typeof late, empty: string) => (
    <ul className="divide-y divide-neutral-100 text-sm">
      {items.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
          <span className="min-w-0 truncate"><Link className="font-mono text-xs text-brand-fg hover:underline" href={`/projects/${m.project.id}?tab=milestones`}>{m.project.code}</Link> {m.title}</span>
          <span className="shrink-0 text-xs text-neutral-500">{date(m.dueDate)}</span>
        </li>
      ))}
      {items.length === 0 && <li className="px-5 py-4 text-neutral-500">{empty}</li>}
    </ul>
  );
  return (
    <>
      <PageHeader
        title="Delivery & Resources"
        subtitle="Projects on signed scope, milestones, the team's hours and who is free."
        actions={can(user.role, "projects.create") && <Link href="/projects/new" className="btn-primary">+ New project</Link>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/projects?status=ACTIVE"><Stat label="Active projects" value={active} accent /></Link>
        <Link href="/timesheets/approve"><Stat label="Timesheets to approve" value={submitted} hint="submitted weeks" /></Link>
        <Link href="/resources"><Stat label="Resource clashes" value={clashes} hint={`${bench} on the bench · ${requests} request(s)`} /></Link>
        <Link href="/agreements?type=CR"><Stat label="Change requests open" value={openCRs} hint="draft or sent to the client" /></Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0"><div className="card-h"><div className="card-t text-red-700">Late milestones</div></div>{list(late, "Nothing late.")}</section>
        <section className="card min-w-0"><div className="card-h"><div className="card-t">Due in the next 2 weeks</div></div>{list(dueSoon, "Nothing due.")}</section>
        <section className="card min-w-0">
          <div className="card-h"><div className="card-t">Open issues</div><Link href="/issues" className="text-xs text-brand-fg">All →</Link></div>
          <ul className="divide-y divide-neutral-100 text-sm">
            {issues.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                <span className="min-w-0 truncate"><Link className="text-brand-fg hover:underline" href={`/issues/${i.id}`}>{i.title}</Link> <span className="font-mono text-xs text-neutral-500">{i.project?.code}</span></span>
                <StatusBadge status={i.priority} />
              </li>
            ))}
            {issues.length === 0 && <li className="px-5 py-4 text-neutral-500">No open issues.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
