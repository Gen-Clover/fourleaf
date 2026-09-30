import "server-only";
import { prisma, type Tx } from "@genclover/db";
import * as ids from "@genclover/ids";
import { derivedInvoiceStatus, fyShort, fyStartYear, invoiceTotal, monthStatusFor, paidUsd } from "./finance";
import { getInvoiceSettings } from "./settings";

/** Next consecutive number for the financial year of `issueDate`: GCI/26-27/0001 */
export async function nextInvoiceNumber(tx: Tx, issueDate: Date) {
  const { prefix } = await getInvoiceSettings();
  return ids.nextInvoiceNumber(tx, prefix, fyShort(fyStartYear(issueDate)));
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
