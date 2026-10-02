import "server-only";
import { prisma, type Tx } from "@genclover/db";
import * as ids from "@genclover/ids";
import { derivedInvoiceStatus, fyShort, fyStartYear, invoiceTotal, monthStatusFor, paidUsd } from "./finance";
import { getInvoiceSettings } from "./settings";
import { taxOn } from "./tax";

/** Next consecutive number for the financial year of `issueDate`: GCI/26-27/0001 */
export async function nextInvoiceNumber(tx: Tx, issueDate: Date) {
  const { prefix } = await getInvoiceSettings();
  return ids.nextInvoiceNumber(tx, prefix, fyShort(fyStartYear(issueDate)));
}

/** Recompute subtotal, tax and total from the lines and the invoice's GST treatment, and the status from payments. */
export async function syncInvoice(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true, payments: true } });
  const subtotal = invoiceTotal(inv.lines);
  const { tax } = taxOn(subtotal, inv.taxType, inv.taxRate);
  const total = Math.round((subtotal + tax) * 100) / 100;
  const status = derivedInvoiceStatus(inv.status, total, paidUsd(inv.payments));
  await tx.invoice.update({ where: { id: invoiceId }, data: { subtotal, taxAmount: tax, total, status } });
  await tx.monthlyRecord.updateMany({ where: { invoiceId }, data: { status: monthStatusFor(status) } });
  // A voided invoice releases its months, milestones and pass-through expenses so they can be billed again.
  if (status === "VOID") {
    await tx.milestone.updateMany({ where: { invoiceId }, data: { invoiceId: null } });
    await tx.monthlyRecord.updateMany({ where: { invoiceId }, data: { invoiceId: null, status: "DRAFT" } });
    await tx.invoiceLine.updateMany({ where: { invoiceId }, data: { expenseId: null } });
  }
  return { total, status };
}

export const withTx = <T>(fn: (tx: Tx) => Promise<T>) => prisma.$transaction(fn);
