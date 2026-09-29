"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { utcDay, ymd } from "@/lib/finance";
import { type Result, fail, optStr } from "@/lib/result";

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
    const user = await assertRole("EDITOR");
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
    if (id) {
      const prev = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { invoiceLine: true } });
      if (prev.invoiceLine && (prev.amount !== d.amount || prev.projectId !== d.projectId)) throw new Error("Already billed to the client — only paid date and notes can change");
      await prisma.expense.update({ where: { id }, data });
      await audit(user, "UPDATE", "Expense", id, `${d.vendor} ${d.currency} ${d.amount} (${cat.name})`);
    } else {
      const e = await prisma.expense.create({ data });
      await audit(user, "CREATE", "Expense", e.id, `${d.vendor} ${d.currency} ${d.amount} (${cat.name})`);
    }
    revalidatePath("/expenses");
    return { ok: true, message: id ? "Expense updated." : "Expense added." };
  } catch (e) {
    return fail(e);
  }
}

export async function markExpensePaid(id: string) {
  const user = await assertRole("EDITOR");
  const e = await prisma.expense.update({ where: { id }, data: { paidOn: utcDay(ymd(new Date())) } });
  await audit(user, "UPDATE", "Expense", id, `${e.vendor} ₹${e.amountInr} marked paid`);
  revalidatePath("/expenses");
}

export async function deleteExpense(id: string) {
  const user = await assertRole("ADMIN");
  const e = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { invoiceLine: true } });
  if (e.invoiceLine) throw new Error("Already billed on an invoice — void the invoice first");
  await prisma.expense.delete({ where: { id } });
  await audit(user, "DELETE", "Expense", id, `${e.vendor} ₹${e.amountInr} deleted`);
  revalidatePath("/expenses");
}
