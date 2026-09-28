import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hourlyCostInr, monthlyCostInr, ym } from "@/lib/finance";
import { inr, monthLabel, pct } from "@/lib/format";
import PersonForm from "../PersonForm";
import { deletePerson } from "../actions";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("EDITOR");
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      role: true,
      assignments: { include: { project: { select: { id: true, code: true, name: true, status: true } }, resource: { select: { label: true } } } },
      timeEntries: { include: { project: { select: { code: true } } }, orderBy: { date: "desc" } },
    },
  });
  if (!person) notFound();
  const roles = isAdmin ? await prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }) : [];

  // Last 6 months of logged time
  const byMonth = new Map<string, { hrs: number; bill: number; cost: number }>();
  for (const e of person.timeEntries) {
    const k = ym(e.date);
    const r = byMonth.get(k) ?? { hrs: 0, bill: 0, cost: 0 };
    r.hrs += e.hours;
    if (e.billable) r.bill += e.hours;
    r.cost += e.hours * e.costRateInr;
    byMonth.set(k, r);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const annualCtcL = (monthlyCostInr(person) * 12) / 1e5;
  const ctcMid = person.role?.ctcMinL != null && person.role.ctcMaxL != null ? (person.role.ctcMinL + person.role.ctcMaxL) / 2 : null;

  return (
    <>
      <PageHeader
        title={person.name}
        subtitle={<span className="flex items-center gap-2"><StatusBadge status={person.type} />{person.title}{!person.active && <span className="badge bg-neutral-100">Inactive</span>}</span>}
        actions={
          <>
            <Link href={`/timesheets?person=${person.id}`} className="btn-secondary">Timesheet</Link>
            {isAdmin && <form action={deletePerson.bind(null, person.id)}><button className="btn-danger">Delete</button></form>}
          </>
        }
      />
      {isAdmin && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Monthly cost" value={inr(monthlyCostInr(person))} hint={`≈ ₹${annualCtcL.toFixed(1)} L / yr`} accent />
          <Stat label="Cost per hour" value={inr(hourlyCostInr(person))} hint={`${person.stdHoursPerMonth} std hrs / month`} />
          <Stat label="Rate-card role" value={<span className="text-base">{person.role?.name ?? "—"}</span>} hint={person.role ? `Standard $${person.role.standardRate}/hr` : undefined} />
          <Stat
            label="vs market CTC midpoint"
            value={ctcMid ? pct(annualCtcL / ctcMid) : "—"}
            hint={ctcMid ? `Market ₹${person.role!.ctcMinL}–${person.role!.ctcMaxL} L` : "Link a rate-card role"}
          />
        </div>
      )}
      {isAdmin && (
        <div className="mb-6">
          <PersonForm
            roles={roles}
            person={{ ...person, startDate: person.startDate?.toISOString() ?? null, endDate: person.endDate?.toISOString() ?? null, nextReviewDate: person.nextReviewDate?.toISOString() ?? null }}
          />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="card-h"><div className="card-t">Assignments</div></div>
          <table className="tbl">
            <thead><tr><th>Project</th><th>Quote line</th><th className="num">Planned hrs / mo</th><th>Billable</th></tr></thead>
            <tbody>
              {person.assignments.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/projects/${a.project.id}?tab=team`} className="text-brand hover:underline"><span className="font-mono text-xs">{a.project.code}</span> {a.project.name}</Link> <StatusBadge status={a.project.status} /></td>
                  <td className="text-xs">{a.resource?.label ?? "—"}</td>
                  <td className="num">{a.hoursPerMonth}</td>
                  <td>{a.billable ? "Yes" : "No"}</td>
                </tr>
              ))}
              {person.assignments.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-neutral-500">Not assigned. Add them on a project&apos;s Team &amp; Cost tab.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <div className="card-h"><div className="card-t">Logged time</div></div>
          <table className="tbl">
            <thead><tr><th>Month</th><th className="num">Hours</th><th className="num">Billable</th><th className="num">Utilisation</th>{isAdmin && <th className="num">Cost</th>}</tr></thead>
            <tbody>
              {months.map(([m, r]) => (
                <tr key={m}><td>{monthLabel(m)}</td><td className="num">{r.hrs}</td><td className="num">{r.bill}</td><td className="num">{pct(r.bill / person.stdHoursPerMonth)}</td>{isAdmin && <td className="num">{inr(r.cost)}</td>}</tr>
              ))}
              {months.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-500">No time logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
