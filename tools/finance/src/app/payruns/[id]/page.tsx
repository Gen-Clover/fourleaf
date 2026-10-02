import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, inr, monthLabel } from "@genclover/ui/format";
import { deletePayRun } from "../actions";
import { PayLines, RunActions } from "../PayRunControls";

export default async function PayRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const run = await prisma.payRun.findUnique({
    where: { id },
    include: { lines: { orderBy: [{ kind: "asc" }], include: { person: { select: { name: true, code: true, type: true } } } } },
  });
  if (!run) notFound();
  const approval = await prisma.approval.findFirst({ where: { type: "PAY_RUN", entityId: id }, orderBy: { createdAt: "desc" } });
  const canEdit = can(user.role, "payroll.edit");
  const tds = run.lines.reduce((s, l) => s + l.tds, 0);
  const gst = run.lines.reduce((s, l) => s + l.gst, 0);
  const pendingApproval = approval?.status === "PENDING";

  return (
    <>
      <PageHeader
        title={`${run.code} · ${monthLabel(run.month)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/finance/payruns" className="hover:underline">← Pay runs</Link>·<StatusBadge status={pendingApproval ? "PENDING" : run.status} />· prepared by {run.createdBy}
            {run.approvedBy && ` · approved by ${run.approvedBy} ${date(run.approvedAt)}`}
            {run.paidAt && ` · paid ${date(run.paidAt)}`}
          </span>
        }
        actions={
          canEdit && run.status === "DRAFT" && (
            <form action={deletePayRun.bind(null, run.id)}>
              <button className="btn-danger">Delete draft</button>
            </form>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net pay (to bank)" value={inr(run.totalNet)} accent />
        <Stat label="Gross + GST" value={inr(run.totalGross)} hint={`${run.lines.length} line(s)`} />
        <Stat label="TDS withheld" value={inr(tds)} hint="Deposit by the 7th of next month" />
        <Stat label="Contractor GST" value={inr(gst)} hint="Input credit, if eligible" />
      </div>
      {approval && (
        <div className={`mb-4 rounded-lg border px-4 py-2 text-sm ${approval.status === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : approval.status === "REJECTED" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          Approval: {approval.status.toLowerCase()} {approval.decidedByName && `by ${approval.decidedByName}`}
          {approval.note && ` · "${approval.note}"`}
          {approval.status === "PENDING" && (
            <>
              {" · "}asked by {approval.requestedByName}.{" "}
              {can(user.role, "finance.approve") && <Link className="underline" href="/approvals">Open approvals</Link>}
            </>
          )}
        </div>
      )}
      <div className="mb-4">
        <RunActions runId={run.id} status={run.status} pendingApproval={pendingApproval} canEdit={canEdit} canPay={can(user.role, "finance.edit")} />
      </div>
      <PayLines
        key={run.updatedAt.toISOString()}
        runId={run.id}
        editable={canEdit && run.status === "DRAFT" && !pendingApproval}
        lines={run.lines.map((l) => ({
          id: l.id,
          person: l.person.name,
          code: l.person.code,
          type: l.person.type,
          kind: l.kind,
          description: l.description,
          hours: l.hours,
          gross: l.gross,
          gst: l.gst,
          tds: l.tds,
          otherDeductions: l.otherDeductions,
          net: l.net,
          breakdown: l.breakdown ? JSON.parse(l.breakdown) : [],
        }))}
      />
      <p className="mt-3 text-xs text-neutral-500">
        Only approved timesheet weeks count. Employees&apos; salary TDS, PF, ESI and professional tax: enter them from your payroll provider or CA in &quot;Other deductions&quot; / TDS before
        sending for approval.
      </p>
    </>
  );
}
