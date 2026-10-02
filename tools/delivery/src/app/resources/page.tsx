import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { monthRange } from "@genclover/finance/lib/finance";
import { currentMonth, date } from "@genclover/ui/format";
import FillRequest from "./FillRequest";

const ACTIVE = ["ACTIVE", "ON_HOLD"];

/**
 * The resource pool: each person's capacity against what they're allocated across projects, and what they've
 * logged this month. Over-allocation is a clash to resolve; zero allocation is bench. Requests from project
 * managers are filled here. No pay or rates on this page.
 */
export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission("resources.manage");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const { from, to } = monthRange(month);
  const [people, logged, requests] = await Promise.all([
    prisma.person.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true, code: true, name: true, title: true, type: true, payModel: true, stdHoursPerMonth: true,
        assignments: { where: { project: { status: { in: ACTIVE } } }, select: { hoursPerMonth: true, billable: true, endDate: true, project: { select: { id: true, code: true, name: true } } } },
      },
    }),
    prisma.timeEntry.groupBy({ by: ["personId"], where: { date: { gte: from, lt: to } }, _sum: { hours: true } }),
    prisma.resourceRequest.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, include: { project: { select: { id: true, code: true, name: true } } } }),
  ]);
  const loggedBy = new Map(logged.map((l) => [l.personId, l._sum.hours ?? 0]));
  const rows = people.map((p) => {
    const allocated = p.assignments.reduce((s, a) => s + a.hoursPerMonth, 0);
    return { ...p, allocated, free: p.stdHoursPerMonth - allocated, logged: loggedBy.get(p.id) ?? 0 };
  });
  const clashes = rows.filter((r) => r.free < 0);
  const bench = rows.filter((r) => r.allocated === 0);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const options = rows.sort((a, b) => b.free - a.free).map((r) => ({ id: r.id, label: `${r.name} · ${r.free} hrs free${r.title ? ` · ${r.title}` : ""}` }));

  return (
    <>
      <PageHeader
        title="Resources"
        subtitle="Capacity, allocation and clashes across projects. Project managers request people; you decide who."
        actions={<form className="flex gap-2"><input className="input-sm" type="month" name="month" defaultValue={month} /><button className="btn-secondary btn-sm">Show</button></form>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4"><div className="text-xs text-neutral-500 uppercase">People</div><div className="text-2xl font-semibold">{rows.length}</div><div className="text-xs text-neutral-500">{rows.filter((r) => r.type === "CONTRACTOR").length} contractors</div></div>
        <div className="card p-4"><div className="text-xs text-neutral-500 uppercase">Clashes</div><div className={`text-2xl font-semibold ${clashes.length ? "text-red-600" : ""}`}>{clashes.length}</div><div className="text-xs text-neutral-500">allocated beyond capacity</div></div>
        <div className="card p-4"><div className="text-xs text-neutral-500 uppercase">On the bench</div><div className="text-2xl font-semibold">{bench.length}</div><div className="text-xs text-neutral-500">no active allocation</div></div>
        <div className="card p-4"><div className="text-xs text-neutral-500 uppercase">Open requests</div><div className={`text-2xl font-semibold ${requests.length ? "text-amber-700" : ""}`}>{requests.length}</div><div className="text-xs text-neutral-500">from project managers</div></div>
      </div>

      {requests.length > 0 && (
        <section className="card mb-6">
          <div className="card-h"><div className="card-t">Resource requests</div></div>
          <ul className="divide-y divide-neutral-100">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <Link className="font-mono text-xs text-brand-fg hover:underline" href={`/projects/${r.project.id}?tab=team`}>{r.project.code}</Link> <b>{r.role}</b>
                  {r.skills && ` (${r.skills})`} · {r.hoursPerMonth} hrs/month{r.startDate && ` from ${date(r.startDate)}`}{r.endDate && ` to ${date(r.endDate)}`}
                  <div className="text-xs text-neutral-500">asked by {r.requestedBy} · {date(r.createdAt)}{r.note && ` · ${r.note}`}</div>
                </div>
                <FillRequest id={r.id} people={options} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">Allocation · {month}</div></div>
        <table className="tbl">
          <thead>
            <tr><th>Person</th><th className="num">Capacity</th><th className="num">Allocated</th><th>Allocation</th><th className="num">Logged</th><th className="hidden lg:table-cell">Projects</th></tr>
          </thead>
          <tbody>
            {rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
              const alloc = pct(r.allocated, r.stdHoursPerMonth);
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/people/${r.id}`} className="font-medium text-brand-fg hover:underline">{r.name}</Link>
                    <div className="text-xs text-neutral-500"><span className="font-mono">{r.code}</span> · {r.type === "CONTRACTOR" ? "contractor" : "employee"}{r.title && ` · ${r.title}`}</div>
                  </td>
                  <td className="num">{r.stdHoursPerMonth}</td>
                  <td className={`num ${r.free < 0 ? "font-semibold text-red-600" : ""}`}>{r.allocated}</td>
                  <td className="min-w-40">
                    <div className="h-2 rounded-full bg-neutral-100"><div className={`h-full rounded-full ${alloc > 100 ? "bg-red-500" : alloc >= 80 ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${Math.min(100, alloc)}%` }} /></div>
                    <div className="mt-0.5 text-xs text-neutral-500">{alloc}%{r.free < 0 ? ` · clash: ${-r.free} hrs over` : r.allocated === 0 ? " · bench" : ` · ${r.free} hrs free`}</div>
                  </td>
                  <td className="num">{r.logged}<div className="text-xs text-neutral-500">{pct(r.logged, r.stdHoursPerMonth)}%</div></td>
                  <td className="hidden text-xs lg:table-cell">
                    {r.assignments.map((a) => (
                      <span key={a.project.id} className="mr-2 inline-block">
                        <Link className="font-mono text-brand-fg hover:underline" href={`/projects/${a.project.id}?tab=team`}>{a.project.code}</Link> {a.hoursPerMonth}h{!a.billable && " (non-billable)"}
                      </span>
                    ))}
                    {r.assignments.length === 0 && <span className="text-neutral-500">bench</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
