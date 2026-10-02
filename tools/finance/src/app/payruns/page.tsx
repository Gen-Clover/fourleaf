import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { currentMonth, date, inr, monthLabel } from "@genclover/ui/format";
import { NewPayRun } from "./PayRunControls";

/** One pay run per month: salaries, hourly contractors, retainers and fixed fees, approved by a second person. */
export default async function PayRunsPage() {
  const user = await requireUser();
  const runs = await prisma.payRun.findMany({ orderBy: { month: "desc" }, include: { _count: { select: { lines: true } } } });
  const pending = new Set((await prisma.approval.findMany({ where: { type: "PAY_RUN", status: "PENDING" }, select: { entityId: true } })).map((a) => a.entityId));
  return (
    <>
      <PageHeader
        title="Pay runs"
        subtitle="Salaries (pro-rated), approved hours × rate, retainers and fixed-fee work orders; TDS and contractor GST. Approval turns each line into an expense."
        actions={can(user.role, "payroll.edit") && <NewPayRun month={currentMonth()} />}
      />
      <div className="card overflow-x-auto">
        {runs.length === 0 ? (
          <Empty>No pay runs yet. Pick a month and prepare one.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>Pay run</th><th>Month</th><th className="num">People</th><th className="num">Gross (+GST)</th><th className="num">Net pay</th><th>Status</th><th className="hidden md:table-cell">Approved</th><th className="hidden md:table-cell">Paid</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/finance/payruns/${r.id}`} className="font-mono text-brand-fg hover:underline">{r.code}</Link></td>
                  <td>{monthLabel(r.month)}</td>
                  <td className="num">{r._count.lines}</td>
                  <td className="num">{inr(r.totalGross)}</td>
                  <td className="num font-semibold">{inr(r.totalNet)}</td>
                  <td><StatusBadge status={pending.has(r.id) ? "PENDING" : r.status} /></td>
                  <td className="hidden text-sm md:table-cell">{r.approvedBy ? `${r.approvedBy} · ${date(r.approvedAt)}` : "—"}</td>
                  <td className="hidden text-sm md:table-cell">{date(r.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
