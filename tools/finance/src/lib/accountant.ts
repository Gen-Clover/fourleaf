import "server-only";
import { prisma } from "@genclover/db";
import { monthRange, paidUsd, toCsv, ymd } from "./finance";
import { getInvoiceSettings } from "./settings";
import { taxOn } from "./tax";

// The accountant pack: everything the CA enters in Zoho Books (or Tally), staged here and exported as CSV files.
// Column names follow Zoho Books' import templates where there is one; Zoho's import screen lets the CA map any
// column that differs. Figures are the portal's records; the CA remains responsible for the books and filings.

const GST_TREATMENT = (c: { country: string | null; gstin: string | null; currency: string }) =>
  !["india", "in"].includes((c.country ?? "").trim().toLowerCase()) || c.currency !== "INR" ? "overseas" : c.gstin ? "business_gst" : "consumer";

export type Pack = { files: Record<string, string>; counts: Record<string, number> };

export async function accountantPack(fromMonth: string, toMonth: string): Promise<Pack> {
  const from = monthRange(fromMonth).from;
  const to = monthRange(toMonth).to;
  const inRange = { gte: from, lt: to };
  const s = await getInvoiceSettings();
  const [clients, invoices, payments, expenses, paidExpenses, payLines, contractors] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, include: { contacts: { where: { isBilling: true }, take: 1 } } }),
    prisma.invoice.findMany({
      where: { issueDate: inRange, status: { in: ["SENT", "PARTIAL", "PAID", "VOID"] } },
      orderBy: { number: "asc" },
      include: { client: true, project: { select: { code: true } }, lines: { orderBy: { sortOrder: "asc" } }, payments: true },
    }),
    prisma.payment.findMany({ where: { date: inRange }, orderBy: { date: "asc" }, include: { invoice: { select: { number: true, currency: true, fxRate: true, client: { select: { name: true } } } } } }),
    prisma.expense.findMany({ where: { date: inRange }, orderBy: { date: "asc" }, include: { category: true, project: { select: { code: true } }, person: { select: { code: true, pan: true, gstin: true } } } }),
    prisma.expense.findMany({ where: { paidOn: inRange }, orderBy: { paidOn: "asc" }, include: { category: { select: { name: true } } } }),
    prisma.payLine.findMany({ where: { payRun: { month: { gte: fromMonth, lte: toMonth }, status: { in: ["APPROVED", "PAID"] } } }, include: { payRun: { select: { code: true, month: true } }, person: { select: { name: true, code: true, type: true, pan: true, gstin: true } } } }),
    prisma.person.findMany({ where: { type: "CONTRACTOR" }, orderBy: { name: "asc" } }),
  ]);

  const files: Record<string, string> = {};

  files["01_customers.csv"] = toCsv(
    ["Display Name", "Company Name", "Contact Name", "EmailID", "Phone", "Billing Address", "Billing City", "Billing State", "Billing Country", "Place of Supply", "GST Treatment", "GST Identification Number (GSTIN)", "PAN Number", "Currency Code", "Payment Terms", "Client ID", "Client Code"],
    clients.map((c) => [c.legalName || c.name, c.legalName || c.name, c.contacts[0]?.name ?? c.contactName, c.contacts[0]?.email ?? c.email, c.phone, c.billingAddress, c.city, c.state, c.country, c.state, GST_TREATMENT(c), c.gstin, c.pan, c.currency, c.paymentTermsDays ?? s.termsDays, c.number, c.code]),
  );

  // Vendors: contractors (with PAN / GSTIN) and every other payee on expenses.
  const vendorNames = new Set(contractors.map((c) => c.name));
  const others = [...new Set(expenses.map((e) => e.vendor))].filter((v) => !vendorNames.has(v));
  files["02_vendors.csv"] = toCsv(
    ["Display Name", "Vendor Type", "PAN Number", "GST Treatment", "GST Identification Number (GSTIN)", "Email", "Phone", "Person ID"],
    [
      ...contractors.map((c) => [c.name, "Contractor", c.pan, c.gstin ? "business_gst" : "business_none", c.gstin, c.email, c.phone, c.code]),
      ...others.map((v) => [v, "Supplier", "", "", "", "", "", ""]),
    ],
  );

  // Invoices: one row per line (Zoho's invoice import format), with the GST treatment.
  files["03_invoices.csv"] = toCsv(
    ["Invoice Number", "Invoice Date", "Due Date", "Invoice Status", "Customer Name", "GST Treatment", "GST Identification Number (GSTIN)", "Place of Supply", "Currency Code", "Exchange Rate", "Item Name", "Item Desc", "SAC", "Quantity", "Item Price", "Item Total", "Item Tax", "Item Tax %", "Notes", "Project"],
    invoices.flatMap((i) =>
      i.lines.map((l) => [
        i.number,
        i.issueDate,
        i.dueDate,
        i.status === "VOID" ? "Void" : i.status === "PAID" ? "Paid" : "Sent",
        i.client.legalName || i.client.name,
        GST_TREATMENT(i.client),
        i.client.gstin,
        i.placeOfSupply ?? i.client.state,
        i.currency,
        i.fxRate,
        l.kind === "PASS_THROUGH" ? "Reimbursement at cost" : l.kind === "MILESTONE" ? "Milestone" : "IT services",
        l.description,
        i.sac ?? s.sac,
        l.quantity,
        l.unitPrice,
        l.amount,
        i.taxType === "IGST" ? `IGST${i.taxRate}` : i.taxType === "CGST_SGST" ? `GST${i.taxRate}` : i.taxType === "EXPORT_LUT" ? "Export (LUT)" : "",
        i.taxType === "IGST" || i.taxType === "CGST_SGST" ? i.taxRate : 0,
        i.notes,
        i.project?.code,
      ]),
    ),
  );

  files["04_customer_payments.csv"] = toCsv(
    ["Payment Date", "Customer Name", "Invoice Number", "Amount Applied (invoice currency)", "Currency Code", "Invoice Exchange Rate", "INR Received in Bank", "Bank Charges (INR)", "TDS Deducted by Customer (INR)", "Reference Number"],
    payments.map((p) => [p.date, p.invoice.client.name, p.invoice.number, p.amountUsd, p.invoice.currency, p.invoice.fxRate, p.inrReceived, p.bankChargesInr, p.tdsInr, p.reference]),
  );

  files["05_bills_expenses.csv"] = toCsv(
    ["Bill Date", "Bill Number", "Vendor Name", "Account", "Description", "Amount (INR)", "Input GST (INR)", "Currency", "Original Amount", "Exchange Rate", "Paid On", "Status", "Project", "Pass-through (billed to client)", "Vendor PAN"],
    expenses.map((e) => [e.date, e.reference ?? "", e.vendor, e.category.name, e.description, e.amountInr, e.gstInr, e.currency, e.amount, e.fxRate, e.paidOn, e.paidOn ? "Paid" : "Open", e.project?.code, e.passThrough ? "Yes" : "No", e.person?.pan]),
  );

  files["06_vendor_payments.csv"] = toCsv(
    ["Payment Date", "Vendor Name", "Account", "Amount (INR)", "Input GST (INR)", "Reference Number"],
    paidExpenses.map((e) => [e.paidOn, e.vendor, e.category.name, e.amountInr, e.gstInr, e.reference]),
  );

  files["07_payroll_and_contractor_pay.csv"] = toCsv(
    ["Pay Run", "Month", "Person ID", "Name", "Type", "PAN", "GSTIN", "Pay Type", "Description", "Hours", "Gross (INR)", "GST (INR)", "TDS (INR)", "Other Deductions (INR)", "Net Paid (INR)", "Paid On", "Reference"],
    payLines.map((l) => [l.payRun.code, l.payRun.month, l.person.code, l.person.name, l.person.type, l.person.pan, l.person.gstin, l.kind, l.description, l.hours, l.gross, l.gst, l.tds, l.otherDeductions, l.net, l.paidOn, l.reference]),
  );

  // GST summary per invoice (for GSTR-1 / 3B preparation): B2B, B2C, export.
  files["08_gst_outward_supplies.csv"] = toCsv(
    ["Invoice Number", "Invoice Date", "Type", "Customer", "Customer GSTIN", "Place of Supply", "Currency", "Taxable Value", "Taxable Value (INR)", "IGST (INR)", "CGST (INR)", "SGST (INR)", "Invoice Total", "Status"],
    invoices
      .filter((i) => i.status !== "VOID")
      .map((i) => {
        const sub = i.subtotal ?? i.total;
        const t = taxOn(sub, i.taxType, i.taxRate);
        const type = i.taxType === "EXPORT_LUT" || i.taxType === "NONE" ? "Export (LUT)" : i.client.gstin ? "B2B" : "B2C";
        const toInr = (n: number) => Math.round(n * i.fxRate * 100) / 100;
        return [i.number, i.issueDate, type, i.client.legalName || i.client.name, i.client.gstin, i.placeOfSupply, i.currency, sub, toInr(sub), toInr(t.igst), toInr(t.cgst), toInr(t.sgst), i.total, i.status];
      }),
  );

  files["09_tds_deducted_by_customers.csv"] = toCsv(
    ["Payment Date", "Customer", "Invoice Number", "TDS (INR)", "Reference"],
    payments.filter((p) => p.tdsInr > 0).map((p) => [p.date, p.invoice.client.name, p.invoice.number, p.tdsInr, p.reference]),
  );

  files["10_tds_to_deposit.csv"] = toCsv(
    ["Month", "Person ID", "Name", "PAN", "Type", "Pay Type", "Gross (INR)", "TDS (INR)", "Suggested Section", "Pay Run"],
    payLines.filter((l) => l.tds > 0).map((l) => [l.payRun.month, l.person.code, l.person.name, l.person.pan, l.person.type, l.kind, l.gross, l.tds, l.person.type === "EMPLOYEE" ? "192 (salary)" : "194J / 194C — confirm with CA", l.payRun.code]),
  );

  const receivables = await prisma.invoice.findMany({ where: { status: { in: ["SENT", "PARTIAL"] } }, include: { client: { select: { name: true } }, payments: true }, orderBy: { dueDate: "asc" } });
  files["11_receivables_open.csv"] = toCsv(
    ["Invoice Number", "Customer", "Invoice Date", "Due Date", "Currency", "Total", "Settled", "Balance", "Balance (INR at invoice rate)"],
    receivables.map((i) => [i.number, i.client.name, i.issueDate, i.dueDate, i.currency, i.total, paidUsd(i.payments), i.total - paidUsd(i.payments), Math.round((i.total - paidUsd(i.payments)) * i.fxRate)]),
  );

  const cats = await prisma.expenseCategory.findMany({ orderBy: { sortOrder: "asc" } });
  files["12_account_mapping.csv"] = toCsv(
    ["Portal category", "Suggested account type", "Fund (internal)"],
    cats.map((c) => [c.name, c.bucketKey == null ? "Other Current Asset (reimbursable)" : c.bucketKey === "gst" ? "Other Current Liability (GST payable)" : c.name.startsWith("Salaries") ? "Expense — Salaries and Employee Wages" : c.name.startsWith("Contractor") ? "Expense — Contract Assistant / Professional Fees" : "Expense", c.bucketKey ?? "pass-through"]),
  );

  files["00_README.txt"] = [
    `Gen Clover — accountant pack, ${fromMonth} to ${toMonth} (generated ${ymd(new Date())})`,
    ``,
    `Files (CSV, UTF-8), in the order to import into Zoho Books:`,
    `01 customers       Clients with GSTIN, PAN, place of supply, currency, GST treatment`,
    `02 vendors         Contractors (PAN / GSTIN) and other payees`,
    `03 invoices        Issued invoices, one row per line, with GST treatment and tax`,
    `04 customer pay.   Receipts: amount applied, INR received, bank charges, TDS deducted by the customer`,
    `05 bills           Every expense in the period (incl. approved salaries and contractor pay)`,
    `06 vendor pay.     Expenses paid in the period`,
    `07 payroll         Pay run lines: gross, GST, TDS, other deductions, net`,
    `08 GST outward     Per-invoice taxable value and IGST / CGST / SGST in INR (GSTR-1 / 3B prep)`,
    `09 TDS receivable  TDS customers deducted (match with Form 26AS)`,
    `10 TDS payable     TDS withheld from salaries / contractors (deposit by the 7th, file 24Q / 26Q)`,
    `11 receivables     Open invoices today`,
    `12 account mapping Portal expense categories → suggested accounts`,
    ``,
    `Company: ${s.legalName}${s.gstin ? ` · GSTIN ${s.gstin}` : ""}${s.pan ? ` · PAN ${s.pan}` : ""} · SAC ${s.sac}${s.lut ? ` · LUT ${s.lut}` : ""}`,
    `Export invoices are zero-rated under LUT. Figures are from the portal's records; please review before filing.`,
  ].join("\r\n");

  return {
    files,
    counts: { customers: clients.length, vendors: contractors.length + others.length, invoices: invoices.length, payments: payments.length, expenses: expenses.length, payLines: payLines.length },
  };
}
