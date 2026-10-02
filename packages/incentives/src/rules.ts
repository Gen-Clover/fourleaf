// The incentive rules as plain functions, so pages, forms and the server agree. Safe to import in the browser.
//
//   10% of the qualifying service: 8% seller + 2% their manager (the rates are kept on each deal as agreed).
//   Qualifying service: the first service a NEW client buys. Several at once: the highest-value one.
//   Monthly (recurring) service: the first month's fee only. Later services, renewals, upsells: nothing.
//   Base: excluding GST and pass-through costs (domain, hosting, third-party APIs billed at cost).
//   Earned only as the client pays, in proportion to each receipt; held for the hold period, then paid in the
//   next pay run. A seller with no manager: the manager's 2% isn't paid (a manager who closes a deal
//   themselves gets the seller's 8%, not 8% + 2%).

export const STATUS = {
  DRAFT: { label: "Recorded at Won", hint: "Waiting for the onboarding decision" },
  PENDING_APPROVAL: { label: "Waiting for approval", hint: "Onboarding proposed it; an owner or the CFO approves" },
  APPROVED: { label: "Approved", hint: "Earned as the client pays" },
  NOT_ELIGIBLE: { label: "No incentive", hint: "Decided at onboarding" },
  CANCELLED: { label: "Cancelled", hint: "Deal cancelled; anything not paid is reversed" },
} as const;
export type Status = keyof typeof STATUS;
export const statusLabel = (s: string) => STATUS[s as Status]?.label ?? s;

export const STAGE_LABEL: Record<string, string> = { WON: "Lead Finder (Won)", ONBOARDING: "Onboarding", APPROVAL: "Approval", OWNER: "Owner correction", FINANCE: "Finance", SYSTEM: "System" };

export type ServiceLine = { key: string; label: string; kind: "ONE_TIME" | "MONTHLY"; value: number | null };

export function parseServices(json: string | null | undefined): ServiceLine[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.key === "string") : [];
  } catch {
    return [];
  }
}

/** The highest-value service (a monthly service counts at its first month's fee). Null when no values yet. */
export function highestValue(lines: ServiceLine[]) {
  return lines.filter((l) => l.value != null && l.value > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] ?? null;
}

/** The qualifying service: the one picked, or the highest-value one. */
export function qualifying(lines: ServiceLine[], pickedKey: string | null | undefined, auto: boolean) {
  if (!auto && pickedKey) return lines.find((l) => l.key === pickedKey) ?? highestValue(lines);
  return highestValue(lines);
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** What each person gets on a base (seller, manager), with the manager's share only when there is a separate manager. */
export function split(base: number, deal: { sellerRatePct: number; managerRatePct: number; sellerUserId: string | null; managerUserId: string | null }) {
  const manager = deal.managerUserId && deal.managerUserId !== deal.sellerUserId;
  return { seller: r2((base * deal.sellerRatePct) / 100), manager: manager ? r2((base * deal.managerRatePct) / 100) : 0 };
}

/** Where one money line sits in a person's wallet. Paid lines leave the wallet. */
export type WalletBucket = "HOLDING" | "READY" | "IN_PAY_RUN" | "PAID";
export function bucketOf(e: { availableOn: Date; payRunId: string | null; paidOn: Date | null }, now = new Date()): WalletBucket {
  if (e.paidOn) return "PAID";
  if (e.payRunId) return "IN_PAY_RUN";
  return e.availableOn <= now ? "READY" : "HOLDING";
}
export const BUCKET_LABEL: Record<WalletBucket, string> = {
  HOLDING: "Holding (refund period)",
  READY: "Ready: next salary",
  IN_PAY_RUN: "In this month's pay run",
  PAID: "Paid",
};

/** Things the owner should look at, by code. */
export const FLAGS: Record<string, { label: string; level: "high" | "medium" | "low" }> = {
  NO_DECISION: { label: "Won but no incentive decision yet", level: "high" },
  PENDING: { label: "Waiting for approval", level: "medium" },
  SELLER_CHANGED: { label: "Credited seller differs from the lead owner at Won", level: "high" },
  LATE_REASSIGN: { label: "Lead was reassigned shortly before Won", level: "high" },
  VALUE_CHANGED: { label: "Approved base differs from the value at Won by more than 10%", level: "medium" },
  NOT_NEW: { label: "Business matches an existing client", level: "high" },
  SELF_DECIDED: { label: "Decided by the seller or their manager", level: "high" },
  NO_INCENTIVE_ON_PLAN: { label: "No incentive, but the seller is on an incentive plan", level: "medium" },
  NO_PERSON: { label: "Payee has no People record, so pay runs can't pay them", level: "medium" },
  UNLINKED_RECEIPTS: { label: "Client has paid invoices not counted towards this incentive", level: "medium" },
  CHANGED_AFTER_APPROVAL: { label: "Changed after approval", level: "medium" },
  NO_RECORD: { label: "Won deal with no incentive record", level: "high" },
};
