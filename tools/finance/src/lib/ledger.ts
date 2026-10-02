import "server-only";
import { prisma } from "@genclover/db";
import { getBuckets, getParams, parseSnapshot } from "./settings";
import { split } from "./calc";
import { agingBucket, bucketVariance, fxFor, monthRange, monthsBetween, paidUsd, paymentFx, ym } from "./finance";

/**
 * Accrual P&L, cash flow and project profitability in ₹ for months [fromMonth, toMonth].
 * - Service revenue: monthly billing records by month, at the invoice's booking FX (or the settings FX if not yet
 *   invoiced; ₹ projects at 1), plus fixed-price milestone invoices by issue month. GST is never revenue.
 * - Pass-through: recovered on invoices (by issue month) vs cost (by expense date) — outside the allocation model.
 * - Spend: expenses by date, mapped to buckets through their category. Bank charges on receipts count as Corporate Ops.
 * - FX: realised gain/loss on receipts (payment month).
 * - Project cost: timesheet hours × snapshotted ₹/hr, plus non-pass-through expenses tagged to the project.
 */
export async function ledger(fromMonth: string, toMonth: string) {
  const months = monthsBetween(fromMonth, toMonth);
  const from = monthRange(fromMonth).from;
  const to = monthRange(toMonth).to;
  const [p, buckets, records, expenses, payments, ptLines, entries, msLines] = await Promise.all([
    getParams(),
    getBuckets(),
    prisma.monthlyRecord.findMany({
      where: { month: { gte: fromMonth, lte: toMonth } },
      include: { invoice: { select: { fxRate: true, status: true } }, project: { select: { id: true, code: true, name: true, currency: true, allocationSnapshot: true, client: { select: { id: true, name: true } } } } },
    }),
    prisma.expense.findMany({ where: { date: { gte: from, lt: to } }, include: { category: true } }),
    prisma.payment.findMany({ where: { date: { gte: from, lt: to } }, include: { invoice: { select: { fxRate: true, clientId: true } } } }),
    prisma.invoiceLine.findMany({
      where: { kind: "PASS_THROUGH", invoice: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: from, lt: to } } },
      include: { invoice: { select: { fxRate: true, issueDate: true, projectId: true } } },
    }),
    prisma.timeEntry.findMany({ where: { date: { gte: from, lt: to } }, select: { projectId: true, date: true, hours: true, billable: true, costRateInr: true } }),
    prisma.invoiceLine.findMany({
      where: { kind: "MILESTONE", invoice: { status: { in: ["SENT", "PARTIAL", "PAID"] }, issueDate: { gte: from, lt: to } } },
      include: { invoice: { select: { fxRate: true, currency: true, issueDate: true, projectId: true, project: { select: { id: true, code: true, name: true, allocationSnapshot: true, client: { select: { name: true } } } } } } },
    }),
  ]);

  const corpKey = buckets.find((b) => b.key === "corpOps")?.key ?? buckets.find((b) => b.category === "CORPORATE" && !b.isProfit)?.key ?? "unmapped";
  const row = () => ({ revenueUsd: 0, revenueInr: 0, ptRecoveredInr: 0, ptCostInr: 0, fxGainInr: 0, spend: {} as Record<string, number>, budget: {} as Record<string, number>, cashIn: 0, cashOut: 0 });
  const byMonth = new Map(months.map((m) => [m, row()]));
  const add = (rec: Record<string, number>, k: string, v: number) => (rec[k] = (rec[k] ?? 0) + v);

  type Proj = { id: string; code: string; name: string; client: string; revenueUsd: number; revenueInr: number; hoursBilled: number; hoursLogged: number; laborInr: number; directInr: number; ptNetInr: number; deliveryPct: number };
  const projects = new Map<string, Proj>();
  const proj = (id: string, info?: { code: string; name: string; client: string; deliveryPct: number }) => {
    let x = projects.get(id);
    if (!x) projects.set(id, (x = { id, code: info?.code ?? "?", name: info?.name ?? "", client: info?.client ?? "", revenueUsd: 0, revenueInr: 0, hoursBilled: 0, hoursLogged: 0, laborInr: 0, directInr: 0, ptNetInr: 0, deliveryPct: info?.deliveryPct ?? 65 }));
    return x;
  };

  for (const r of records) {
    const m = byMonth.get(r.month)!;
    const fx = r.invoice && r.invoice.status !== "VOID" ? r.invoice.fxRate : fxFor(r.project.currency, p.fxRate);
    const inr = r.revenue * fx;
    if (r.project.currency !== "INR") m.revenueUsd += r.revenue;
    m.revenueInr += inr;
    const snap = parseSnapshot(r.project.allocationSnapshot);
    for (const l of split(inr, snap).lines) add(m.budget, l.key, l.amount);
    const x = proj(r.project.id, { code: r.project.code, name: r.project.name, client: r.project.client.name, deliveryPct: split(100, snap).delivery });
    if (r.project.currency !== "INR") x.revenueUsd += r.revenue;
    x.revenueInr += inr;
    x.hoursBilled += r.hours;
  }
  // Fixed-price milestones: revenue in the month the invoice is issued.
  for (const l of msLines) {
    const m = byMonth.get(ym(l.invoice.issueDate));
    if (!m) continue;
    const inr = l.amount * l.invoice.fxRate;
    if (l.invoice.currency !== "INR") m.revenueUsd += l.amount;
    m.revenueInr += inr;
    const pr = l.invoice.project;
    if (pr) {
      const snap = parseSnapshot(pr.allocationSnapshot);
      for (const s of split(inr, snap).lines) add(m.budget, s.key, s.amount);
      const x = proj(pr.id, { code: pr.code, name: pr.name, client: pr.client.name, deliveryPct: split(100, snap).delivery });
      if (l.invoice.currency !== "INR") x.revenueUsd += l.amount;
      x.revenueInr += inr;
    }
  }
  for (const e of expenses) {
    const m = byMonth.get(ym(e.date));
    if (!m) continue;
    if (e.passThrough) m.ptCostInr += e.amountInr;
    else add(m.spend, e.category.bucketKey ?? "unmapped", e.amountInr);
    if (e.projectId) {
      const x = proj(e.projectId);
      if (e.passThrough) x.ptNetInr -= e.amountInr;
      else x.directInr += e.amountInr;
    }
  }
  // Cash out uses the paid date, which can fall outside the P&L range; query it separately.
  const paidOut = await prisma.expense.findMany({ where: { paidOn: { gte: from, lt: to } }, select: { paidOn: true, amountInr: true, gstInr: true } });
  for (const e of paidOut) {
    const m = byMonth.get(ym(e.paidOn!));
    if (m) m.cashOut += e.amountInr + e.gstInr;
  }
  for (const pay of payments) {
    const m = byMonth.get(ym(pay.date))!;
    m.fxGainInr += paymentFx(pay, pay.invoice.fxRate).fxGainInr;
    add(m.spend, corpKey, pay.bankChargesInr);
    m.cashIn += pay.inrReceived;
  }
  for (const l of ptLines) {
    const m = byMonth.get(ym(l.invoice.issueDate))!;
    const inr = l.amount * l.invoice.fxRate;
    m.ptRecoveredInr += inr;
    if (l.invoice.projectId) proj(l.invoice.projectId).ptNetInr += inr;
  }
  for (const e of entries) {
    const x = proj(e.projectId);
    x.hoursLogged += e.hours;
    x.laborInr += e.hours * e.costRateInr;
  }
  // Fill project names for projects that only had cost in the period
  const missing = [...projects.values()].filter((x) => x.code === "?").map((x) => x.id);
  if (missing.length) {
    for (const pr of await prisma.project.findMany({ where: { id: { in: missing } }, include: { client: { select: { name: true } } } })) {
      const x = projects.get(pr.id)!;
      Object.assign(x, { code: pr.code, name: pr.name, client: pr.client.name, deliveryPct: split(100, parseSnapshot(pr.allocationSnapshot)).delivery });
    }
  }

  const monthRows = months.map((month) => {
    const m = byMonth.get(month)!;
    const spendTotal = Object.values(m.spend).reduce((s, v) => s + v, 0);
    const net = m.revenueInr + m.ptRecoveredInr - m.ptCostInr + m.fxGainInr - spendTotal;
    return { month, ...m, spendTotal, net, cashNet: m.cashIn - m.cashOut };
  });
  const sum = (f: (r: (typeof monthRows)[number]) => number) => monthRows.reduce((s, r) => s + f(r), 0);
  const totalSpend: Record<string, number> = {};
  const totalBudget: Record<string, number> = {};
  for (const r of monthRows) {
    for (const [k, v] of Object.entries(r.spend)) add(totalSpend, k, v);
    for (const [k, v] of Object.entries(r.budget)) add(totalBudget, k, v);
  }
  const totals = {
    revenueUsd: sum((r) => r.revenueUsd),
    revenueInr: sum((r) => r.revenueInr),
    ptRecoveredInr: sum((r) => r.ptRecoveredInr),
    ptCostInr: sum((r) => r.ptCostInr),
    fxGainInr: sum((r) => r.fxGainInr),
    spendTotal: sum((r) => r.spendTotal),
    net: sum((r) => r.net),
    cashIn: sum((r) => r.cashIn),
    cashOut: sum((r) => r.cashOut),
  };

  const projectRows = [...projects.values()]
    .map((x) => {
      const cost = x.laborInr + x.directInr;
      const margin = x.revenueInr + x.ptNetInr - cost;
      return { ...x, cost, margin, marginPct: x.revenueInr ? margin / x.revenueInr : null, deliveryRatio: x.revenueInr ? x.laborInr / x.revenueInr : null };
    })
    .sort((a, b) => b.revenueInr - a.revenueInr);

  return {
    months: monthRows,
    totals,
    buckets,
    unmappedSpend: totalSpend.unmapped ?? 0,
    variance: bucketVariance(totals.revenueInr, buckets, totalBudget, totalSpend, totals.net),
    projects: projectRows,
    fx: p.fxRate,
  };
}

/** Open invoices with balance and aging, as of today. */
export async function receivables() {
  const open = await prisma.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIAL"] } },
    include: { client: { select: { id: true, name: true } }, payments: true, project: { select: { code: true } } },
    orderBy: { dueDate: "asc" },
  });
  return open.map((i) => ({ ...i, balance: i.total - paidUsd(i.payments), aging: agingBucket(i.dueDate) }));
}
