import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { addDays, utcDay, weekStart, ymd } from "@genclover/finance/lib/finance";
import { date } from "@genclover/ui/format";
import WeekGrid, { type GridRow } from "./WeekGrid";

/**
 * Hours per person per day, by project. Team members see and log only their own week (their People record has
 * their login email); managers see everyone. Save as you go, then Submit: approved hours are paid and billed.
 */
export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ person?: string; week?: string }> }) {
  const user = await requireUser();
  const all = can(user.role, "hours.all");
  const sp = await searchParams;
  const people = await prisma.person.findMany({
    where: { active: true, ...(all ? {} : { email: { equals: user.email, mode: "insensitive" } }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const me = people.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
  const personId = people.some((p) => p.id === sp.person) ? sp.person! : (me?.id ?? people[0]?.id);
  const start = weekStart(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? utcDay(sp.week) : new Date());
  const ws = ymd(start);
  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(start, i)));
  const link = (patch: { person?: string; week?: string }) => `/timesheets?person=${patch.person ?? personId}&week=${patch.week ?? ws}`;

  if (!personId) {
    return (
      <>
        <PageHeader title="Timesheets" />
        <div className="card">
          {all ? (
            <Empty href={can(user.role, "people.edit") ? "/people/new" : undefined} cta="Add a person">Add team members under People before logging time.</Empty>
          ) : (
            <Empty>Your login isn&apos;t linked to a team member yet. Ask HR to put your email ({user.email}) on your People record.</Empty>
          )}
        </div>
      </>
    );
  }

  const [entries, assignments, projects, weekTotals, week, recent] = await Promise.all([
    prisma.timeEntry.findMany({ where: { personId, date: { gte: start, lt: addDays(start, 7) } }, select: { projectId: true, billable: true, date: true, hours: true } }),
    prisma.assignment.findMany({ where: { personId, project: { status: { in: ["ACTIVE", "ON_HOLD"] } } }, select: { projectId: true, billable: true } }),
    prisma.project.findMany({
      where: all ? { status: { notIn: ["CANCELLED", "COMPLETED"] } } : { status: { notIn: ["CANCELLED", "COMPLETED"] }, assignments: { some: { personId } } },
      orderBy: { code: "desc" },
      select: { id: true, code: true, name: true },
    }),
    all ? prisma.timeEntry.groupBy({ by: ["personId"], where: { date: { gte: start, lt: addDays(start, 7) } }, _sum: { hours: true } }) : [],
    prisma.timesheetWeek.findUnique({ where: { personId_weekStart: { personId, weekStart: start } } }),
    prisma.timesheetWeek.findMany({ where: { personId }, orderBy: { weekStart: "desc" }, take: 6 }),
  ]);

  const rows = new Map<string, GridRow>();
  for (const e of entries) {
    const k = `${e.projectId}:${e.billable}`;
    const r = rows.get(k) ?? { projectId: e.projectId, billable: e.billable, hours: [0, 0, 0, 0, 0, 0, 0] };
    r.hours[Math.round((e.date.getTime() - start.getTime()) / 864e5)] += e.hours;
    rows.set(k, r);
  }
  for (const a of assignments) {
    const k = `${a.projectId}:${a.billable}`;
    if (!rows.has(k)) rows.set(k, { projectId: a.projectId, billable: a.billable, hours: [0, 0, 0, 0, 0, 0, 0] });
  }
  const totalOf = new Map(weekTotals.map((t) => [t.personId, t._sum.hours ?? 0]));
  const status = week?.status ?? "DRAFT";
  const own = personId === me?.id;
  const locked = status === "APPROVED" || (status === "SUBMITTED" && !all);
  const readOnly = locked || (!own && !all);

  return (
    <>
      <PageHeader title="Timesheets" subtitle={all ? "Hours per person per day, by project. Approved weeks are paid (hourly people) and billed." : "Your hours per day, by project. Save as you go; submit at the end of the week."} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="order-2 space-y-4 lg:order-1">
          {all && (
            <div className="card h-fit">
              <div className="card-h"><div className="card-t">Team · this week</div></div>
              <ul className="divide-y divide-neutral-100 text-sm">
                {people.map((p) => (
                  <li key={p.id}>
                    <Link href={link({ person: p.id })} className={`flex justify-between px-4 py-2 ${p.id === personId ? "bg-brand-soft font-semibold text-brand-fg" : "hover:bg-neutral-50"}`}>
                      <span className="truncate">{p.name}</span><span className="tabular-nums text-neutral-500">{totalOf.get(p.id) ?? 0}h</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card h-fit">
            <div className="card-h"><div className="card-t">Recent weeks</div></div>
            <ul className="divide-y divide-neutral-100 text-sm">
              {recent.map((w) => (
                <li key={w.id}>
                  <Link href={link({ week: ymd(w.weekStart) })} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-neutral-50">
                    <span>{date(w.weekStart)} · {w.hours}h</span><StatusBadge status={w.status} />
                  </Link>
                </li>
              ))}
              {recent.length === 0 && <li className="px-4 py-3 text-xs text-neutral-500">No weeks yet.</li>}
            </ul>
          </div>
        </div>
        <div className="order-1 min-w-0 lg:order-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link href={link({ week: ymd(addDays(start, -7)) })} className="btn-secondary btn-sm">← Prev</Link>
            <span className="text-sm font-semibold">{people.find((p) => p.id === personId)?.name} · week of {date(start)}</span>
            <Link href={link({ week: ymd(addDays(start, 7)) })} className="btn-secondary btn-sm">Next →</Link>
            <Link href={`/timesheets?person=${personId}`} className="text-xs text-brand-fg underline">This week</Link>
            <span className="ml-auto flex items-center gap-2"><StatusBadge status={status} />{week?.decidedBy && <span className="text-xs text-neutral-500">by {week.decidedBy}</span>}</span>
          </div>
          {status === "REJECTED" && week?.note && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Sent back: {week.note}. Fix and submit again.</div>}
          {locked && <div className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">{status === "APPROVED" ? "Approved: locked. A manager can reopen it." : "Submitted: waiting for approval."}</div>}
          <WeekGrid
            key={`${personId}:${ws}:${status}`}
            personId={personId}
            weekStart={ws}
            days={days}
            initial={[...rows.values()]}
            projects={projects.map((p) => ({ id: p.id, label: `${p.code} ${p.name}` }))}
            readOnly={readOnly}
            canSubmit={(own || all) && ["DRAFT", "REJECTED"].includes(status) && (week?.hours ?? 0) > 0}
          />
        </div>
      </div>
    </>
  );
}
