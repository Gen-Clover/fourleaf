// Pure formula engine — mirrors Section 5 "Calculator formulas" of the rate card md.
// Safe to import from both server and client components.

export type Params = {
  fxRate: number;
  billableHoursPerYear: number;
  usHoursPerYear: number;
  usLoadFactor: number;
  coverageTarget: number;
  floorThreshold: number;
  floorDeltaLow: number;
  floorDeltaHigh: number;
  premiumPctMin: number;
  premiumPctMax: number;
  rateRounding: number;
  blendedRate: number;
  retainerHours: number;
  retainerAmount: number;
  additionalHourRate: number;
};

export type Bucket = { key: string; name: string; percent: number; category: string; isProfit: boolean };

export type RoleLike = {
  standardRate: number;
  floorRate: number | null;
  marketMin: number;
  marketMax: number;
  usSalary: number;
  ctcMinL: number | null;
  ctcMaxL: number | null;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const roundTo = (n: number, step: number) => (step > 0 ? Math.round(n / step) * step : n);

/** Negotiation Floor = Standard − low delta (below threshold) | − high delta (at/above threshold), unless overridden. */
export function floorRate(role: Pick<RoleLike, "standardRate" | "floorRate">, p: Params) {
  if (role.floorRate != null) return role.floorRate;
  return role.standardRate - (role.standardRate >= p.floorThreshold ? p.floorDeltaHigh : p.floorDeltaLow);
}

/** Premium = Standard × (1 + uplift), rounded to the rate rounding step. */
export function premiumRates(standard: number, p: Params) {
  return {
    min: roundTo(standard * (1 + p.premiumPctMin / 100), p.rateRounding),
    max: roundTo(standard * (1 + p.premiumPctMax / 100), p.rateRounding),
  };
}

/** US Loaded $/hr = (US Avg Salary ÷ US hours) × load factor */
export const usLoadedRate = (usSalary: number, p: Params) => (usSalary / p.usHoursPerYear) * p.usLoadFactor;

/** Client Savings % = 1 − (GC Rate ÷ US Loaded Rate) */
export const savingsPct = (rate: number, usLoaded: number) => (usLoaded > 0 ? 1 - rate / usLoaded : 0);

export const deliveryPercent = (buckets: Bucket[]) =>
  buckets.filter((b) => b.category === "DELIVERY").reduce((s, b) => s + b.percent, 0);

/** Delivery Pool ₹ lakh / yr = Rate × Delivery% × billable hrs × FX ÷ 100,000 */
export const deliveryPoolLakh = (rate: number, deliveryPct: number, p: Params) =>
  (rate * (deliveryPct / 100) * p.billableHoursPerYear * p.fxRate) / 100000;

/** Cost Coverage = Delivery Pool ÷ India CTC midpoint */
export function coverage(pool: number, ctcMinL: number | null, ctcMaxL: number | null) {
  if (ctcMinL == null || ctcMaxL == null) return null;
  const mid = (ctcMinL + ctcMaxL) / 2;
  return mid > 0 ? pool / mid : null;
}

/** Market position of a rate inside the India market range (0 = min, 1 = max). */
export const marketPosition = (rate: number, min: number, max: number) => (max > min ? (rate - min) / (max - min) : 0);

export function roleMetrics(role: RoleLike, p: Params, buckets: Bucket[]) {
  const dPct = deliveryPercent(buckets);
  const floor = floorRate(role, p);
  const premium = premiumRates(role.standardRate, p);
  const usLoaded = usLoadedRate(role.usSalary, p);
  const pool = deliveryPoolLakh(role.standardRate, dPct, p);
  const cov = coverage(pool, role.ctcMinL, role.ctcMaxL);
  const floorPool = deliveryPoolLakh(floor, dPct, p);
  const floorCov = coverage(floorPool, role.ctcMinL, role.ctcMaxL);
  return {
    floor,
    premium,
    usLoaded,
    savings: savingsPct(role.standardRate, usLoaded),
    pool,
    coverage: cov,
    floorCoverage: floorCov,
    position: marketPosition(role.standardRate, role.marketMin, role.marketMax),
    status: cov == null ? "n/a" : cov >= p.coverageTarget ? "Healthy" : cov >= 1 ? "Tight" : "Under cost",
  };
}

export type SplitLine = Bucket & { amount: number };

/** Split any revenue amount across allocation buckets. */
export function split(amount: number, buckets: Bucket[]) {
  const lines: SplitLine[] = buckets.map((b) => ({ ...b, amount: (amount * b.percent) / 100 }));
  const byCategory = { DELIVERY: 0, GROWTH: 0, CORPORATE: 0 } as Record<string, number>;
  let profit = 0;
  for (const l of lines) {
    byCategory[l.category] = (byCategory[l.category] ?? 0) + l.amount;
    if (l.isProfit) profit += l.amount;
  }
  return { lines, delivery: byCategory.DELIVERY, growth: byCategory.GROWTH, corporate: byCategory.CORPORATE, profit };
}

export const bucketTotal = (buckets: Bucket[]) => buckets.reduce((s, b) => s + b.percent, 0);

// ---------- Projects ----------

export type ResourceLine = {
  label: string;
  headcount: number;
  hoursPerMonth: number;
  quotedRate: number;
  agreedRate: number | null;
  standardRate: number;
  floorRate: number;
};

export const lineHours = (r: Pick<ResourceLine, "headcount" | "hoursPerMonth">) => r.headcount * r.hoursPerMonth;
export const effectiveRate = (r: Pick<ResourceLine, "quotedRate" | "agreedRate">) => r.agreedRate ?? r.quotedRate;

export function quoteSummary(lines: ResourceLine[]) {
  let hours = 0,
    standard = 0,
    floor = 0,
    quoted = 0,
    agreed = 0;
  const belowFloor: string[] = [];
  for (const r of lines) {
    const h = lineHours(r);
    hours += h;
    standard += h * r.standardRate;
    floor += h * r.floorRate;
    quoted += h * r.quotedRate;
    agreed += h * effectiveRate(r);
    if (effectiveRate(r) < r.floorRate || r.quotedRate < r.floorRate) belowFloor.push(r.label);
  }
  return {
    hours,
    standard,
    floor,
    quoted,
    agreed,
    blendedQuoted: hours ? quoted / hours : 0,
    blendedAgreed: hours ? agreed / hours : 0,
    discountVsStandard: standard ? 1 - agreed / standard : 0,
    belowFloor,
  };
}

export type Agreement = {
  engagementModel: string;
  agreedMonthly: number | null;
  agreedBlendedRate: number | null;
  agreedRetainerHrs: number | null;
  agreedExtraRate: number | null;
};

export const MODELS: Record<string, string> = {
  TM: "Time & Materials (per-role rates)",
  RETAINER: "Monthly Retainer",
  BLENDED: "Blended Rate",
  FIXED: "Fixed Monthly Fee",
  FIXED_PRICE: "Fixed Price (billed by milestones)",
};

/** Monthly revenue for a set of worked hours under the agreed engagement model. */
export function monthlyRevenue(a: Agreement, lines: { hours: number; rate: number }[], adjustment = 0) {
  const hours = lines.reduce((s, l) => s + l.hours, 0);
  const tm = lines.reduce((s, l) => s + l.hours * l.rate, 0);
  let base = tm;
  let extraHours = 0;
  switch (a.engagementModel) {
    case "BLENDED":
      base = hours * (a.agreedBlendedRate ?? 0);
      break;
    case "RETAINER":
      extraHours = Math.max(0, hours - (a.agreedRetainerHrs ?? 0));
      base = (a.agreedMonthly ?? 0) + extraHours * (a.agreedExtraRate ?? 0);
      break;
    case "FIXED":
      base = a.agreedMonthly ?? 0;
      break;
  }
  return { hours, tmValue: tm, extraHours, base, revenue: base + adjustment };
}

/** Expected monthly revenue from the plan (resources at planned hours). */
export function plannedMonthly(a: Agreement, resources: ResourceLine[]) {
  return monthlyRevenue(
    a,
    resources.map((r) => ({ hours: lineHours(r), rate: effectiveRate(r) })),
  ).revenue;
}
