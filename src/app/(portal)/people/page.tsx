import Link from "next/link";
import { Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hourlyCostInr, monthRange, monthlyCostInr, ym } from "@/lib/finance";
import { inr, monthLabel, pct } from "@/lib/format";
import PayrollRun from "./PayrollRun";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ month?: string; all?: string }> }) {
  const user = await requireRole("EDITOR");
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : ym(new Date());
  const { from, to } = monthRange(month);
  const people = await prisma.person.findMany({
    where: sp.all ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      role: { select: { name: true } },
      assignments: { include: { project: { select: { id: true, code: true, status: true } } } },
      timeEntries: { where: { date: { gte: from, lt: to } } },
    },
  });

  let logged = 0,
    billable = 0,
    capacity = 0,
    payroll = 0;
  const rows = people.map((p) => {
    const hrs = p.timeEntries.reduce((s, e) => s + e.hours, 0);
    const bill = p.timeEntries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
    if (p.active) {
      logged += hrs;
      billable += bill;
      capacity += p.stdHoursPerMonth;
      payroll += monthlyCostInr(p);
    }
    return { p, hrs, bill, util: p.stdHoursPerMonth ? bill / p.stdHoursPerMonth : 0 };
  });

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`Team, cost and utilisation — ${monthLabel(month)}`}
        actions={
          <>
            <Link href={sp.all ? "/people" : "/people?all=1"} className="btn-secondary">{sp.all ? "Active only" : "Show inactive"}</Link>
            {isAdmin && <Link href="/people/new" className="btn-primary">+ Add person</Link>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active people" value={people.filter((p) => p.active).length} hint={`${people.filter((p) => p.active && p.type === "CONTRACTOR").length} contractor(s)`} />
        <Stat label="Billable utilisation" value={pct(capacity ? billable / capacity : 0)} hint={`${billable} of ${capacity} standard hrs`} accent />
        <Stat label="Hours logged" value={logged} hint={`${logged - billable} non-billable`} />
        {isAdmin ? <Stat label="Monthly people cost" value={inr(payroll)} hint="At standard hours" /> : <Stat label="Month" value={monthLabel(month)} />}
      </div>
      {isAdmin && <div className="mb-6"><PayrollRun defaultMonth={month} /></div>}
      <div className="card overflow-x-auto">
        {people.length === 0 ? (
          <Empty href={isAdmin ? "/people/new" : undefined} cta="Add your first team member">No people yet. Add your team to track timesheets, utilisation and project cost.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th><th>Type</th><th>Title / role</th><th>Projects</th>
                {isAdmin && <><th className="num">Cost / month</th><th className="num">₹ / hr</th></>}
                <th className="num">Hrs logged</th><th className="num">Billable</th><th className="num">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, hrs, bill, util }) => (
                <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                  <td><Link href={`/people/${p.id}`} className="font-medium text-brand hover:underline">{p.name}</Link></td>
                  <td><StatusBadge status={p.type} /></td>
                  <td className="text-xs">{p.title ?? "—"}{p.role && <div className="text-neutral-500">{p.role.name}</div>}</td>
                  <td className="text-xs">
                    {p.assignments.filter((a) => a.project.status === "ACTIVE").map((a) => (
                      <Link key={a.id} href={`/projects/${a.project.id}?tab=team`} className="mr-1 font-mono text-brand hover:underline">{a.project.code}</Link>
                    ))}
                  </td>
                  {isAdmin && <><td className="num">{inr(monthlyCostInr(p))}</td><td className="num">{inr(hourlyCostInr(p))}</td></>}
                  <td className="num">{hrs}</td>
                  <td className="num">{bill}</td>
                  <td className={`num font-semibold ${util < 0.6 ? "text-amber-700" : util > 1.1 ? "text-red-600" : "text-emerald-700"}`}>{pct(util)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-neutral-500">Utilisation = billable hours ÷ standard hours. Target band 60–110%. Change month with <code>?month=YYYY-MM</code> or on the Timesheets page.</p>
    </>
  );
}
