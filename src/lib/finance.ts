// Pure finance helpers — books in ₹, client billing in US$. Safe for server and client.
// Dates are handled as UTC calendar days ("YYYY-MM-DD"), matching how <input type="date"> values are stored.

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const ym = (d: Date) => d.toISOString().slice(0, 7);
export const utcDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

/** Monday of the week containing d (UTC). */
export function weekStart(d: Date) {
  const day = d.getUTCDay(); // 0 = Sun
  return addDays(utcDay(ymd(d)), day === 0 ? -6 : 1 - day);
}

/** First day of a YYYY-MM month and first day of the following month (exclusive end). */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/** Every YYYY-MM from `from` to `to` inclusive. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ---------- Indian financial year (April → March) ----------

export const fyStartYear = (d: Date) => (d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
/** "26-27" for FY 2026-27 — used in invoice numbers (GST: unique, consecutive per FY, ≤ 16 chars). */
export const fyShort = (start: number) => `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
export const fyLabel = (start: number) => `FY ${start}-${String(start + 1).slice(2)}`;
export const fyMonths = (start: number) => monthsBetween(`${start}-04`, `${start + 1}-03`);

// ---------- People cost ----------

export type CostLike = { costBasis: string; costInr: number; stdHoursPerMonth: number };

/** ₹ per hour: hourly contractors as entered; monthly cost spread over standard hours. */
export const hourlyCostInr = (p: CostLike) =>
  p.costBasis === "HOURLY" ? p.costInr : p.stdHoursPerMonth > 0 ? p.costInr / p.stdHoursPerMonth : 0;

/** ₹ per month at standard hours. */
export const monthlyCostInr = (p: CostLike) => (p.costBasis === "HOURLY" ? p.costInr * p.stdHoursPerMonth : p.costInr);

// ---------- Invoices & payments ----------

export type LineLike = { quantity: number; unitPrice: number };
export type PaymentLike = { amountUsd: number; inrReceived: number; bankChargesInr: number };

export const lineAmount = (l: LineLike) => Math.round(l.quantity * l.unitPrice * 100) / 100;
export const invoiceTotal = (lines: LineLike[]) => Math.round(lines.reduce((s, l) => s + lineAmount(l), 0) * 100) / 100;
export const paidUsd = (payments: PaymentLike[]) => payments.reduce((s, p) => s + p.amountUsd, 0);

/** Status after payments: VOID and DRAFT are manual; otherwise SENT → PARTIAL → PAID by amount settled. */
export function derivedInvoiceStatus(current: string, total: number, paid: number) {
  if (current === "VOID") return "VOID";
  if (paid > 0 && paid >= total - 0.005) return "PAID";
  if (paid > 0) return "PARTIAL";
  return current === "DRAFT" ? "DRAFT" : "SENT";
}

/** Monthly record status mirrors its invoice. */
export const monthStatusFor = (invoiceStatus: string | null | undefined) =>
  !invoiceStatus || invoiceStatus === "VOID" || invoiceStatus === "DRAFT" ? "DRAFT" : invoiceStatus === "PAID" ? "PAID" : "INVOICED";

/** Realised FX on a receipt: what landed (+ charges the bank kept) vs what was booked at the invoice rate. */
export function paymentFx(p: PaymentLike, invoiceFx: number) {
  const bookedInr = p.amountUsd * invoiceFx;
  const grossInr = p.inrReceived + p.bankChargesInr;
  return { bookedInr, grossInr, fxGainInr: grossInr - bookedInr, effectiveRate: p.amountUsd > 0 ? grossInr / p.amountUsd : 0 };
}

export const AGING = ["Not due", "1–30", "31–60", "61–90", "90+"] as const;

/** Receivables aging bucket by days past due. */
export function agingBucket(dueDate: Date, today = new Date()): (typeof AGING)[number] {
  const days = Math.floor((utcDay(ymd(today)).getTime() - utcDay(ymd(dueDate)).getTime()) / 864e5);
  if (days <= 0) return "Not due";
  if (days <= 30) return "1–30";
  if (days <= 60) return "31–60";
  if (days <= 90) return "61–90";
  return "90+";
}

// ---------- P&L ----------

export type BucketBudget = { key: string; name: string; percent: number; category: string; isProfit: boolean };

/**
 * Budget vs actual per allocation bucket for a period.
 * Budget = Σ revenue × bucket % (each project's own snapshot). Actual = spend booked to the bucket;
 * the profit bucket's actual is net profit. Variance > 0 is always good (under budget / above profit plan).
 */
export function bucketVariance(revenueInr: number, buckets: BucketBudget[], budget: Record<string, number>, spend: Record<string, number>, netProfit: number) {
  return buckets.map((b) => {
    const planned = budget[b.key] ?? (revenueInr * b.percent) / 100;
    const actual = b.isProfit ? netProfit : (spend[b.key] ?? 0);
    return { ...b, budget: planned, actual, variance: b.isProfit ? actual - planned : planned - actual, actualPct: revenueInr ? actual / revenueInr : 0 };
  });
}

export const csvCell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? ymd(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

// ---------- Treasury: allocation engine, commitments, hire planning ----------

export type FundDef = { key: string; name: string; percent: number };

/** Split cash across funds by policy %. Rounded to the rupee; the largest fund absorbs rounding so lines sum exactly. */
export function allocateCash(amount: number, funds: FundDef[]) {
  const lines = funds.filter((f) => f.percent > 0).map((f) => ({ key: f.key, amount: Math.round((amount * f.percent) / 100) }));
  const diff = Math.round(amount) - lines.reduce((s, l) => s + l.amount, 0);
  if (lines.length && diff) lines.reduce((a, b) => (b.amount > a.amount ? b : a)).amount += diff;
  return lines;
}

export type CommitmentLike = { amountInr: number; frequency: string; nextDueDate: Date; endDate: Date | null };
const STEP: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

const addMonths = (d: Date, n: number) => {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), last));
  return r;
};

/** Due dates of a commitment inside [from, to). Past-due one-offs count as due now. */
export function occurrences(c: CommitmentLike, from: Date, to: Date) {
  const out: Date[] = [];
  if (c.frequency === "ONE_OFF" || !STEP[c.frequency]) {
    if (c.nextDueDate < to) out.push(c.nextDueDate < from ? from : c.nextDueDate);
    return out;
  }
  for (let d = c.nextDueDate, i = 0; d < to && i < 600; d = addMonths(c.nextDueDate, STEP[c.frequency] * ++i)) {
    if (c.endDate && d > c.endDate) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Average monthly cost of a commitment (for burn / runway). One-offs don't count. */
export const monthlyEquivalent = (c: { amountInr: number; frequency: string }) => (STEP[c.frequency] ? c.amountInr / STEP[c.frequency] : 0);

export type HireInput = {
  billRateUsd: number; // client rate $/hr
  billableHours: number; // per month
  contractMonths: number;
  costType: "EMPLOYEE" | "CONTRACTOR";
  monthlyCostInr: number; // loaded monthly cost (or hourly × hours for contractors)
  benchMonths: number; // months the person is kept, unbilled, after the contract
  onboardingInr: number; // one-off: hiring fee, laptop, etc.
  paymentLagMonths: number; // months of cost carried before first cash arrives
  fxRate: number;
  coverageTarget: number;
  funds: (FundDef & { isProfit?: boolean })[];
  deliveryKey: string;
  // company position
  survivalFundInr: number;
  monthlyBurnInr: number;
  availableCashInr: number;
  runwayMinMonths: number;
};

/** "Can we afford to onboard this resource?" — contract economics, fund split, bench, cash and runway impact. */
export function simulateHire(i: HireInput) {
  const monthlyRevenueInr = i.billRateUsd * i.billableHours * i.fxRate;
  const contractRevenueInr = monthlyRevenueInr * i.contractMonths;
  const byFund = i.funds.map((f) => ({ ...f, amount: (contractRevenueInr * f.percent) / 100 }));
  const deliveryAlloc = byFund.find((f) => f.key === i.deliveryKey)?.amount ?? 0;
  const profitAlloc = byFund.filter((f) => f.isProfit).reduce((s, f) => s + f.amount, 0);
  const directCost = i.monthlyCostInr * i.contractMonths;
  const benchCost = i.costType === "EMPLOYEE" ? i.monthlyCostInr * i.benchMonths : 0;
  const deliverySurplus = deliveryAlloc - directCost - benchCost - i.onboardingInr;
  const coverage = directCost > 0 ? deliveryAlloc / directCost : null;
  const expectedProfit = profitAlloc + deliverySurplus;
  const workingCapitalNeed = i.monthlyCostInr * i.paymentLagMonths + i.onboardingInr;
  const burnAfter = i.monthlyBurnInr + (i.costType === "EMPLOYEE" ? i.monthlyCostInr : 0);
  const runwayBefore = i.monthlyBurnInr > 0 ? i.survivalFundInr / i.monthlyBurnInr : null;
  const runwayAfter = burnAfter > 0 ? i.survivalFundInr / burnAfter : null;

  const reasons: { level: "red" | "amber" | "green"; text: string }[] = [];
  if (coverage != null && coverage < 1) reasons.push({ level: "red", text: `Delivery allocation covers only ${(coverage * 100).toFixed(0)}% of the resource cost.` });
  else if (coverage != null && coverage < i.coverageTarget) reasons.push({ level: "amber", text: `Delivery coverage ${coverage.toFixed(2)}× is below the ${i.coverageTarget}× target.` });
  else if (coverage != null) reasons.push({ level: "green", text: `Delivery coverage ${coverage.toFixed(2)}× meets the ${i.coverageTarget}× target.` });
  if (expectedProfit < 0) reasons.push({ level: "red", text: "Expected profit on this contract is negative." });
  if (workingCapitalNeed > i.availableCashInr) reasons.push({ level: "red", text: "Cash needed before the first payment exceeds available cash." });
  else if (workingCapitalNeed > i.availableCashInr * 0.5) reasons.push({ level: "amber", text: "Cash needed before the first payment uses over half of available cash." });
  if (runwayAfter != null && runwayAfter < i.runwayMinMonths) reasons.push({ level: "amber", text: `Survival runway would drop to ${runwayAfter.toFixed(1)} months (minimum ${i.runwayMinMonths}).` });
  if (benchCost > 0) reasons.push({ level: benchCost > deliverySurplus + benchCost ? "amber" : "green", text: `Bench after contract costs about ₹${Math.round(benchCost).toLocaleString("en-IN")}.` });
  const verdict = reasons.some((r) => r.level === "red") ? "red" : reasons.some((r) => r.level === "amber") ? "amber" : "green";

  return { monthlyRevenueInr, contractRevenueInr, byFund, deliveryAlloc, profitAlloc, directCost, benchCost, deliverySurplus, coverage, expectedProfit, workingCapitalNeed, burnAfter, runwayBefore, runwayAfter, reasons, verdict };
}
