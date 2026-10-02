// The final allocation (October 2026) and the spend items (expense categories) under each bucket.
// Used by the seed (new databases) and scripts/allocation-oct-2026.ts (existing ones). Safe to re-run:
// the policy is activated only when it is first created, so a later choice on Financial Policies stays.
import type { DbClient } from "../src/index";

export const POLICY_KEYS = ["delivery", "growth", "corpOps", "technology", "sales", "risk", "survival", "ventures", "bizdev", "profit"];

export const FINAL_POLICY = {
  name: "Final allocation (Oct 2026)",
  stage: "CUSTOM",
  description: "Gen Clover's final split: Delivery 40, Growth 7, Corporate Ops 7, Technology 4, Sales 5, Working Capital 9, Survival 5, Ventures 3, BD & Founder Ops 5, Retained Profit 15.",
  pct: [40, 7, 7, 4, 5, 9, 5, 3, 5, 15],
};

/** Bucket "what it covers" lines (the purpose from the allocation sheet). */
export const BUCKET_PURPOSE: Record<string, string> = {
  delivery: "Client project execution and delivery",
  growth: "Team development, skills and technical research",
  corpOps: "Day-to-day administration and office expenses",
  technology: "Shared technology and internal IT systems",
  sales: "Lead generation, brand awareness and client acquisition",
  risk: "Short-term liquidity and active-project financial risks",
  survival: "Emergency fund and business continuity",
  ventures: "New products, proprietary IP and approved investments",
  bizdev: "Strategic expansion and founder business activities",
  profit: "Undistributed earnings retained within the company",
};

/**
 * Expense categories = the subcategories of each bucket (what the money is actually spent on). null = client
 * pass-through (billed to the client at cost, outside the allocation); "gst" = GST paid to the government.
 * "Salaries (employees)" and "Contractor payments" are where approved pay runs land: keep those names.
 */
export const SUBCATEGORIES: [string, string | null][] = [
  // Delivery
  ["Salaries (employees)", "delivery"],
  ["Contractor payments", "delivery"],
  ["Project cloud hosting, servers, domains & SSL", "delivery"],
  ["Project APIs, licences & integrations", "delivery"],
  ["Project-specific tools", "delivery"],
  ["Deployment, testing & staging", "delivery"],
  ["Client maintenance & support", "delivery"],
  ["Project travel", "delivery"],
  // Growth / Talent / R&D
  ["Hiring & recruitment", "growth"],
  ["Training & certifications", "growth"],
  ["Workshops, courses & learning resources", "growth"],
  ["AI R&D", "growth"],
  ["Technology research, PoCs & prototypes", "growth"],
  ["Research subscriptions, computing & API costs", "growth"],
  ["Internal hackathons & mentorship", "growth"],
  ["Incentives / ESOP", "growth"],
  // Corporate Operations
  ["Office rent", "corpOps"],
  ["Electricity & utilities", "corpOps"],
  ["Office internet & Wi-Fi", "corpOps"],
  ["Office meals, tea & refreshments", "corpOps"],
  ["Cleaning & housekeeping", "corpOps"],
  ["Office maintenance, repairs & furniture", "corpOps"],
  ["Stationery, printing & supplies", "corpOps"],
  ["CA, audit & accounting", "corpOps"],
  ["Legal & compliance (ROC)", "corpOps"],
  ["Registration & filing fees", "corpOps"],
  ["Bank charges", "corpOps"],
  ["Security & facility charges", "corpOps"],
  ["Office & admin", "corpOps"],
  ["Taxes & statutory dues", "corpOps"],
  // Technology / Infrastructure
  ["Company website hosting", "technology"],
  ["Cloud & hosting (internal)", "technology"],
  ["GitHub, CI/CD & dev environments", "technology"],
  ["Company email & Microsoft 365", "technology"],
  ["Software & AI tools", "technology"],
  ["Cybersecurity & endpoint protection", "technology"],
  ["Monitoring, backup & disaster recovery", "technology"],
  ["Password manager, VPN & network security", "technology"],
  ["Internal domains & SSL", "technology"],
  ["Hardware & devices", "technology"],
  // Sales / Marketing
  ["Google & LinkedIn ads", "sales"],
  ["Social media campaigns", "sales"],
  ["SEO tools & services", "sales"],
  ["Content, copywriting & case studies", "sales"],
  ["Promotional videos & design tools", "sales"],
  ["Email marketing platforms", "sales"],
  ["Lead databases & prospecting tools", "sales"],
  ["Sales CRM", "sales"],
  ["Marketing & website", "sales"],
  ["PR & brand promotion", "sales"],
  ["Marketing agency & freelancer fees", "sales"],
  // Working Capital / Risk
  ["Bridging delayed client payments", "risk"],
  ["Urgent contractor payments", "risk"],
  ["Unplanned project rework & fixes", "risk"],
  ["Project overrun contingency", "risk"],
  ["Payment dispute exposure", "risk"],
  ["Bench cost", "risk"],
  ["Bad debt / write-off", "risk"],
  // Survival Reserve
  ["Emergency spend (survival)", "survival"],
  ["Essential salaries during revenue shortfall", "survival"],
  ["Critical rent & utilities during disruption", "survival"],
  ["Business insurance", "survival"],
  ["Business continuity & system recovery", "survival"],
  // Ventures & Investments
  ["New product / venture spend", "ventures"],
  ["MVP build, testing & validation", "ventures"],
  ["Product cloud infrastructure", "ventures"],
  ["Software / IP acquisition", "ventures"],
  ["Product launch & market research", "ventures"],
  ["Strategic investment", "ventures"],
  // Business Development & Founder Ops
  ["Client meetings & travel", "bizdev"],
  ["Business accommodation & transport", "bizdev"],
  ["Conferences, events & networking", "bizdev"],
  ["Trade shows", "bizdev"],
  ["Proposals, tenders & strategic consulting", "bizdev"],
  ["Partnership development", "bizdev"],
  ["Investor & stakeholder meetings", "bizdev"],
  ["Memberships, books & research", "bizdev"],
  // Retained profit, pass-through, GST
  ["Profit distribution", "profit"],
  ["Client pass-through (hosting, APIs, SaaS)", null],
  ["GST paid to the government", "gst"],
];

