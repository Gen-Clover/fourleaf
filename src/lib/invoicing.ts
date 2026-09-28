import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { derivedInvoiceStatus, fyShort, fyStartYear, invoiceTotal, monthStatusFor, paidUsd } from "./finance";
import { getInvoiceSettings } from "./settings";

type Tx = Prisma.TransactionClient;

/** Next consecutive number for the financial year of `issueDate`: GC/26-27/0001 */
export async function nextInvoiceNumber(tx: Tx, issueDate: Date) {
  const { prefix } = await getInvoiceSettings();
  const head = `${prefix}/${fyShort(fyStartYear(issueDate))}/`;
  const last = await tx.invoice.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: "desc" } });
  const n = last ? Number(last.number.slice(head.length)) + 1 : 1;
  return `${head}${String(n).padStart(4, "0")}`;
}

/** Recompute total + status from lines and payments, then mirror status onto linked monthly records. */
export async function syncInvoice(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true, payments: true } });
  const total = invoiceTotal(inv.lines);
  const status = derivedInvoiceStatus(inv.status, total, paidUsd(inv.payments));
  await tx.invoice.update({ where: { id: invoiceId }, data: { total, status } });
  await tx.monthlyRecord.updateMany({ where: { invoiceId }, data: { status: monthStatusFor(status) } });
  // A voided invoice releases its months and pass-through expenses so they can be billed again.
  if (status === "VOID") {
    await tx.monthlyRecord.updateMany({ where: { invoiceId }, data: { invoiceId: null, status: "DRAFT" } });
    await tx.invoiceLine.updateMany({ where: { invoiceId }, data: { expenseId: null } });
  }
  return { total, status };
}

export const withTx = <T>(fn: (tx: Tx) => Promise<T>) => prisma.$transaction(fn);
