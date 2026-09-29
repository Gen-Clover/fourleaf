import "server-only";
import { prisma } from "./db";
import { getBuckets, getParams } from "./settings";
import { plannedMonthly } from "./calc";
import { addDays, allocateCash, monthRange, monthlyCostInr, monthlyEquivalent, occurrences, paidUsd, utcDay, ym, ymd } from "./finance";

export const PASS_THROUGH = "passthrough";

/** Treasury settings with defaults. */
export async function getTreasurySettings() {
  const rows = await prisma.setting.findMany({ where: { group: "Treasury & alerts" } });
  const m = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return {
    runwayTargetMonths: m.runwayTargetMonths || 12,
    runwayMinMonths: m.runwayMinMonths || 6,
    minCashInr: m.minCashInr ?? 500000,
    benchMaxPct: m.benchMaxPct ?? 10,
    horizonDays: m.commitmentHorizonDays || 30,
    paymentLagMonths: m.paymentLagMonths ?? 2,
  };
}

export async function activePolicyName() {
  return (await prisma.financialPolicy.findFirst({ where: { active: true }, select: { name: true } }))?.name ?? "Custom allocation";
}

/**
 * Allocation engine: split one receipt into funds. The client pass-through share of the invoice goes to the
 * pass-through clearing fund (it pays back costs already incurred); the rest follows the active policy.
 */
export async function allocationFor(paymentInr: number, invoice: { total: number; lines: { kind: string; amount: number }[] }) {
  const [buckets, policy] = await Promise.all([getBuckets(), activePolicyName()]);
  const pt = invoice.lines.filter((l) => l.kind === "PASS_THROUGH").reduce((s, l) => s + l.amount, 0);
  const ptShare = invoice.total > 0 ? Math.round((paymentInr * pt) / invoice.total) : 0;
  const lines = allocateCash(paymentInr - ptShare, buckets);
  if (ptShare) lines.push({ key: PASS_THROUGH, amount: ptShare });
  return { lines, policy };
}

type Payroll = { personId: string; name: string; type: string; fundKey: string; monthlyInr: number };

/** Monthly payroll obligation per active person (hourly contractors at their assigned hours). */
export async function payrollPlan(): Promise<Payroll[]> {
  const [people, cats] = await Promise.all([
    prisma.person.findMany({ where: { active: true }, include: { assignments: { where: { project: { status: { in: ["ACTIVE", "ON_HOLD"] } } } } } }),
    prisma.expenseCategory.findMany(),
  ]);
  const salaryKey = cats.find((c) => c.name.startsWith("Salaries"))?.bucketKey ?? "delivery";
  const contractKey = cats.find((c) => c.name.startsWith("Contractor"))?.bucketKey ?? salaryKey;
  const today = new Date();
  return people
    .filter((p) => !p.endDate || p.endDate >= today)
    .map((p) => {
      const assigned = p.assignments.reduce((s, a) => s + a.hoursPerMonth, 0);
      const monthlyInr = p.costBasis === "HOURLY" ? p.costInr * (assigned || 0) : monthlyCostInr(p);
      return { personId: p.id, name: p.name, type: p.type, fundKey: p.type === "EMPLOYEE" ? salaryKey : contractKey, monthlyInr };
    })
    .filter((p) => p.monthlyInr > 0);
}

export type Obligation = { source: "PAYROLL" | "BILL" | "COMMITMENT"; kind: string; name: string; fundKey: string; amountInr: number; dueDate: Date; essential: boolean };

