import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, hasRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { ledger } from "../lib/ledger";
import { fyMonths, fyShort, fyStartYear, monthRange, paidUsd, paymentFx, toCsv } from "../lib/finance";

// CSV exports for accounting / GST filings, one Indian financial year at a time.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "EDITOR")) return new NextResponse("Forbidden", { status: 403 });
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  const fy = Number(req.nextUrl.searchParams.get("fy")) || fyStartYear(new Date());
  const months = fyMonths(fy);
  const from = monthRange(months[0]).from;
  const to = monthRange(months[11]).to;
  const inFy = { gte: from, lt: to };
  let csv: string;

  switch (kind) {
    case "invoices": {
      const rows = await prisma.invoice.findMany({ where: { issueDate: inFy, NOT: { status: "DRAFT" } }, orderBy: { number: "asc" }, include: { client: true, project: true, payments: true } });
      csv = toCsv(
        ["Invoice no", "Issue date", "Due date", "Status", "Client", "Country", "Project", "Currency", "Total USD", "Booking FX", "Total INR (booked)", "Paid USD", "Balance USD"],
        rows.map((i) => [i.number, i.issueDate, i.dueDate, i.status, i.client.name, i.client.country, i.project?.code, i.currency, i.total.toFixed(2), i.fxRate, (i.total * i.fxRate).toFixed(2), paidUsd(i.payments).toFixed(2), i.status === "VOID" ? 0 : (i.total - paidUsd(i.payments)).toFixed(2)]),
      );
      break;
    }
    case "payments": {
      const rows = await prisma.payment.findMany({ where: { date: inFy }, orderBy: { date: "asc" }, include: { invoice: { include: { client: true } } } });
      csv = toCsv(
        ["Date credited", "Invoice no", "Client", "USD", "INR credited", "Bank charges INR", "Effective rate", "Booking FX", "FX gain/loss INR", "Reference"],
        rows.map((p) => {
          const fx = paymentFx(p, p.invoice.fxRate);
          return [p.date, p.invoice.number, p.invoice.client.name, p.amountUsd.toFixed(2), p.inrReceived.toFixed(2), p.bankChargesInr.toFixed(2), fx.effectiveRate.toFixed(4), p.invoice.fxRate, fx.fxGainInr.toFixed(2), p.reference];
        }),
      );
      break;
    }
    case "expenses": {
      const rows = await prisma.expense.findMany({ where: { date: inFy }, orderBy: { date: "asc" }, include: { category: true, project: true } });
      csv = toCsv(
        ["Date", "Vendor", "Description", "Category", "Bucket", "Currency", "Amount", "FX", "Amount INR", "Input GST INR", "Project", "Pass-through", "Paid on", "Reference"],
        rows.map((e) => [e.date, e.vendor, e.description, e.category.name, e.category.bucketKey ?? "pass-through", e.currency, e.amount, e.fxRate, e.amountInr.toFixed(2), e.gstInr.toFixed(2), e.project?.code, e.passThrough ? "Y" : "N", e.paidOn, e.reference]),
      );
      break;
    }
    case "timesheets": {
      const rows = await prisma.timeEntry.findMany({ where: { date: inFy }, orderBy: [{ date: "asc" }], include: { person: true, project: true } });
      const withCost = user.role === "ADMIN";
      csv = toCsv(
        ["Date", "Person", "Project", "Hours", "Billable", ...(withCost ? ["Cost rate INR/hr", "Cost INR"] : [])],
        rows.map((t) => [t.date, t.person.name, t.project.code, t.hours, t.billable ? "Y" : "N", ...(withCost ? [t.costRateInr.toFixed(2), (t.hours * t.costRateInr).toFixed(2)] : [])]),
      );
      break;
    }
    case "pnl": {
      const L = await ledger(months[0], months[11]);
      const spendKeys = L.buckets.filter((b) => !b.isProfit);
      csv = toCsv(
        ["Month", "Revenue USD", "Revenue INR", ...spendKeys.map((b) => b.name), "Pass-through recovered", "Pass-through cost", "FX gain/loss", "Net profit", "Cash in", "Cash out"],
        L.months.map((m) => [m.month, m.revenueUsd.toFixed(2), m.revenueInr.toFixed(2), ...spendKeys.map((b) => (m.spend[b.key] ?? 0).toFixed(2)), m.ptRecoveredInr.toFixed(2), m.ptCostInr.toFixed(2), m.fxGainInr.toFixed(2), m.net.toFixed(2), m.cashIn.toFixed(2), m.cashOut.toFixed(2)]),
      );
      break;
    }
    default:
      return new NextResponse("Unknown export", { status: 400 });
  }

  return new NextResponse("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="genclover-${kind}-FY${fyShort(fy)}.csv"` },
  });
}
