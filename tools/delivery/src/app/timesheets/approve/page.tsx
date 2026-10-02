import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { addDays, ymd } from "@genclover/finance/lib/finance";
import { date } from "@genclover/ui/format";
import ApproveControls from "./ApproveControls";

/** Submitted weeks to approve, with each week's hours by project. Recently decided weeks below. */
export default async function ApproveTimesheetsPage() {
  await requirePermission("hours.approve");
  const [pending, recent] = await Promise.all([
    prisma.timesheetWeek.findMany({ where: { status: "SUBMITTED" }, orderBy: { weekStart: "asc" }, include: { person: { select: { id: true, name: true, code: true } } } }),
    prisma.timesheetWeek.findMany({ where: { status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { decidedAt: "desc" }, take: 15, include: { person: { select: { id: true, name: true } } } }),
  ]);
  const breakdown = await Promise.all(
    pending.map((w) =>
      prisma.timeEntry.groupBy({ by: ["projectId"], where: { personId: w.personId, date: { gte: w.weekStart, lt: addDays(w.weekStart, 7) } }, _sum: { hours: true } }),
    ),
  );
  const projectIds = [...new Set(breakdown.flat().map((b) => b.projectId))];
  const projects = new Map((await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true } })).map((p) => [p.id, p.code]));

  return (
    <>
      <PageHeader title="Approve timesheets" subtitle="Only approved hours are paid to hourly people and billed to clients." />
      <section className="card mb-6">
        <div className="card-h"><div className="card-t">Waiting for approval</div><span className="text-xs text-neutral-500">{pending.length}</span></div>
        {pending.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>Person</th><th>Week of</th><th className="num">Hours</th><th className="hidden md:table-cell">By project</th><th /></tr></thead>
            <tbody>
              {pending.map((w, i) => (
                <tr key={w.id}>
                  <td><Link className="font-medium text-brand-fg hover:underline" href={`/timesheets?person=${w.person.id}&week=${ymd(w.weekStart)}`}>{w.person.name}</Link><div className="font-mono text-xs text-neutral-500">{w.person.code}</div></td>
                  <td>{date(w.weekStart)}</td>
                  <td className="num font-semibold">{w.hours}</td>
                  <td className="hidden text-xs md:table-cell">{breakdown[i].map((b) => `${projects.get(b.projectId) ?? "?"} ${b._sum.hours ?? 0}h`).join(" · ")}</td>
                  <td className="text-right"><ApproveControls id={w.id} status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <div className="card-h"><div className="card-t">Recently decided</div></div>
        <table className="tbl">
          <tbody>
            {recent.map((w) => (
              <tr key={w.id}>
                <td>{w.person.name}</td><td>{date(w.weekStart)}</td><td className="num">{w.hours}h</td><td><StatusBadge status={w.status} /></td>
                <td className="text-xs text-neutral-500">{w.decidedBy} · {date(w.decidedAt)}{w.note && ` · ${w.note}`}</td>
                <td className="text-right"><ApproveControls id={w.id} status={w.status} /></td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td className="py-4 text-center text-neutral-500">None yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
