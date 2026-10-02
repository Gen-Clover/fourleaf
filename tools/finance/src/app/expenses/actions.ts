"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertPermission } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { utcDay, ymd } from "../../lib/finance";
import { type Result, fail, optStr } from "@genclover/ui/result";
import { isApproved, requestApproval } from "../../lib/approvals";
import { getPaySettings } from "../../lib/settings";

/** At or above the approval limit, an expense is paid only after a second person approves it. */
async function paymentAllowed(e: { id: string; vendor: string; amountInr: number; payrollMonth: string | null }, by: { id: string; name: string }) {
  if (e.payrollMonth) return true; // pay runs have their own approval
  const { approvalLimitInr } = await getPaySettings();
  if (!approvalLimitInr || e.amountInr < approvalLimitInr || (await isApproved("EXPENSE", e.id))) return true;
  await requestApproval("EXPENSE", e.id, { summary: `Pay ${e.vendor} ₹${Math.round(e.amountInr).toLocaleString("en-IN")}`, amountInr: e.amountInr, link: "/expenses", by });
  return false;
}

const ExpenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date required"),
  vendor: z.string().trim().min(1, "Vendor / payee is required"),
  description: optStr,
  categoryId: z.string().min(1, "Pick a category"),
  currency: z.enum(["INR", "USD"]),
  amount: z.coerce.number().positive("Amount must be positive"),
  fxRate: z.coerce.number().positive("FX rate must be positive"),
  gstInr: z.coerce.number().min(0),
  projectId: optStr,
  paidOn: optStr,
  reference: optStr,
});

export async function saveExpense(id: string | null, _: Result, fd: FormData): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const d = ExpenseSchema.parse(Object.fromEntries(fd));
    const cat = await prisma.expenseCategory.findUniqueOrThrow({ where: { id: d.categoryId } });
    const passThrough = cat.bucketKey == null;
    if (passThrough && !d.projectId) throw new Error("Pass-through costs must be tagged to the project they will be billed to");
    const fxRate = d.currency === "INR" ? 1 : d.fxRate;
    const data = {
      ...d,
      date: utcDay(d.date),
      paidOn: d.paidOn ? utcDay(d.paidOn) : null,
      fxRate,
      amountInr: Math.round(d.amount * fxRate * 100) / 100,
      passThrough,
    };
    let held = false;
    if (id) {
      const prev = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { invoiceLines: { select: { id: true }, take: 1 } } });
      if (prev.invoiceLines.length > 0 && (prev.amount !== d.amount || prev.projectId !== d.projectId)) throw new Error("Already billed to the client — only paid date and notes can change");
      if (data.paidOn && !prev.paidOn && !(await paymentAllowed({ ...prev, amountInr: data.amountInr }, user))) {
        data.paidOn = null;
        held = true;
      }
      await prisma.expense.update({ where: { id }, data });
      await audit(user, "UPDATE", "Expense", id, `${d.vendor} ${d.currency} ${d.amount} (${cat.name})`);
    } else {
      const e = await prisma.expense.create({ data: { ...data, paidOn: null } });
      if (data.paidOn) {
        if (await paymentAllowed(e, user)) await prisma.expense.update({ where: { id: e.id }, data: { paidOn: data.paidOn } });
        else held = true;
      }
      await audit(user, "CREATE", "Expense", e.id, `${d.vendor} ${d.currency} ${d.amount} (${cat.name})`);
    }
    revalidatePath("/expenses");
    revalidatePath("/approvals");
    if (held) return { ok: true, message: "Saved as unpaid: it's at or above the approval limit, so it went to Approvals. Mark it paid once approved." };
    return { ok: true, message: id ? "Expense updated." : "Expense added." };
  } catch (e) {
    return fail(e);
  }
}

export async function markExpensePaid(id: string) {
  const user = await assertPermission("finance.edit");
  const prev = await prisma.expense.findUniqueOrThrow({ where: { id } });
  if (!(await paymentAllowed(prev, user))) {
    revalidatePath("/approvals");
    redirect("/expenses?held=1");
  }
  const e = await prisma.expense.update({ where: { id }, data: { paidOn: utcDay(ymd(new Date())) } });
  await audit(user, "UPDATE", "Expense", id, `${e.vendor} ₹${e.amountInr} marked paid`);
  revalidatePath("/expenses");
}

export async function deleteExpense(id: string) {
  const user = await assertPermission("finance.edit");
  const e = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { invoiceLines: { select: { id: true }, take: 1 } } });
  if (e.invoiceLines.length > 0) throw new Error("Already billed on an invoice — void the invoice first");
  await prisma.expense.delete({ where: { id } });
  await audit(user, "DELETE", "Expense", id, `${e.vendor} ₹${e.amountInr} deleted`);
  revalidatePath("/expenses");
}
