export const usd = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const usd0 = (n: number | null | undefined) => usd(n, 0);

/** Indian grouping: ₹12,34,567 */
export const inr = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: digits, maximumFractionDigits: digits });

/** ₹ in lakh: ₹12.35 L */
export const inrL = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "—" : `₹${(n / 1e5).toFixed(2)} L`);

export const pct = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(digits)}%`;

export const num = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const date = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

export const toInputDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  NEGOTIATION: "Negotiation",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  INVOICED: "Invoiced",
  PAID: "Paid",
  SENT: "Sent",
  PARTIAL: "Part paid",
  VOID: "Void",
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  BLOCKED: "Blocked",
  EMPLOYEE: "Employee",
  CONTRACTOR: "Contractor",
  UNPAID: "Unpaid",
  SIGNED: "Signed",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
  SUPERSEDED: "Superseded",
  ONBOARDING: "Onboarding",
  INACTIVE: "Inactive",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PENDING: "Pending",
  OPEN: "Open",
  FILLED: "Filled",
  ISSUED: "Issued",
  CLOSED: "Closed",
  IN_REVIEW: "In review",
  ESCALATED: "Escalated",
  DECIDED: "Decided",
  FILED: "Filed",
  OVERDUE: "Overdue",
  DUE: "Due soon",
  UPCOMING: "Upcoming",
  DISCOVERY: "Discovery",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
};

/** Label for a status key: from STATUS_LABEL, else the key in sentence case (IN_REVIEW → In review). */
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? (s.charAt(0) + s.slice(1).toLowerCase()).replace(/_/g, " ");

export const PROJECT_STATUSES = ["DRAFT", "QUOTED", "NEGOTIATION", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
/** A care plan (hosting, updates, support after go-live) is a project of its own, with its own ID. */
export const PROJECT_KINDS = ["PROJECT", "CARE", "PRODUCT", "INTERNAL"] as const;
export const KIND_LABEL: Record<string, string> = { PROJECT: "Client project", CARE: "Care / support plan", PRODUCT: "Gen Clover product", INTERNAL: "Internal (bench, R&D, admin)" };
export const MONTH_STATUSES = ["DRAFT", "INVOICED", "PAID"];
export const TIERS = ["STANDARD", "FLOOR", "PREMIUM", "CUSTOM"];
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"];
export const MILESTONE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"];
export const COMMITMENT_KINDS: Record<string, string> = { CONTRACTOR: "Contractor", TAX: "Tax / statutory", SUBSCRIPTION: "Subscription", RENT: "Rent", LOAN: "Loan / EMI", OTHER: "Other" };
export const FREQUENCIES: Record<string, string> = { ONE_OFF: "One-off", MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };
export const OBLIGATION_KINDS: Record<string, string> = { PAYROLL: "Payroll", BILL: "Unpaid bills", ...COMMITMENT_KINDS };
export const STAGES: Record<string, string> = { STARTUP: "Startup", GROWTH: "Growth", MATURE: "Mature", CUSTOM: "Custom" };
export const LINE_KINDS: Record<string, string> = { SERVICES: "Services", MILESTONE: "Milestone (fixed price)", PASS_THROUGH: "Pass-through (at cost)", OTHER: "Other" };

/** Money in its own currency: ₹1,20,000 or $4,500.00. */
export const money = (n: number | null | undefined, currency: string | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : currency === "INR" ? inr(n, digits) : usd(n, digits);
