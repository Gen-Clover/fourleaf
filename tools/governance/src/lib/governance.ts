// Compliance calendar, issues and decisions: definitions and date rules. Safe for server and client.

export const COMPLIANCE_CATEGORIES: Record<string, string> = {
  GST: "GST",
  TDS: "TDS",
  INCOME_TAX: "Income tax",
  MCA: "MCA / ROC",
  PAYROLL: "Payroll (PF, ESI, PT)",
  BOARD: "Board & governance",
  CONTRACT: "Contracts & renewals",
  INSURANCE: "Insurance",
  OTHER: "Other",
};

export const FREQUENCIES: Record<string, { label: string; months: number }> = {
  MONTHLY: { label: "Monthly", months: 1 },
  QUARTERLY: { label: "Quarterly", months: 3 },
  HALF_YEARLY: { label: "Half-yearly", months: 6 },
  YEARLY: { label: "Yearly", months: 12 },
  ONE_OFF: { label: "One-off", months: 0 },
};

/** The next due date after this one (same day of month, clamped to the month's end). */
export function nextDue(due: Date, frequency: string) {
  const step = FREQUENCIES[frequency]?.months ?? 0;
  if (!step) return null;
  const y = due.getUTCFullYear();
  const m = due.getUTCMonth() + step;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(due.getUTCDate(), last)));
}

/** OVERDUE (past due), DUE (within its reminder window), UPCOMING. */
export function complianceStatus(item: { dueDate: Date; remindDays: number; active: boolean }, now = new Date()) {
  if (!item.active) return "CLOSED";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((item.dueDate.getTime() - today) / 86_400_000);
  return days < 0 ? "OVERDUE" : days <= item.remindDays ? "DUE" : "UPCOMING";
}

/** A period label for a filing: the month / quarter / FY the due date belongs to. */
export function periodFor(due: Date, frequency: string) {
  const d = new Date(due.getTime() - 15 * 86_400_000); // most returns are due in the following month
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const fy = m >= 3 ? y : y - 1;
  if (frequency === "MONTHLY") return d.toISOString().slice(0, 7);
  if (frequency === "QUARTERLY") return `Q${Math.floor(((m + 9) % 12) / 3) + 1} FY${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
  if (frequency === "YEARLY") return `FY ${fy}-${String(fy + 1).slice(2)}`;
  return due.toISOString().slice(0, 10);
}

export const ISSUE_CATEGORIES: Record<string, { label: string; owner: string }> = {
  RESOURCE: { label: "Resource conflict", owner: "Resource manager: capacity and priorities" },
  SCOPE_CLIENT: { label: "Scope / client", owner: "Delivery manager + account owner: SOW and client impact" },
  TECHNICAL: { label: "Technical / quality", owner: "Technical lead: evidence and options" },
  FINANCIAL: { label: "Financial / payment", owner: "Finance: budget, contract and records" },
  PEOPLE: { label: "People / conduct", owner: "HR / authorised management (confidential)" },
  OTHER: { label: "Other", owner: "Owner decides who handles it" },
};

export const LEVELS: Record<number, { label: string; who: string }> = {
  1: { label: "Level 1 — operational", who: "Task owner, team lead or delivery manager" },
  2: { label: "Level 2 — functional", who: "Resource, technical, finance, people or account lead" },
  3: { label: "Level 3 — CEO", who: "Material commercial risk, client escalation, major trade-off" },
  4: { label: "Level 4 — board / adviser", who: "Directors, ownership, legal exposure, compliance" },
};

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const ISSUE_STATUSES = ["OPEN", "IN_REVIEW", "ESCALATED", "DECIDED", "CLOSED"] as const;
export const DECISION_TYPES: Record<string, string> = { BOARD: "Board resolution", CEO: "CEO decision", MANAGEMENT: "Management decision" };
