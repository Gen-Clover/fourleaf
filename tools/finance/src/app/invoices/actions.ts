"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertPermission } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { getInvoiceSettings, getParams } from "../../lib/settings";
import { MODELS, monthlyRevenue } from "../../lib/calc";
import { addDays, fxFor, lineAmount, paidUsd, utcDay, ymd } from "../../lib/finance";
import { money, monthLabel } from "@genclover/ui/format";
import { defaultTax, inIndia, TAX_TYPES } from "../../lib/tax";
import { nextInvoiceNumber, syncInvoice, withTx } from "../../lib/invoicing";
import { type Result, fail } from "@genclover/ui/result";
import { allocationFor } from "../../lib/treasury";

const draftNumber = () => `DRAFT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

/** Currency, exchange rate and GST for a new invoice to this client. */
async function invoiceDefaults(clientId: string, currency: string | null, fxRate: number) {
  const [client, s] = await Promise.all([prisma.client.findUniqueOrThrow({ where: { id: clientId } }), getInvoiceSettings()]);
  const cur = currency ?? client.currency;
  return { currency: cur, fxRate: fxFor(cur, fxRate), sac: s.sac, termsDays: client.paymentTermsDays ?? s.termsDays, ...defaultTax({ ...client, currency: cur }, s) };
}

const touch = (id?: string) => {
  revalidatePath("/invoices");
  revalidatePath("/billing");
  revalidatePath("/funds");
  revalidatePath("/cfo");
  if (id) revalidatePath(`/invoices/${id}`);
};

/** Monthly billing record → draft invoice (services lines + any unbilled pass-through costs of the project). */
export async function createInvoiceFromMonth(projectId: string, month: string) {
  const user = await assertPermission("finance.edit");
  const rec = await prisma.monthlyRecord.findUniqueOrThrow({
    where: { projectId_month: { projectId, month } },
    include: { lines: true, project: true },
  });
  if (rec.invoiceId) redirect(`/invoices/${rec.invoiceId}`);
  const p = await getParams();
  const project = rec.project;
  const t = await invoiceDefaults(project.clientId, project.currency, p.fxRate);
  const period = monthLabel(month);
  const calc = monthlyRevenue(project, rec.lines, rec.adjustment);

  type L = { kind: string; description: string; quantity: number; unitPrice: number; expenseId?: string };
  const lines: L[] = [];
  switch (project.engagementModel) {
    case "TM":
      for (const l of rec.lines.filter((l) => l.hours > 0)) lines.push({ kind: "SERVICES", description: `${l.label} — ${period}`, quantity: l.hours, unitPrice: l.rate });
      break;
    case "BLENDED":
      lines.push({ kind: "SERVICES", description: `Product engineering services (blended rate) — ${period}`, quantity: calc.hours, unitPrice: project.agreedBlendedRate ?? 0 });
      break;
    case "RETAINER":
      lines.push({ kind: "SERVICES", description: `Monthly retainer, ${project.agreedRetainerHrs ?? 0} hrs included — ${period}`, quantity: 1, unitPrice: project.agreedMonthly ?? 0 });
      if (calc.extraHours > 0) lines.push({ kind: "SERVICES", description: `Additional hours beyond retainer — ${period}`, quantity: calc.extraHours, unitPrice: project.agreedExtraRate ?? 0 });
      break;
    case "FIXED":
      lines.push({ kind: "SERVICES", description: `Fixed monthly fee — ${period}`, quantity: 1, unitPrice: project.agreedMonthly ?? 0 });
      break;
  }
  if (rec.adjustment) lines.push({ kind: "OTHER", description: `Adjustment — ${period}`, quantity: 1, unitPrice: rec.adjustment });

  const passThrough = await prisma.expense.findMany({ where: { projectId, passThrough: true, invoiceLines: { none: {} } }, orderBy: { date: "asc" } });
  for (const e of passThrough) {
    const price = t.currency === "INR" ? e.amountInr : e.currency === "USD" ? e.amount : Math.round((e.amountInr / p.fxRate) * 100) / 100;
    lines.push({ kind: "PASS_THROUGH", description: `${e.vendor}${e.description ? ` — ${e.description}` : ""} (at cost)`, quantity: 1, unitPrice: price, expenseId: e.id });
  }

  const today = utcDay(ymd(new Date()));
  const inv = await withTx(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        number: draftNumber(),
        clientId: project.clientId,
        projectId,
        issueDate: today,
        dueDate: addDays(today, t.termsDays),
        currency: t.currency,
        fxRate: t.fxRate,
        taxType: t.taxType,
        taxRate: t.taxRate,
        placeOfSupply: t.placeOfSupply,
        sac: t.sac,
        notes: `${project.name} (${project.code}) · ${MODELS[project.engagementModel]} · ${period}`,
        lines: { create: lines.map((l, i) => ({ ...l, amount: lineAmount(l), sortOrder: i })) },
      },
    });
    await tx.monthlyRecord.update({ where: { id: rec.id }, data: { invoiceId: inv.id } });
    await syncInvoice(tx, inv.id);
    return inv;
  });
  await audit(user, "CREATE", "Invoice", inv.id, `Draft invoice for ${project.code} ${month} (${lines.length} lines)`);
  touch();
  revalidatePath(`/projects/${projectId}`);
  redirect(`/invoices/${inv.id}`);
}

const Line = z.object({
  kind: z.enum(["SERVICES", "MILESTONE", "PASS_THROUGH", "OTHER"]),
  description: z.string().trim().min(1, "Every line needs a description"),
  quantity: z.number(),
  unitPrice: z.number(),
  expenseId: z.string().nullable().optional(),
});
const InvoiceInput = z.object({
  clientId: z.string().min(1, "Select a client"),
  projectId: z.string().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Issue date required"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date required"),
  fxRate: z.number().positive("FX rate must be positive"),
  currency: z.enum(["USD", "INR"]).default("USD"),
  taxType: z.enum(Object.keys(TAX_TYPES) as [string, ...string[]]).default("NONE"),
  taxRate: z.number().min(0).max(40).default(0),
  placeOfSupply: z.string().nullable().optional(),
  sac: z.string().nullable().optional(),
  notes: z.string().nullable(),
  lines: z.array(Line).min(1, "Add at least one line"),
});

/** Create (no id) or update a DRAFT invoice. */
export async function saveInvoice(id: string | null, input: unknown): Promise<Result & { id?: string }> {
  try {
    const user = await assertPermission("finance.edit");
    const d = InvoiceInput.parse(input);
    if (d.dueDate < d.issueDate) throw new Error("Due date is before the issue date");
    const fields = {
      clientId: d.clientId,
      projectId: d.projectId,
      issueDate: utcDay(d.issueDate),
      dueDate: utcDay(d.dueDate),
      currency: d.currency,
      fxRate: fxFor(d.currency, d.fxRate),
      taxType: d.taxType,
      taxRate: d.taxType === "IGST" || d.taxType === "CGST_SGST" ? d.taxRate : 0,
      placeOfSupply: d.placeOfSupply || null,
      sac: d.sac || null,
      notes: d.notes || null,
    };
    const lines = d.lines.map((l, i) => ({ kind: l.kind, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: lineAmount(l), expenseId: l.expenseId ?? null, sortOrder: i }));
    const saved = await withTx(async (tx) => {
      if (id) {
        const prev = await tx.invoice.findUniqueOrThrow({ where: { id } });
        if (prev.status !== "DRAFT") throw new Error("Only draft invoices can be edited. Void it and re-issue instead.");
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        await tx.invoice.update({ where: { id }, data: { ...fields, lines: { create: lines } } });
      } else {
        id = (await tx.invoice.create({ data: { ...fields, number: draftNumber(), lines: { create: lines } } })).id;
      }
      await syncInvoice(tx, id);
      return tx.invoice.findUniqueOrThrow({ where: { id } });
    });
    await audit(user, "UPDATE", "Invoice", saved.id, `${saved.number}: draft saved, total ${money(saved.total, saved.currency, 2)}`);
    touch(saved.id);
    return { ok: true, message: `Saved — total ${money(saved.total, saved.currency, 2)}.`, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

/** DRAFT → SENT assigns the final consecutive number. SENT → DRAFT (no payments) reopens. VOID is admin-only. */
export async function setInvoiceStatus(id: string, status: "SENT" | "DRAFT" | "VOID"): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true, lines: true } });
    const saved = await withTx(async (tx) => {
      if (status === "SENT") {
        if (inv.status !== "DRAFT") throw new Error("Only drafts can be issued");
        if (!inv.lines.length || inv.total <= 0) throw new Error("Invoice total must be greater than zero");
        // A tax invoice must show the client's address; GST depends on where they are.
        const client = await tx.client.findUniqueOrThrow({ where: { id: inv.clientId }, select: { country: true, state: true, billingAddress: true } });
        if (!client.billingAddress?.trim()) throw new Error("Add the client's billing address (client record → Details) before issuing: a tax invoice must show it");
        if (inIndia(client.country)) {
          if (!client.state) throw new Error("Add the client's state (client record → Details): it is the GST place of supply");
          if (inv.taxType === "EXPORT_LUT" || inv.taxType === "NONE") throw new Error("This client is in India, so GST applies: change the tax type to IGST or CGST + SGST");
        } else if (inv.taxType === "IGST" || inv.taxType === "CGST_SGST") throw new Error("This client is outside India: use Export of services under LUT (no GST)");
        const number = inv.number.startsWith("DRAFT-") ? await nextInvoiceNumber(tx, inv.issueDate) : inv.number;
        await tx.invoice.update({ where: { id }, data: { status: "SENT", number } });
      } else {
        if (inv.payments.length) throw new Error("Invoice has payments — delete them first");
        if (status === "DRAFT" && inv.status !== "SENT") throw new Error("Only sent invoices can be reopened");
        await tx.invoice.update({ where: { id }, data: { status } });
      }
      await syncInvoice(tx, id);
      return tx.invoice.findUniqueOrThrow({ where: { id } });
    });
    await audit(user, "UPDATE", "Invoice", id, `${saved.number}: ${inv.status} → ${status}`);
    touch(id);
    return { ok: true, message: status === "SENT" ? `Issued as ${saved.number}.` : `Invoice ${status === "VOID" ? "voided" : "reopened as draft"}.` };
  } catch (e) {
    return fail(e);
  }
}

const PaymentInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Payment date required"),
  amountUsd: z.number().positive("Enter the amount settled"),
  inrReceived: z.number().min(0, "Enter the ₹ amount credited to the bank"),
  bankChargesInr: z.number().min(0),
  tdsInr: z.number().min(0).default(0),
  reference: z.string().nullable(),
});

export async function recordPayment(invoiceId: string, input: unknown): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const d = PaymentInput.parse(input);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true, lines: true } });
    if (!["SENT", "PARTIAL"].includes(inv.status)) throw new Error("Payments can only be recorded on sent or part-paid invoices");
    const balance = inv.total - paidUsd(inv.payments);
    if (d.amountUsd > balance + 0.01) throw new Error(`Amount exceeds the balance of ${money(balance, inv.currency, 2)}`);
    if (d.inrReceived <= 0 && d.tdsInr <= 0) throw new Error("Enter the ₹ credited to the bank (or the TDS deducted)");
    // Allocation engine: cash received (₹ credited) is split into funds by the active policy.
    const alloc = await allocationFor(d.inrReceived, inv);
    const res = await withTx(async (tx) => {
      const pay = await tx.payment.create({ data: { ...d, date: utcDay(d.date), reference: d.reference || null, invoiceId } });
      await tx.fundEntry.createMany({
        data: alloc.lines.map((l) => ({ date: pay.date, fundKey: l.key, amountInr: l.amount, type: "ALLOCATION", paymentId: pay.id, policy: alloc.policy, note: `${inv.number} receipt`, createdBy: user.name })),
      });
      return syncInvoice(tx, invoiceId);
    });
    await audit(user, "CREATE", "Payment", invoiceId, `${inv.number}: settled ${money(d.amountUsd, inv.currency, 2)} = ₹${d.inrReceived.toFixed(0)} received (charges ₹${d.bankChargesInr.toFixed(0)}, TDS ₹${d.tdsInr.toFixed(0)})`);
    touch(invoiceId);
    revalidatePath("/finance");
    return { ok: true, message: res.status === "PAID" ? "Payment recorded — invoice fully paid." : "Payment recorded." };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePayment(paymentId: string) {
  const user = await assertPermission("finance.edit");
  const pay = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: true } });
  await withTx(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });
    await syncInvoice(tx, pay.invoiceId);
  });
  await audit(user, "DELETE", "Payment", pay.invoiceId, `${pay.invoice.number}: payment of ${money(pay.amountUsd, pay.invoice.currency, 2)} deleted`);
  touch(pay.invoiceId);
}

export async function deleteInvoice(id: string) {
  const user = await assertPermission("finance.edit");
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status !== "DRAFT" || !inv.number.startsWith("DRAFT-")) throw new Error("Only unissued drafts can be deleted — void issued invoices instead");
  await prisma.invoice.delete({ where: { id } });
  await audit(user, "DELETE", "Invoice", id, `Draft ${inv.number} deleted`);
  touch();
  redirect("/invoices");
}

/**
 * Fixed-price billing: a draft invoice for the chosen milestones (each at its billing amount). The milestones
 * are linked to the invoice, so they can't be billed twice; voiding the invoice releases them.
 */
export async function createInvoiceFromMilestones(projectId: string, milestoneIds: string[]): Promise<Result & { id?: string }> {
  try {
    const user = await assertPermission("finance.edit");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const ms = await prisma.milestone.findMany({ where: { projectId, id: { in: milestoneIds } }, orderBy: { sortOrder: "asc" } });
    if (!ms.length) throw new Error("Pick at least one milestone");
    const bad = ms.find((m) => m.invoiceId || !m.billingAmount);
    if (bad) throw new Error(bad.invoiceId ? `"${bad.title}" is already invoiced` : `"${bad.title}" has no billing amount`);
    const p = await getParams();
    const t = await invoiceDefaults(project.clientId, project.currency, p.fxRate);
    const today = utcDay(ymd(new Date()));
    const inv = await withTx(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          number: draftNumber(),
          clientId: project.clientId,
          projectId,
          issueDate: today,
          dueDate: addDays(today, t.termsDays),
          currency: t.currency,
          fxRate: t.fxRate,
          taxType: t.taxType,
          taxRate: t.taxRate,
          placeOfSupply: t.placeOfSupply,
          sac: t.sac,
          notes: `${project.name} (${project.code}) · fixed price`,
          lines: { create: ms.map((m, i) => ({ kind: "MILESTONE", description: `${project.code} milestone: ${m.title}${m.acceptanceRef ? ` (accepted, ${m.acceptanceRef})` : ""}`, quantity: 1, unitPrice: m.billingAmount!, amount: m.billingAmount!, sortOrder: i })) },
        },
      });
      await tx.milestone.updateMany({ where: { id: { in: ms.map((m) => m.id) } }, data: { invoiceId: inv.id } });
      await syncInvoice(tx, inv.id);
      return inv;
    });
    await audit(user, "CREATE", "Invoice", inv.id, `Draft invoice for ${project.code}: ${ms.length} milestone(s)`);
    touch(inv.id);
    revalidatePath(`/finance/projects/${projectId}`);
    return { ok: true, message: "Draft invoice created.", id: inv.id };
  } catch (e) {
    return fail(e);
  }
}

/** Set the billing amount of fixed-price milestones (finance only). */
export async function saveMilestoneAmounts(projectId: string, rows: { id: string; billingAmount: number | null }[]): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const data = z.array(z.object({ id: z.string(), billingAmount: z.number().min(0).nullable() })).parse(rows);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { code: true } });
    for (const r of data) {
      const m = await prisma.milestone.findFirstOrThrow({ where: { id: r.id, projectId } });
      if (m.invoiceId && m.billingAmount !== r.billingAmount) throw new Error(`"${m.title}" is invoiced: void the invoice to change its amount`);
      await prisma.milestone.update({ where: { id: r.id }, data: { billingAmount: r.billingAmount } });
    }
    await audit(user, "UPDATE", "Milestones", projectId, `${project.code}: milestone billing amounts updated`);
    revalidatePath(`/finance/projects/${projectId}`);
    return { ok: true, message: "Billing amounts saved." };
  } catch (e) {
    return fail(e);
  }
}
