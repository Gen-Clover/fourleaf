// Agreement types, statuses and the onboarding checklist. Safe for server and client.

/** scope CLIENT: one per client relationship (code ABR-A01). PROJECT: tied to a project (ABR-P01-S01 / -CR01 / -AC01). */
export const AGREEMENT_TYPES: Record<string, { label: string; scope: "CLIENT" | "PROJECT"; kind?: "S" | "CR" | "AC"; hint: string }> = {
  NDA: { label: "NDA", scope: "CLIENT", hint: "Confidentiality before sharing sensitive information" },
  MSA: { label: "Master Service Agreement (MSA)", scope: "CLIENT", hint: "The overall legal and commercial relationship: liability, IP, payment, termination" },
  DPA: { label: "Data processing addendum", scope: "CLIENT", hint: "Personal data handling, where the work needs it" },
  SOW: { label: "Statement of Work (SOW)", scope: "PROJECT", kind: "S", hint: "Scope, deliverables, price and timeline of one project or phase" },
  RESOURCE: { label: "Resource schedule", scope: "PROJECT", kind: "S", hint: "Dedicated people on an ongoing basis (monthly or hourly)" },
  SUPPORT: { label: "Support / maintenance schedule", scope: "PROJECT", kind: "S", hint: "Post-delivery support: hours, coverage, exclusions" },
  SLA: { label: "Service level agreement (SLA)", scope: "PROJECT", kind: "S", hint: "Service levels, response times, escalation" },
  CR: { label: "Change request", scope: "PROJECT", kind: "CR", hint: "A change to scope, cost, timeline or deliverables" },
  ACCEPTANCE: { label: "Acceptance certificate", scope: "PROJECT", kind: "AC", hint: "Client accepts a milestone or the delivery, with any open items" },
  OTHER: { label: "Other", scope: "CLIENT", hint: "Any other signed document" },
};

export const AGREEMENT_STATUSES = ["DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED", "SUPERSEDED"] as const;
export const LIVE_STATUSES = ["SIGNED", "ACTIVE"];

/** What onboarding a new client involves; ticked on the client page. */
export const ONBOARDING_CHECKLIST: { key: string; label: string }[] = [
  { key: "nda", label: "NDA signed (if sensitive information is shared)" },
  { key: "msa", label: "MSA / engagement agreement signed" },
  { key: "sow", label: "First SOW (scope, price, timeline) signed" },
  { key: "billing", label: "Billing details: legal name, address, GSTIN / tax ID, currency" },
  { key: "advance", label: "Advance invoice raised by Finance" },
  { key: "project", label: "Project set up (ID, delivery manager, milestones)" },
  { key: "kickoff", label: "Kick-off call booked with the client" },
  { key: "assets", label: "Brand assets and content received (logo, colours, photos, text)" },
  { key: "access", label: "Access received (domain, hosting, Google Business, analytics)" },
  { key: "comms", label: "Communication channel set up (WhatsApp group, email, Slack)" },
  { key: "jira", label: "Jira project created with the client code" },
  { key: "folder", label: "Shared folder created, named with the client code" },
];

export const parseChecklist = (s: string | null | undefined): Record<string, boolean> => {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
};

/** Indian states and union territories (GST place of supply). */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export const CURRENCIES = ["INR", "USD"] as const;

/** Days until a date (negative = past). */
export const daysUntil = (d: Date | null | undefined, now = new Date()) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86_400_000) : null);
