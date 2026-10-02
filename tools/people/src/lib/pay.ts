// How people are paid, and what an hour of their time costs a project. Safe for server and client.
//
//   SALARY     employee, fixed monthly salary (costInr = monthly CTC)
//   HOURLY     approved hours × rate (costInr = ₹ per hour), across any number of projects
//   RETAINER   fixed monthly fee for reserved capacity, across projects (costInr = monthly fee)
//   FIXED_FEE  paid per work order (the fee on each work order), across projects

export const PAY_MODELS: Record<string, { label: string; costLabel: string; basis: "MONTHLY" | "HOURLY"; hint: string }> = {
  SALARY: { label: "Salary (employee)", costLabel: "Monthly salary / CTC ₹", basis: "MONTHLY", hint: "Paid the same every month; hours only measure project cost" },
  HOURLY: { label: "Hourly", costLabel: "Rate ₹ per hour", basis: "HOURLY", hint: "Paid for approved hours on any project" },
  RETAINER: { label: "Monthly retainer (contractor)", costLabel: "Monthly fee ₹", basis: "MONTHLY", hint: "Fixed monthly fee, deployed on any project within the agreed capacity" },
  FIXED_FEE: { label: "Fixed fee per work order", costLabel: "—", basis: "MONTHLY", hint: "Paid the fee set on each work order" },
};

export const PERSON_TYPES: Record<string, string> = { EMPLOYEE: "Employee", CONTRACTOR: "Contractor" };

export const DOC_TYPES: Record<string, { label: string; for: "EMPLOYEE" | "CONTRACTOR" | "BOTH" }> = {
  OFFER_LETTER: { label: "Offer letter", for: "EMPLOYEE" },
  EMPLOYMENT_AGREEMENT: { label: "Employment agreement", for: "EMPLOYEE" },
  MCA: { label: "Master contractor agreement", for: "CONTRACTOR" },
  RATE_SCHEDULE: { label: "Rate schedule / compensation annexure", for: "CONTRACTOR" },
  NDA: { label: "NDA / confidentiality", for: "BOTH" },
  IP_ASSIGNMENT: { label: "IP assignment", for: "BOTH" },
  ID_PROOF: { label: "ID proof", for: "BOTH" },
  TAX_FORM: { label: "PAN / tax declaration", for: "BOTH" },
  OTHER: { label: "Other", for: "BOTH" },
};

export const DOC_STATUSES = ["DRAFT", "SENT", "SIGNED", "EXPIRED"] as const;

export const WORK_ORDER_PAY: Record<string, string> = {
  HOURLY: "Paid for approved hours (their hourly rate)",
  INCLUDED: "Included in their retainer / salary (no extra pay)",
  FIXED_FEE: "Fixed fee for this work order",
};

export const ONBOARDING_ITEMS: Record<"EMPLOYEE" | "CONTRACTOR", { key: string; label: string }[]> = {
  EMPLOYEE: [
    { key: "offer", label: "Offer letter signed" },
    { key: "agreement", label: "Employment agreement, NDA and IP assignment signed" },
    { key: "kyc", label: "PAN, ID and bank details collected" },
    { key: "payroll", label: "Added to payroll (PF / ESI / PT as applicable)" },
    { key: "email", label: "Company email and calendar" },
    { key: "tools", label: "Jira, GitHub, Slack / WhatsApp group access" },
    { key: "equipment", label: "Laptop / equipment issued" },
    { key: "induction", label: "Induction: policies, security, how we work" },
    { key: "manager", label: "Manager, goals and first project assigned" },
  ],
  CONTRACTOR: [
    { key: "mca", label: "Master contractor agreement signed" },
    { key: "rates", label: "Rate schedule agreed and signed" },
    { key: "nda", label: "NDA and IP assignment signed" },
    { key: "kyc", label: "PAN, GSTIN (if registered) and bank details collected" },
    { key: "tools", label: "Access to the project tools only (Jira, GitHub, chat)" },
    { key: "workorder", label: "First work order issued" },
  ],
};

export const OFFBOARDING_ITEMS: { key: string; label: string }[] = [
  { key: "notice", label: "Notice / end date confirmed in writing" },
  { key: "handover", label: "Work handed over (code, documents, credentials in the vault)" },
  { key: "access", label: "All access revoked (email, Jira, GitHub, cloud, chat)" },
  { key: "equipment", label: "Equipment returned" },
  { key: "settlement", label: "Final settlement / last invoice paid" },
  { key: "exit", label: "Exit conversation and records closed" },
];

export const parseList = (s: string | null | undefined): Record<string, boolean> => {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
};

type Costed = { payModel: string; costInr: number; stdHoursPerMonth: number };

/** costBasis stored on the person, derived from the pay model (the finance tool reads costBasis). */
export const costBasisOf = (payModel: string) => PAY_MODELS[payModel]?.basis ?? "MONTHLY";

/**
 * ₹ per hour charged to a project for this person's time. Salary and retainer are spread over standard hours;
 * hourly is the rate; a fixed-fee work order spreads its fee over its expected hours.
 */
export function hourlyCost(p: Costed, workOrder?: { payTreatment: string; fixedFeeInr: number | null; expectedHoursPerMonth: number; startDate: Date | null; endDate: Date | null } | null) {
  if (workOrder?.payTreatment === "FIXED_FEE" && workOrder.fixedFeeInr) {
    const months = workOrder.startDate && workOrder.endDate ? Math.max(1, Math.round((workOrder.endDate.getTime() - workOrder.startDate.getTime()) / (30.4 * 86_400_000))) : 1;
    const hours = Math.max(1, workOrder.expectedHoursPerMonth * months);
    return Math.round((workOrder.fixedFeeInr / hours) * 100) / 100;
  }
  if (p.payModel === "HOURLY") return p.costInr;
  if (p.payModel === "FIXED_FEE") return 0;
  return p.stdHoursPerMonth > 0 ? Math.round((p.costInr / p.stdHoursPerMonth) * 100) / 100 : 0;
}

/** TDS on contractor payments (default from settings, e.g. 10% under section 194J). Employees: from payroll. */
export const tdsFor = (gross: number, ratePct: number) => Math.round((gross * ratePct) / 100);
