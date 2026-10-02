// What each allocation bucket is for, what it pays for, and what it doesn't. Keyed by AllocationBucket.key.
// The percentages live in the database (Settings & formula); the actual spend items are the expense
// categories mapped to each bucket (the bucket's subcategories). Safe for server and client.

export type BucketGuide = { purpose: string; exclusions: string; example: string };

export const BUCKET_GUIDE: Record<string, BucketGuide> = {
  delivery: {
    purpose: "Client project execution and delivery",
    exclusions: "General company infrastructure, internal product R&D, routine office expenses",
    example: "Paying developers building a client's e-commerce website",
  },
  growth: {
    purpose: "Team development, skills and technical research",
    exclusions: "Delivery work billed to a client; routine office administration; product investment with its own approved budget",
    example: "Paying for an employee's AI certification or testing a new technology",
  },
  corpOps: {
    purpose: "Day-to-day administration and office expenses",
    exclusions: "Personal expenses; project-specific costs; company-wide technology subscriptions (Technology / Infrastructure)",
    example: "Paying monthly office rent, electricity and regular accounting fees",
  },
  technology: {
    purpose: "Shared technology and internal IT systems",
    exclusions: "Hosting or tools used only for a client project; office utilities and physical facility costs",
    example: "Paying for Gen Clover's shared GitHub organisation and internal cloud infrastructure",
  },
  sales: {
    purpose: "Lead generation, brand awareness and client acquisition",
    exclusions: "Founder strategic travel and relationship activities; delivery of paid client marketing projects",
    example: "Running a LinkedIn campaign targeting prospective enterprise clients",
  },
  risk: {
    purpose: "Short-term liquidity and active-project financial risks",
    exclusions: "Long-term emergency reserve; planned R&D or investments; routine costs already budgeted elsewhere",
    example: "Paying a project developer while awaiting a delayed client milestone",
  },
  survival: {
    purpose: "Emergency fund and business continuity",
    exclusions: "Routine monthly expenses; normal project cash flow; planned investments or founder withdrawals",
    example: "Covering essential costs during a prolonged period without client revenue",
  },
  ventures: {
    purpose: "New products, proprietary IP and approved investments",
    exclusions: "Client deliverables; general technical research; routine internal infrastructure",
    example: "Funding an MVP for a Gen Clover-owned AI recruitment platform",
  },
  bizdev: {
    purpose: "Strategic expansion and founder business activities",
    exclusions: "Personal expenses; paid advertising; routine office costs; project delivery expenses",
    example: "A founder travelling to meet a prospective international enterprise client",
  },
  profit: {
    purpose: "Undistributed earnings retained within the company",
    exclusions: "Not an expense budget: what is retained after expenses, provisions and taxes",
    example: "Retaining a portion of annual net profit instead of distributing it as dividends",
  },
};