/** Everything we must pay between `from` and `to`: payroll not yet run, unpaid bills, scheduled commitments. */
export async function obligationsBetween(from: Date, to: Date): Promise<Obligation[]> {
  const [payroll, bills, commitments, recorded] = await Promise.all([
    payrollPlan(),
    prisma.expense.findMany({ where: { paidOn: null }, include: { category: true } }),
    prisma.commitment.findMany({ where: { active: true } }),
    prisma.expense.findMany({ where: { payrollMonth: { not: null } }, select: { payrollMonth: true, personId: true } }),
  ]);
  const out: Obligation[] = [];
  const done = new Set(recorded.map((r) => `${r.payrollMonth}:${r.personId}`));
  // Payroll is due on the last day of each month in the window (and the current month if not yet run).
  for (let d = monthRange(ym(from)).from; d < to; d = monthRange(ym(addDays(d, 32))).from) {
    const month = ym(d);
    const due = addDays(monthRange(month).to, -1);
    if (due >= to) continue;
    for (const p of payroll) if (!done.has(`${month}:${p.personId}`)) out.push({ source: "PAYROLL", kind: "PAYROLL", name: `${p.name} — ${month}`, fundKey: p.fundKey, amountInr: p.monthlyInr, dueDate: due < from ? from : due, essential: true });
  }
  for (const b of bills) out.push({ source: "BILL", kind: "BILL", name: `${b.vendor}${b.description ? ` — ${b.description}` : ""}`, fundKey: b.category.bucketKey ?? PASS_THROUGH, amountInr: b.amountInr + b.gstInr, dueDate: b.date < from ? from : b.date, essential: true });
  for (const c of commitments) for (const d of occurrences(c, from, to)) out.push({ source: "COMMITMENT", kind: c.kind, name: c.name, fundKey: c.fundKey, amountInr: c.amountInr, dueDate: d, essential: c.essential });
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Live fund balances: allocations/openings/transfers from FundEntry, minus paid expenses (incl. GST) by category fund. */
export async function fundBalances() {
  const [buckets, entries, paid] = await Promise.all([
    getBuckets(),
    prisma.fundEntry.groupBy({ by: ["fundKey", "type"], _sum: { amountInr: true } }),
    prisma.expense.findMany({ where: { paidOn: { not: null } }, select: { amountInr: true, gstInr: true, category: { select: { bucketKey: true } } } }),
  ]);
  const funds = [
    ...buckets.map((b) => ({ key: b.key, name: b.name, percent: b.percent, isProfit: b.isProfit })),
    { key: PASS_THROUGH, name: "Client pass-through (clearing)", percent: 0, isProfit: false },
  ];
  const known = new Set(funds.map((f) => f.key));
  const row = () => ({ allocated: 0, other: 0, spent: 0 });
  const acc = new Map(funds.map((f) => [f.key, row()]));
  const get = (k: string) => {
    if (!acc.has(k)) acc.set(k, row());
    return acc.get(k)!;
  };
  for (const e of entries) {
    const r = get(e.fundKey);
    if (e.type === "ALLOCATION") r.allocated += e._sum.amountInr ?? 0;
    else r.other += e._sum.amountInr ?? 0;
  }
  for (const x of paid) get(x.category.bucketKey ?? PASS_THROUGH).spent += x.amountInr + x.gstInr;
  // Funds that were removed from the allocation model but still hold money stay visible.
  for (const k of acc.keys()) if (!known.has(k)) funds.push({ key: k, name: `${k} (removed)`, percent: 0, isProfit: false });
  return funds.map((f) => {
    const r = acc.get(f.key)!;
    return { ...f, ...r, balance: r.allocated + r.other - r.spent };
  });
}

/** Everything the CFO dashboard needs, in ₹. */
export async function cfoSnapshot() {
  const [s, p, funds] = await Promise.all([getTreasurySettings(), getParams(), fundBalances()]);
  const today = utcDay(ymd(new Date()));
  const horizonEnd = addDays(today, s.horizonDays + 1);
  const [due, payroll, commitments] = await Promise.all([obligationsBetween(today, horizonEnd), payrollPlan(), prisma.commitment.findMany({ where: { active: true } })]);

  const committedBy = new Map<string, number>();
  for (const o of due) committedBy.set(o.fundKey, (committedBy.get(o.fundKey) ?? 0) + o.amountInr);
  const fundRows = funds.map((f) => {
    const committed = committedBy.get(f.key) ?? 0;
    return { ...f, committed, available: f.balance - committed };
  });
  const bankCash = funds.reduce((s2, f) => s2 + f.balance, 0);
  const committedByKind = new Map<string, number>();
  for (const o of due) committedByKind.set(o.kind, (committedByKind.get(o.kind) ?? 0) + o.amountInr);
  const committed = due.reduce((s2, o) => s2 + o.amountInr, 0);

  const payrollMonthly = payroll.reduce((s2, x) => s2 + x.monthlyInr, 0);
  const essentialMonthly = commitments.filter((c) => c.essential).reduce((s2, c) => s2 + monthlyEquivalent(c), 0);
  const burn = payrollMonthly + essentialMonthly;
  const survival = fundRows.find((f) => f.key === "survival");
  const survivalAvailable = survival ? Math.max(0, survival.available) : 0;

  return {
    settings: s,
    fx: p.fxRate,
    today,
    horizonEnd: addDays(horizonEnd, -1),
    funds: fundRows,
    bankCash,
    committed,
    committedByKind: [...committedByKind.entries()].sort((a, b) => b[1] - a[1]),
    availableCash: bankCash - committed,
    obligations: due,
    payrollMonthly,
    essentialMonthly,
    burn,
    survivalAvailable,
    survivalRunway: burn > 0 ? survivalAvailable / burn : null,
    cashRunway: burn > 0 ? Math.max(0, bankCash - committed) / burn : null,
    forecast: await cashForecast(bankCash, p.fxRate, 6),
  };
}

/**
 * Cash forecast by month (₹). Receipts: open invoices by due month (overdue → this month), plus active projects'
 * planned revenue for the previous month when not yet billed (bill in arrears, paid the next month), plus weighted
 * pipeline after its expected close. Payments: obligations (payroll, bills, commitments) by due date.
 */
export async function cashForecast(openingCash: number, fx: number, months: number) {
  const today = utcDay(ymd(new Date()));
  const first = ym(today);
  const keys = Array.from({ length: months }, (_, i) => ym(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1))));
  const end = monthRange(keys[keys.length - 1]).to;
  const [open, projects, obligations] = await Promise.all([
    prisma.invoice.findMany({ where: { status: { in: ["SENT", "PARTIAL"] } }, include: { payments: true } }),
    prisma.project.findMany({ where: { status: { in: ["ACTIVE", "DRAFT", "QUOTED", "NEGOTIATION"] } }, include: { resources: true, months: { select: { month: true } } } }),
    obligationsBetween(today, end),
  ]);
  const rows = new Map(keys.map((k) => [k, { month: k, receipts: 0, pipeline: 0, payments: 0 }]));
  for (const i of open) {
    const k = i.dueDate < today ? first : ym(i.dueDate);
    const r = rows.get(k);
    if (r) r.receipts += (i.total - paidUsd(i.payments)) * i.fxRate;
  }
  for (const [idx, k] of keys.entries()) {
    if (idx === 0) continue;
    const prev = keys[idx - 1];
    const { from: pFrom, to: pTo } = monthRange(prev);
    for (const pr of projects) {
      const monthly = plannedMonthly(pr, pr.resources) * fx;
      if (!monthly) continue;
      const inRange = (!pr.startDate || pr.startDate < pTo) && (!pr.endDate || pr.endDate >= pFrom);
      if (!inRange) continue;
      if (pr.status === "ACTIVE") {
        if (!pr.months.some((m) => m.month === prev)) rows.get(k)!.receipts += monthly;
      } else if (pr.expectedCloseDate && pr.expectedCloseDate < pFrom && pr.probability) {
        rows.get(k)!.pipeline += (monthly * pr.probability) / 100;
      }
    }
  }
  for (const o of obligations) {
    const r = rows.get(ym(o.dueDate));
    if (r) r.payments += o.amountInr;
  }
  let cash = openingCash;
  return keys.map((k) => {
    const r = rows.get(k)!;
    cash += r.receipts + r.pipeline - r.payments;
    return { ...r, net: r.receipts + r.pipeline - r.payments, closing: cash };
  });
}
