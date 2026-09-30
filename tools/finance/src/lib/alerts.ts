import "server-only";
import { prisma } from "@genclover/db";
import { plannedMonthly } from "./calc";
import { addDays, fyMonths, fyStartYear, monthRange, ym } from "./finance";
import { ledger, receivables } from "./ledger";
import { monthLabel } from "@genclover/ui/format";
import type { cfoSnapshot } from "./treasury";

export type Level = "critical" | "warning" | "attention" | "healthy";
export type Alert = { level: Level; title: string; detail: string; href?: string };
export const LEVELS: { key: Level; label: string; icon: string; tone: string }[] = [
  { key: "critical", label: "Critical", icon: "🔴", tone: "border-red-200 bg-red-50 text-red-800" },
  { key: "warning", label: "Warning", icon: "🟠", tone: "border-orange-200 bg-orange-50 text-orange-800" },
  { key: "attention", label: "Attention", icon: "🟡", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  { key: "healthy", label: "Healthy", icon: "🟢", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
];

const L = (n: number) => `₹${(n / 1e5).toFixed(2)} L`;

/** The CFO alert rules. Every rule is cheap to read here and maps to one line of the research brief. */
export async function computeAlerts(snap: Awaited<ReturnType<typeof cfoSnapshot>>): Promise<Alert[]> {
  const a: Alert[] = [];
  const s = snap.settings;
  const now = new Date();
  const thisMonth = ym(now);
  const lastMonth = ym(addDays(monthRange(thisMonth).from, -1));
  const prevMonth = ym(addDays(monthRange(lastMonth).from, -1));
  const fy = fyStartYear(now);
  const fyM = fyMonths(fy);

  const [people, projects, open, reviews, lateMs, entries, fyLedger] = await Promise.all([
    prisma.person.findMany({ where: { active: true }, include: { assignments: { where: { billable: true, project: { status: "ACTIVE" } } } } }),
    prisma.project.findMany({ where: { status: { in: ["ACTIVE", "DRAFT", "QUOTED", "NEGOTIATION"] } }, include: { resources: true } }),
    receivables(),
    prisma.person.findMany({ where: { active: true, nextReviewDate: { not: null, lte: addDays(now, 30) } } }),
    prisma.milestone.count({ where: { status: { not: "DONE" }, dueDate: { not: null, lt: now }, project: { status: "ACTIVE" } } }),
    prisma.timeEntry.findMany({ where: { billable: true, date: { gte: monthRange(prevMonth).from, lt: monthRange(lastMonth).to } }, select: { date: true, hours: true } }),
    ledger(fyM[0], thisMonth < fyM[11] ? thisMonth : fyM[11]),
  ]);

  // ---- Cash & obligations ----
  const payrollDue = snap.obligations.filter((o) => o.source === "PAYROLL").reduce((x, o) => x + o.amountInr, 0);
  if (payrollDue > 0 && payrollDue > snap.bankCash) a.push({ level: "critical", title: "Payroll cannot be covered", detail: `${L(payrollDue)} payroll due in the next ${s.horizonDays} days vs ${L(snap.bankCash)} cash.`, href: "/cfo" });
  else if (payrollDue > 0) {
    const delivery = snap.funds.find((f) => f.key === "delivery");
    if (delivery && payrollDue > delivery.balance) a.push({ level: "warning", title: "Delivery fund short for payroll", detail: `Payroll ${L(payrollDue)} vs Delivery fund ${L(delivery.balance)} — a transfer will be needed.`, href: "/funds" });
  }
  if (snap.bankCash < s.minCashInr) a.push({ level: "critical", title: "Cash below minimum operating threshold", detail: `${L(snap.bankCash)} vs minimum ${L(s.minCashInr)}.`, href: "/cfo" });
  if (snap.committed > snap.bankCash) a.push({ level: "critical", title: "Obligations exceed cash", detail: `${L(snap.committed)} due in ${s.horizonDays} days vs ${L(snap.bankCash)} in the bank.`, href: "/commitments" });
  const negMonth = snap.forecast.find((f) => f.closing < 0);
  if (negMonth) a.push({ level: "critical", title: "Cash forecast goes negative", detail: `Projected ${L(negMonth.closing)} at the end of ${monthLabel(negMonth.month)}.`, href: "/cfo" });

  for (const f of snap.funds) {
    if (f.key === "passthrough") {
      if (f.balance < -0.5) a.push({ level: "attention", title: "Pass-through costs awaiting reimbursement", detail: `${L(-f.balance)} paid for clients, not yet recovered on paid invoices.`, href: "/expenses" });
      continue;
    }
    if (f.balance < -0.5) a.push({ level: "critical", title: `${f.name} fund is negative`, detail: `Balance ${L(f.balance)} — spending ran ahead of allocations.`, href: `/funds?fund=${f.key}` });
    else if (f.committed > 0 && f.available < 0) a.push({ level: "critical", title: `${f.name} can't meet its commitments`, detail: `${L(f.committed)} committed vs ${L(f.balance)} balance.`, href: `/funds?fund=${f.key}` });
    else if (f.committed > 0 && f.committed >= f.balance * 0.8) a.push({ level: "warning", title: `${f.name} fund approaching its limit`, detail: `${Math.round((f.committed / f.balance) * 100)}% of the balance is already committed.`, href: `/funds?fund=${f.key}` });
  }

  // ---- Runway ----
  if (snap.survivalRunway == null) {
    if (snap.burn === 0) a.push({ level: "attention", title: "No monthly burn recorded", detail: "Add people and essential commitments to calculate runway.", href: "/commitments" });
  } else if (snap.survivalRunway < s.runwayMinMonths) a.push({ level: "critical", title: "Survival runway below minimum", detail: `${snap.survivalRunway.toFixed(1)} months vs minimum ${s.runwayMinMonths}.`, href: "/cfo" });
  else if (snap.survivalRunway < s.runwayTargetMonths) a.push({ level: "warning", title: "Survival reserve below target", detail: `${snap.survivalRunway.toFixed(1)} months runway — target ${s.runwayTargetMonths}.`, href: "/cfo" });
  else a.push({ level: "healthy", title: "Survival runway target achieved", detail: `${snap.survivalRunway.toFixed(1)} months of unavoidable burn covered.` });

  // ---- Workforce ----
  // Bench = salaried capacity not staffed on billable work (hourly contractors are paid only for hours, so never bench).
  const salaried = people.filter((p) => p.costBasis !== "HOURLY");
  const benchCap = salaried.reduce((x, p) => x + p.stdHoursPerMonth, 0);
  const staffed = salaried.reduce((x, p) => x + Math.min(p.stdHoursPerMonth, p.assignments.reduce((y, as) => y + as.hoursPerMonth, 0)), 0);
  const bench = benchCap ? 1 - staffed / benchCap : 0;
  if (benchCap && bench * 100 > s.benchMaxPct) a.push({ level: "warning", title: "Bench exceeds tolerance", detail: `${Math.round(bench * 100)}% of salaried capacity is not staffed on billable work (limit ${s.benchMaxPct}%).`, href: "/people" });
  const capacity = people.reduce((x, p) => x + p.stdHoursPerMonth, 0);
  const util = (m: string) => (capacity ? entries.filter((e) => ym(e.date) === m).reduce((x, e) => x + e.hours, 0) / capacity : 0);
  const [uLast, uPrev] = [util(lastMonth), util(prevMonth)];
  if (capacity && uPrev > 0 && uLast < uPrev - 0.1) a.push({ level: "attention", title: "Utilisation falling", detail: `${Math.round(uLast * 100)}% in ${monthLabel(lastMonth)} vs ${Math.round(uPrev * 100)}% the month before.`, href: "/people" });
  else if (capacity && uLast >= 0.75) a.push({ level: "healthy", title: "Utilisation strong", detail: `${Math.round(uLast * 100)}% billable in ${monthLabel(lastMonth)}.` });
  for (const p of reviews) a.push({ level: "attention", title: `Salary review due: ${p.name}`, detail: `Review date ${p.nextReviewDate!.toISOString().slice(0, 10)}. Run the Hire Planner with the new cost first.`, href: `/people/${p.id}` });

  // ---- Sales pipeline vs payroll ----
  const runRate = projects.filter((p) => p.status === "ACTIVE").reduce((x, p) => x + plannedMonthly(p, p.resources), 0) * snap.fx;
  const weighted = projects.filter((p) => p.status !== "ACTIVE").reduce((x, p) => x + (plannedMonthly(p, p.resources) * (p.probability ?? 0)) / 100, 0) * snap.fx;
  if (snap.payrollMonthly > 0 && runRate + weighted < snap.payrollMonthly * 1.3) {
    a.push({ level: "warning", title: "Sales pipeline insufficient for payroll", detail: `Run-rate ${L(runRate)} + weighted pipeline ${L(weighted)} per month vs payroll ${L(snap.payrollMonthly)} — needs at least 1.3×.`, href: "/pipeline" });
  }

  // ---- Projects ----
  for (const x of fyLedger.projects) {
    if (x.revenueInr > 0 && x.deliveryRatio != null && x.deliveryRatio > x.deliveryPct / 100) a.push({ level: "warning", title: `${x.code}: people cost over delivery budget`, detail: `${Math.round(x.deliveryRatio * 100)}% of revenue vs ${x.deliveryPct}% delivery share.`, href: `/projects/${x.id}?tab=team` });
    else if (x.revenueInr > 0 && x.marginPct != null && x.marginPct < 0.2) a.push({ level: "attention", title: `${x.code}: project margin low`, detail: `${Math.round(x.marginPct * 100)}% margin this FY.`, href: `/projects/${x.id}?tab=team` });
  }
  const profit = fyLedger.variance.find((v) => v.isProfit);
  if (profit && fyLedger.totals.revenueInr > 0 && profit.actual >= profit.budget) a.push({ level: "healthy", title: "Profit target exceeded", detail: `${L(profit.actual)} net profit vs ${L(profit.budget)} plan this FY.` });

  // ---- Receivables & delivery ----
  const overdue = open.filter((i) => i.aging !== "Not due");
  if (overdue.length) a.push({ level: overdue.some((i) => i.aging === "61–90" || i.aging === "90+") ? "warning" : "attention", title: `${overdue.length} client payment(s) overdue`, detail: `$${Math.round(overdue.reduce((x, i) => x + i.balance, 0)).toLocaleString("en-US")} past due.`, href: "/reports?tab=receivables" });
  if (lateMs) a.push({ level: "attention", title: `${lateMs} milestone(s) late`, detail: "Past due and not done on active projects.", href: "/finance" });
  if (snap.bankCash >= s.minCashInr && snap.availableCash > 0 && !a.some((x) => x.level === "critical")) a.push({ level: "healthy", title: "Cash covers all near-term obligations", detail: `${L(snap.availableCash)} available after ${s.horizonDays}-day commitments.` });

  const rank: Record<Level, number> = { critical: 0, warning: 1, attention: 2, healthy: 3 };
  return a.sort((x, y) => rank[x.level] - rank[y.level]);
}
