import "server-only";
import { prisma } from "@genclover/db";
import { payableForMonth } from "@genclover/incentives";
import { addDays, monthRange, weekStart, ymd } from "./finance";
import { getPaySettings } from "./settings";

// A month's pay: what each person is owed, before it is approved and paid.
//
//   SALARY      monthly salary, pro-rated by the days they were with us that month
//   HOURLY      approved hours × rate, split by project (hours on INCLUDED or FIXED_FEE work orders excluded)
//   RETAINER    the monthly fee, pro-rated; hours shown by project for information
//   FIXED_FEE   each fixed-fee work order: the remaining fee when it ends this month (editable in the draft)
//   INCENTIVE   sales incentives past their hold date (incentiveDraft), for anyone set up in the sales team
//
// Contractors: TDS at their rate (or the default), GST added if they are registered. Employees: salary TDS, PF
// and other deductions are entered in the draft from the payroll provider's figures (confirm with your CA).

export type DraftLine = {
  personId: string;
  kind: string;
  description: string;
  hours: number;
  rate: number;
  gross: number;
  gst: number;
  tds: number;
  otherDeductions: number;
  net: number;
  breakdown: string | null;
  workOrderId: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function draftLines(month: string): Promise<DraftLine[]> {
  const { from, to } = monthRange(month);
  const daysInMonth = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const [pay, people, approvedWeeks] = await Promise.all([
    getPaySettings(),
    prisma.person.findMany({
      where: { OR: [{ startDate: null }, { startDate: { lt: to } }], AND: [{ OR: [{ endDate: null }, { endDate: { gte: from } }] }] },
      include: {
        timeEntries: { where: { date: { gte: from, lt: to } }, select: { projectId: true, date: true, hours: true, project: { select: { code: true } } } },
        workOrders: { select: { id: true, code: true, projectId: true, payTreatment: true, fixedFeeInr: true, feePaidInr: true, endDate: true, status: true, project: { select: { code: true } } } },
      },
    }),
    prisma.timesheetWeek.findMany({ where: { status: "APPROVED", weekStart: { gte: addDays(from, -6), lt: to } }, select: { personId: true, weekStart: true } }),
  ]);
  const approved = new Set(approvedWeeks.map((w) => `${w.personId}:${ymd(w.weekStart)}`));
  const lines: DraftLine[] = [];

  for (const p of people) {
    if (!p.active && !p.endDate) continue;
    const contractor = p.type === "CONTRACTOR";
    const tdsPct = contractor ? (p.tdsRatePct ?? pay.tdsContractorPct) : 0;
    const start = p.startDate && p.startDate > from ? p.startDate : from;
    const end = p.endDate && p.endDate < to ? addDays(p.endDate, 1) : to;
    const share = Math.max(0, Math.min(1, (end.getTime() - start.getTime()) / 86_400_000 / daysInMonth));
    const excluded = new Set(p.workOrders.filter((w) => w.payTreatment !== "HOURLY").map((w) => w.projectId));
    const approvedEntries = p.timeEntries.filter((e) => approved.has(`${p.id}:${ymd(weekStart(e.date))}`));
    const byProject = (entries: typeof approvedEntries) => {
      const m = new Map<string, number>();
      for (const e of entries) m.set(e.project.code, (m.get(e.project.code) ?? 0) + e.hours);
      return [...m.entries()].map(([projectCode, hours]) => ({ projectCode, hours }));
    };
    const push = (kind: string, description: string, gross: number, extra: Partial<DraftLine> = {}) => {
      gross = r2(gross);
      if (gross <= 0) return;
      const gst = contractor && p.gstRegistered ? r2(gross * 0.18) : 0;
      const tds = r2((gross * tdsPct) / 100);
      lines.push({ personId: p.id, kind, description, hours: 0, rate: 0, gross, gst, tds, otherDeductions: 0, net: r2(gross + gst - tds), breakdown: null, workOrderId: null, ...extra });
    };

    if (p.payModel === "SALARY" || p.payModel === "RETAINER") {
      const breakdown = byProject(approvedEntries);
      const note = share < 1 ? ` (${Math.round(share * daysInMonth)} of ${daysInMonth} days)` : "";
      push(p.payModel, `${p.payModel === "SALARY" ? "Salary" : "Retainer"} ${month}${note}`, p.costInr * share, {
        hours: breakdown.reduce((s, b) => s + b.hours, 0),
        breakdown: breakdown.length ? JSON.stringify(breakdown) : null,
      });
    } else if (p.payModel === "HOURLY") {
      const paidEntries = approvedEntries.filter((e) => !excluded.has(e.projectId));
      const hours = paidEntries.reduce((s, e) => s + e.hours, 0);
      const breakdown = byProject(paidEntries).map((b) => ({ ...b, amount: r2(b.hours * p.costInr) }));
      push("HOURLY", `${month}: ${hours} approved hrs × ₹${p.costInr}`, hours * p.costInr, { hours, rate: p.costInr, breakdown: breakdown.length ? JSON.stringify(breakdown) : null });
    }
    // Fixed-fee work orders: the remaining fee when the work order ends (or closed) this month.
    for (const w of p.workOrders.filter((x) => x.payTreatment === "FIXED_FEE" && x.fixedFeeInr)) {
      const remaining = (w.fixedFeeInr ?? 0) - w.feePaidInr;
      const due = w.status === "CLOSED" || (w.endDate && w.endDate < to);
      if (remaining > 0 && due) {
        push("FIXED_FEE", `${w.code} fixed fee (${w.project.code})${w.feePaidInr ? `, balance after ₹${w.feePaidInr} paid` : ""}`, remaining, { workOrderId: w.id });
      }
    }
  }
  return lines;
}

/**
 * Sales incentives ready by the end of the month (past their hold date), one line per person, whatever their pay
 * model: incentive-only sellers and salaried sellers alike. Returns the incentive lines it covers, so the pay run
 * can claim them (they then show as "in this month's pay run" in the seller's wallet).
 */
export async function incentiveDraft(month: string): Promise<{ lines: DraftLine[]; entryIds: string[] }> {
  const { to } = monthRange(month);
  const [pay, ready] = await Promise.all([getPaySettings(), payableForMonth(to)]);
  if (!ready.length) return { lines: [], entryIds: [] };
  const people = await prisma.person.findMany({ where: { id: { in: ready.map((r) => r.personId) } }, select: { id: true, type: true, tdsRatePct: true, gstRegistered: true } });
  const lines: DraftLine[] = [];
  for (const r of ready) {
    const p = people.find((x) => x.id === r.personId);
    if (!p) continue;
    const contractor = p.type === "CONTRACTOR";
    const gross = r2(r.total);
    const gst = contractor && p.gstRegistered ? r2(gross * 0.18) : 0;
    const tds = contractor ? r2((gross * (p.tdsRatePct ?? pay.tdsContractorPct)) / 100) : 0;
    lines.push({ personId: p.id, kind: "INCENTIVE", description: `Sales incentives ${month}: ${r.codes.join(", ")}`, hours: 0, rate: 0, gross, gst, tds, otherDeductions: 0, net: r2(gross + gst - tds), breakdown: null, workOrderId: null });
  }
  return { lines, entryIds: ready.filter((r) => people.some((p) => p.id === r.personId)).flatMap((r) => r.entryIds) };
}

export const netOf = (l:{ gross: number; gst: number; tds: number; otherDeductions: number }) => r2(l.gross + l.gst - l.tds - l.otherDeductions);
