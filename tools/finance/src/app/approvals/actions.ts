"use server";

// Deciding approvals, and what each one unlocks. Pay runs: approval writes the expenses (payable).
import { revalidatePath } from "next/cache";
import { prisma } from "@genclover/db";
import { assertPermission, can } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { type Result, fail } from "@genclover/ui/result";
import { APPROVAL_TYPES, checkDecider } from "../../lib/approvals";
import { addDays, monthRange } from "../../lib/finance";

async function approvePayRun(payRunId: string) {
  const run = await prisma.payRun.findUniqueOrThrow({ where: { id: payRunId }, include: { lines: { include: { person: { select: { name: true, type: true, code: true } } } } } });
  if (run.status !== "DRAFT") throw new Error(`${run.code} is already ${run.status.toLowerCase()}`);
  const cats = await prisma.expenseCategory.findMany();
  const salaries = cats.find((c) => c.name.startsWith("Salaries")) ?? cats.find((c) => c.bucketKey === "delivery");
  const contractors = cats.find((c) => c.name.startsWith("Contractor")) ?? salaries;
  if (!salaries || !contractors) throw new Error("Create a Delivery expense category for salaries first");
  const date = addDays(monthRange(run.month).to, -1);
  for (const l of run.lines) {
    const deductions = [l.tds ? `TDS ₹${Math.round(l.tds)}` : null, l.otherDeductions ? `other deductions ₹${Math.round(l.otherDeductions)}` : null].filter(Boolean).join(", ");
    const e = await prisma.expense.create({
      data: {
        date,
        vendor: l.person.name,
        description: `${run.code} · ${l.description}${deductions ? ` · ${deductions} withheld; net ₹${Math.round(l.net)}` : ""}`,
        categoryId: l.person.type === "EMPLOYEE" ? salaries.id : contractors.id,
        amount: l.gross,
        amountInr: l.gross,
        gstInr: l.gst,
        personId: l.personId,
        payrollMonth: run.month,
        reference: run.code,
      },
    });
    await prisma.payLine.update({ where: { id: l.id }, data: { expenseId: e.id } });
    if (l.kind === "FIXED_FEE" && l.workOrderId) await prisma.workOrder.update({ where: { id: l.workOrderId }, data: { feePaidInr: { increment: l.gross } } });
  }
  return run;
}

/** Approve or reject. The requester can't approve their own (an owner can, with a note). */
export async function decideApproval(id: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<Result> {
  try {
    const user = await assertPermission("finance.approve");
    const a = await prisma.approval.findUniqueOrThrow({ where: { id } });
    if (a.status !== "PENDING") throw new Error("Already decided");
    if (decision === "APPROVED") checkDecider(a, user, note, can(user.role, "admin"));
    if (decision === "REJECTED" && !note?.trim()) throw new Error("Say why it's rejected");
    if (decision === "APPROVED" && a.type === "PAY_RUN") {
      const run = await approvePayRun(a.entityId);
      await prisma.payRun.update({ where: { id: run.id }, data: { status: "APPROVED", approvedBy: user.name, approvedAt: new Date() } });
    }
    await prisma.approval.update({ where: { id }, data: { status: decision, decidedById: user.id, decidedByName: user.name, decidedAt: new Date(), note: note?.trim() || null } });
    await audit(user, "UPDATE", "Approval", a.entityId, `${APPROVAL_TYPES[a.type] ?? a.type}: ${a.summary} — ${decision.toLowerCase()}${note ? ` (${note})` : ""}`);
    revalidatePath("/approvals");
    revalidatePath("/finance/payruns");
    revalidatePath(`/finance/payruns/${a.entityId}`);
    revalidatePath("/expenses");
    return { ok: true, message: decision === "APPROVED" ? "Approved." : "Rejected." };
  } catch (e) {
    return fail(e);
  }
}
