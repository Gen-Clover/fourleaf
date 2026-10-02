"use server";

// Pay runs: build the month's pay, adjust the draft, send for approval, record payment. Approval (a second
// person) writes each line as an expense — salaries or contractor payments — in Finance.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertPermission } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { type Result, fail } from "@genclover/ui/result";
import { requestApproval } from "../../lib/approvals";
import { utcDay } from "../../lib/finance";
import { draftLines, netOf } from "../../lib/payroll";

const touch = (id?: string) => {
  revalidatePath("/finance/payruns");
  if (id) revalidatePath(`/finance/payruns/${id}`);
  revalidatePath("/approvals");
};

async function writeLines(payRunId: string, month: string) {
  const lines = await draftLines(month);
  await prisma.payLine.deleteMany({ where: { payRunId } });
  if (lines.length) await prisma.payLine.createMany({ data: lines.map((l) => ({ ...l, payRunId })) });
  await totals(payRunId);
  return lines.length;
}

async function totals(payRunId: string) {
  const lines = await prisma.payLine.findMany({ where: { payRunId } });
  await prisma.payRun.update({ where: { id: payRunId }, data: { totalGross: lines.reduce((s, l) => s + l.gross + l.gst, 0), totalNet: lines.reduce((s, l) => s + l.net, 0) } });
}

/** Start the month's pay run (PR-2026-10) from salaries, approved hours, retainers and fixed-fee work orders. */
export async function createPayRun(month: string): Promise<Result & { id?: string }> {
  try {
    const user = await assertPermission("payroll.edit");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Pick a month");
    const code = ids.payRunCode(month);
    const existing = await prisma.payRun.findUnique({ where: { code } });
    if (existing) return { ok: true, message: `${code} already exists.`, id: existing.id };
    const run = await prisma.payRun.create({ data: { code, month, createdBy: user.name } });
    const n = await writeLines(run.id, month);
    await audit(user, "CREATE", "PayRun", run.id, `${code}: ${n} line(s)`);
    touch(run.id);
    return { ok: true, message: `${code} drafted with ${n} line(s).`, id: run.id };
  } catch (e) {
    return fail(e);
  }
}

/** Rebuild a draft from the latest data (e.g. after more timesheets were approved). Edits are lost. */
export async function rebuildPayRun(id: string): Promise<Result> {
  try {
    const user = await assertPermission("payroll.edit");
    const run = await prisma.payRun.findUniqueOrThrow({ where: { id } });
    if (run.status !== "DRAFT") throw new Error("Only drafts can be rebuilt");
    const n = await writeLines(id, run.month);
    await prisma.approval.updateMany({ where: { type: "PAY_RUN", entityId: id, status: "PENDING" }, data: { status: "REJECTED", note: "Rebuilt", decidedByName: user.name, decidedAt: new Date() } });
    await audit(user, "UPDATE", "PayRun", id, `${run.code}: rebuilt, ${n} line(s)`);
    touch(id);
    return { ok: true, message: `Rebuilt: ${n} line(s).` };
  } catch (e) {
    return fail(e);
  }
}

const LineEdit = z.object({ id: z.string(), gross: z.number().min(0), gst: z.number().min(0), tds: z.number().min(0), otherDeductions: z.number().min(0), description: z.string().trim().min(1) });

/** Adjust a draft: salary TDS, PF, advances, part payments of a fixed fee… Net is recomputed. */
export async function saveLines(id: string, rows: unknown): Promise<Result> {
  try {
    const user = await assertPermission("payroll.edit");
    const run = await prisma.payRun.findUniqueOrThrow({ where: { id } });
    if (run.status !== "DRAFT") throw new Error("Only drafts can be changed");
    const data = z.array(LineEdit).parse(rows);
    for (const l of data) await prisma.payLine.update({ where: { id: l.id }, data: { ...l, net: netOf(l) } });
    await totals(id);
    await audit(user, "UPDATE", "PayRun", id, `${run.code}: lines adjusted`);
    touch(id);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeLine(lineId: string): Promise<Result> {
  try {
    await assertPermission("payroll.edit");
    const l = await prisma.payLine.findUniqueOrThrow({ where: { id: lineId }, include: { payRun: true } });
    if (l.payRun.status !== "DRAFT") throw new Error("Only drafts can be changed");
    await prisma.payLine.delete({ where: { id: lineId } });
    await totals(l.payRunId);
    touch(l.payRunId);
    return { ok: true, message: "Removed." };
  } catch (e) {
    return fail(e);
  }
}

/** Send for a second person's approval (Approvals). */
export async function submitPayRun(id: string): Promise<Result> {
  try {
    const user = await assertPermission("payroll.edit");
    const run = await prisma.payRun.findUniqueOrThrow({ where: { id }, include: { _count: { select: { lines: true } } } });
    if (run.status !== "DRAFT") throw new Error("Already approved");
    if (!run._count.lines) throw new Error("Nothing to pay");
    await requestApproval("PAY_RUN", id, { summary: `${run.code}: ${run._count.lines} people, net ₹${Math.round(run.totalNet).toLocaleString("en-IN")}`, amountInr: run.totalGross, link: `/finance/payruns/${id}`, by: user });
    await audit(user, "UPDATE", "PayRun", id, `${run.code}: sent for approval`);
    touch(id);
    return { ok: true, message: "Sent for approval." };
  } catch (e) {
    return fail(e);
  }
}

/** After the bank transfer: the expenses are marked paid on this date. */
export async function markPayRunPaid(id: string, input: { date: string; reference: string }): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const run = await prisma.payRun.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (run.status !== "APPROVED") throw new Error("Only approved pay runs can be paid");
    const date = utcDay(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the payment date").parse(input.date));
    const expenseIds = run.lines.map((l) => l.expenseId).filter((x): x is string => !!x);
    await prisma.expense.updateMany({ where: { id: { in: expenseIds } }, data: { paidOn: date, reference: input.reference || run.code } });
    await prisma.payLine.updateMany({ where: { payRunId: id }, data: { paidOn: date, reference: input.reference || null } });
    await prisma.payRun.update({ where: { id }, data: { status: "PAID", paidAt: date } });
    await audit(user, "UPDATE", "PayRun", id, `${run.code}: paid ${input.date}${input.reference ? ` (${input.reference})` : ""}`);
    touch(id);
    revalidatePath("/expenses");
    revalidatePath("/funds");
    return { ok: true, message: "Marked paid." };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePayRun(id: string) {
  const user = await assertPermission("payroll.edit");
  const run = await prisma.payRun.findUniqueOrThrow({ where: { id } });
  if (run.status !== "DRAFT") throw new Error("Only drafts can be deleted");
  await prisma.approval.deleteMany({ where: { type: "PAY_RUN", entityId: id } });
  await prisma.payRun.delete({ where: { id } });
  await audit(user, "DELETE", "PayRun", id, `${run.code} deleted (draft)`);
  touch();
  redirect("/finance/payruns");
}
