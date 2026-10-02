import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, inr } from "@genclover/ui/format";
import { WORK_ORDER_PAY } from "../../lib/pay";

/** Every contractor work order: who, which project, hours, dates and how it's paid. */
export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const showFee = can(user.role, "cost.view");
  const status = (await searchParams).status;
  const orders = await prisma.workOrder.findMany({
    where: status ? { status } : { status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
    omit: { fixedFeeInr: !showFee, feePaidInr: !showFee },
    include: { person: { select: { id: true, name: true, code: true } }, project: { select: { id: true, code: true, name: true } } },
  });
  return (
    <>
      <PageHeader title="Work orders" subtitle="Contractors on projects under their master contractor agreement. Add them from the contractor's page." />
      <div className="mb-4 flex gap-2">
        <Link href="/people/work-orders" className={!status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Open</Link>
        <Link href="/people/work-orders?status=CLOSED" className={status === "CLOSED" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Closed</Link>
      </div>
      <div className="card overflow-x-auto">
        {orders.length === 0 ? (
          <Empty>No work orders.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>ID</th><th>Contractor</th><th>Project</th><th className="num">Hrs / month</th><th>Dates</th><th>Paid as</th>{showFee && <th className="num">Fee</th>}<th>Status</th></tr></thead>
            <tbody>
              {orders.map((w) => (
                <tr key={w.id}>
                  <td className="font-mono text-xs">{w.code}</td>
                  <td><Link className="text-brand-fg hover:underline" href={`/people/${w.person.id}?tab=work`}>{w.person.name}</Link></td>
                  <td><Link className="hover:underline" href={`/projects/${w.project.id}`}><span className="font-mono text-xs">{w.project.code}</span> {w.project.name}</Link>{w.role && <div className="text-xs text-neutral-500">{w.role}</div>}</td>
                  <td className="num">{w.expectedHoursPerMonth}</td>
                  <td className="text-sm">{date(w.startDate)} – {date(w.endDate)}</td>
                  <td className="text-xs">{WORK_ORDER_PAY[w.payTreatment]}</td>
                  {showFee && <td className="num">{(w as { fixedFeeInr?: number | null }).fixedFeeInr != null ? inr((w as { fixedFeeInr?: number | null }).fixedFeeInr!) : "—"}</td>}
                  <td><StatusBadge status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