/** No longer offered for new expenses (kept for the expenses already recorded against them). */
export const RETIRED_CATEGORIES = ["Sales & BD travel"];

export async function applyFinalAllocation(prisma: DbClient, log: (s: string) => void = () => {}) {
  const existing = await prisma.financialPolicy.findUnique({ where: { name: FINAL_POLICY.name } });
  if (!existing) {
    const allocations = POLICY_KEYS.map((key, i) => ({ key, percent: FINAL_POLICY.pct[i] }));
    await prisma.financialPolicy.updateMany({ where: { active: true }, data: { active: false } });
    await prisma.financialPolicy.create({
      data: { name: FINAL_POLICY.name, stage: FINAL_POLICY.stage, description: FINAL_POLICY.description, allocations: JSON.stringify(allocations), active: true },
    });
    for (const a of allocations) await prisma.allocationBucket.updateMany({ where: { key: a.key }, data: { percent: a.percent, description: BUCKET_PURPOSE[a.key] } });
    log(`Allocation: "${FINAL_POLICY.name}" created and active (${allocations.map((a) => `${a.key} ${a.percent}%`).join(", ")})`);
  }
  let added = 0;
  for (const [i, [name, bucketKey]] of SUBCATEGORIES.entries()) {
    const c = await prisma.expenseCategory.findUnique({ where: { name } });
    if (c) await prisma.expenseCategory.update({ where: { id: c.id }, data: { bucketKey, sortOrder: i, active: true } });
    else {
      await prisma.expenseCategory.create({ data: { name, bucketKey, sortOrder: i } });
      added++;
    }
  }
  const retired = await prisma.expenseCategory.updateMany({ where: { name: { in: RETIRED_CATEGORIES } }, data: { active: false, sortOrder: 999 } });
  if (added || retired.count) log(`Expense subcategories: ${added} added, ${retired.count} retired`);
}
