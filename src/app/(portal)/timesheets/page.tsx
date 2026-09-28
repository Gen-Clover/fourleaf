import Link from "next/link";
import { Empty, PageHeader, ReadOnlyNote } from "@/components/ui";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, utcDay, weekStart, ymd } from "@/lib/finance";
import { date } from "@/lib/format";
import WeekGrid, { type GridRow } from "./WeekGrid";

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ person?: string; week?: string }> }) {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "EDITOR");
  const sp = await searchParams;
  const people = await prisma.person.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const personId = people.some((p) => p.id === sp.person) ? sp.person! : people[0]?.id;
  const start = weekStart(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? utcDay(sp.week) : new Date());
  const ws = ymd(start);
  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(start, i)));
  const link = (patch: { person?: string; week?: string }) => `/timesheets?person=${patch.person ?? personId}&week=${patch.week ?? ws}`;

  if (!personId) {
    return (
      <>
        <PageHeader title="Timesheets" />
        <div className="card"><Empty href={user.role === "ADMIN" ? "/people/new" : undefined} cta="Add a person">Add team members under People before logging time.</Empty></div>
      </>
    );
  }

  const [entries, assignments, projects, weekTotals] = await Promise.all([
    prisma.timeEntry.findMany({ where: { personId, date: { gte: start, lt: addDays(start, 7) } } }),
    prisma.assignment.findMany({ where: { personId, project: { status: { in: ["ACTIVE", "ON_HOLD"] } } } }),
    prisma.project.findMany({ where: { status: { notIn: ["CANCELLED"] } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }),
    prisma.timeEntry.groupBy({ by: ["personId"], where: { date: { gte: start, lt: addDays(start, 7) } }, _sum: { hours: true } }),
  ]);

  // Rows: existing entries grouped by project+billable, plus assigned projects with no time yet.
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

  return (
    <>
      <PageHeader title="Timesheets" subtitle="Hours per person per day. Billable hours feed monthly billing; all hours carry cost into project profitability." />
      {!canEdit && <ReadOnlyNote />}
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <div className="card h-fit">
          <div className="card-h"><div className="card-t">Team · this week</div></div>
          <ul className="divide-y divide-neutral-100 text-sm">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={link({ person: p.id })} className={`flex justify-between px-4 py-2 ${p.id === personId ? "bg-brand-soft font-semibold text-brand" : "hover:bg-neutral-50"}`}>
                  <span className="truncate">{p.name}</span><span className="tabular-nums text-neutral-500">{totalOf.get(p.id) ?? 0}h</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link href={link({ week: ymd(addDays(start, -7)) })} className="btn-secondary btn-sm">← Prev</Link>
            <span className="text-sm font-semibold">Week of {date(start)}</span>
            <Link href={link({ week: ymd(addDays(start, 7)) })} className="btn-secondary btn-sm">Next →</Link>
            <Link href={`/timesheets?person=${personId}`} className="text-xs text-brand underline">This week</Link>
          </div>
          <WeekGrid
            key={`${personId}:${ws}`}
            personId={personId}
            weekStart={ws}
            days={days}
            initial={[...rows.values()]}
            projects={projects.map((p) => ({ id: p.id, label: `${p.code} ${p.name}` }))}
            readOnly={!canEdit}
          />
        </div>
      </div>
    </>
  );
}
