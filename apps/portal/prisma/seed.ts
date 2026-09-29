// Seeds the portal from docs/Gen-Clover-Rate-Card-2026.md (Final v2).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const settings = [
  // Company
  { key: "companyName", value: "Gen Clover", label: "Company name", group: "Company", type: "text" },
  { key: "projectCodePrefix", value: "GC", label: "Project ID prefix", group: "Company", type: "text", description: "Project IDs are generated as PREFIX-YYYY-0001" },
  // Market / cost assumptions
  { key: "fxRate", value: "88", label: "FX rate", group: "Cost assumptions", unit: "₹ per US$", description: "Used for Delivery Pool ₹ lakh/yr" },
  { key: "billableHoursPerYear", value: "1920", label: "Billable hours / year (India)", group: "Cost assumptions", unit: "hrs", description: "160 × 12" },
  { key: "usHoursPerYear", value: "2080", label: "US hours / year", group: "Cost assumptions", unit: "hrs", description: "40 × 52" },
  { key: "usLoadFactor", value: "1.3", label: "US load factor", group: "Cost assumptions", unit: "×", description: "Benefits, tax, overhead on US base salary" },
  { key: "coverageTarget", value: "1.25", label: "Cost coverage target", group: "Cost assumptions", unit: "×", description: "Delivery pool ÷ India CTC midpoint" },
  // Floor & premium rules
  { key: "floorThreshold", value: "70", label: "Floor rule threshold", group: "Floor & premium rules", unit: "$/hr", description: "Rates at or above this use the high deduction" },
  { key: "floorDeltaLow", value: "5", label: "Floor deduction (below threshold)", group: "Floor & premium rules", unit: "$/hr" },
  { key: "floorDeltaHigh", value: "10", label: "Floor deduction (at/above threshold)", group: "Floor & premium rules", unit: "$/hr" },
  { key: "premiumPctMin", value: "15", label: "Premium uplift (min)", group: "Floor & premium rules", unit: "%" },
  { key: "premiumPctMax", value: "20", label: "Premium uplift (max)", group: "Floor & premium rules", unit: "%" },
  { key: "rateRounding", value: "5", label: "Rate rounding", group: "Floor & premium rules", unit: "$", description: "Premium rates are rounded to the nearest multiple" },
  // Packages
  { key: "blendedRate", value: "60", label: "Blended rate", group: "Commercial packages", unit: "$/hr" },
  { key: "retainerHours", value: "160", label: "Retainer hours / month", group: "Commercial packages", unit: "hrs" },
  { key: "retainerAmount", value: "9250", label: "Standard monthly retainer", group: "Commercial packages", unit: "$" },
  { key: "additionalHourRate", value: "60", label: "Additional hours rate", group: "Commercial packages", unit: "$/hr" },
  // Invoicing (export of services from India, billed in USD)
  { key: "companyLegalName", value: "", label: "Legal entity name", group: "Invoicing", type: "text", description: "As registered; printed on invoices" },
  { key: "companyAddress", value: "", label: "Registered address", group: "Invoicing", type: "text" },
  { key: "gstin", value: "", label: "GSTIN", group: "Invoicing", type: "text" },
  { key: "lutNumber", value: "", label: "LUT ARN", group: "Invoicing", type: "text", description: "Export under LUT without payment of IGST" },
  { key: "sacCode", value: "998314", label: "SAC code", group: "Invoicing", type: "text", description: "998314 = IT design & development services" },
  { key: "bankDetails", value: "", label: "Bank / remittance details", group: "Invoicing", type: "text", description: "Beneficiary, account, SWIFT — printed on invoices" },
  { key: "invoicePrefix", value: "GC", label: "Invoice number prefix", group: "Invoicing", type: "text", description: "Invoices are numbered PREFIX/26-27/0001 per financial year" },
  { key: "paymentTermsDays", value: "30", label: "Payment terms", group: "Invoicing", unit: "days" },
  // Treasury & alerts (CFO dashboard)
  { key: "runwayTargetMonths", value: "12", label: "Survival runway target", group: "Treasury & alerts", unit: "months", description: "Survival fund ÷ monthly unavoidable burn" },
  { key: "runwayMinMonths", value: "6", label: "Survival runway minimum", group: "Treasury & alerts", unit: "months", description: "Below this is a critical alert" },
  { key: "minCashInr", value: "500000", label: "Minimum operating cash", group: "Treasury & alerts", unit: "₹", description: "Bank cash below this is a critical alert" },
  { key: "benchMaxPct", value: "10", label: "Bench tolerance", group: "Treasury & alerts", unit: "%", description: "Share of team capacity not staffed on billable work" },
  { key: "commitmentHorizonDays", value: "30", label: "Commitment horizon", group: "Treasury & alerts", unit: "days", description: "Obligations due within this window reduce available funds" },
  { key: "paymentLagMonths", value: "2", label: "Payment lag", group: "Treasury & alerts", unit: "months", description: "Months from starting work to first cash (bill in arrears + terms)" },
];

// Allocation policies by company stage. Keys = AllocationBucket keys; each policy totals 100%.
// Order: delivery, growth (Talent/R&D), corpOps, technology, sales, risk (Working Capital), survival, ventures, bizdev, profit
const POLICY_KEYS = ["delivery", "growth", "corpOps", "technology", "sales", "risk", "survival", "ventures", "bizdev", "profit"];
const policies: { name: string; stage: string; description: string; pct: number[]; active?: boolean }[] = [
  { name: "Rate Card v2 (65/10/25)", stage: "CUSTOM", active: true, description: "The allocation the 2026 rate card is priced on. No survival, venture or BD funds.", pct: [65, 10, 8, 4, 4, 4, 0, 0, 0, 5] },
  { name: "Base allocation", stage: "CUSTOM", description: "Research base model: delivery 55%, 10% survival reserve, ventures and BD funded.", pct: [55, 5, 7, 3, 4, 4, 10, 4, 2, 6] },
  { name: "Startup", stage: "STARTUP", description: "Proposal — prioritises survival, delivery and sales. Review before use.", pct: [56, 4, 7, 3, 6, 4, 12, 1, 2, 5] },
  { name: "Growth", stage: "GROWTH", description: "Proposal — prioritises talent/hiring, sales and delivery capacity. Review before use.", pct: [56, 8, 6, 3, 6, 4, 8, 2, 3, 4] },
  { name: "Mature", stage: "MATURE", description: "Proposal — prioritises profit, ventures and investments. Review before use.", pct: [52, 5, 6, 3, 4, 4, 8, 7, 2, 9] },
];

// Expense categories → allocation bucket (null = client pass-through, outside the 65/10/25 model)
const categories: [string, string | null][] = [
  ["Salaries (employees)", "delivery"],
  ["Contractor payments", "delivery"],
  ["Hiring & recruitment", "growth"],
  ["Training & certifications", "growth"],
  ["AI R&D", "growth"],
  ["Incentives / ESOP", "growth"],
  ["CA, audit & accounting", "corpOps"],
  ["Legal & compliance (ROC)", "corpOps"],
  ["Bank charges", "corpOps"],
  ["Office & admin", "corpOps"],
  ["Software & AI tools", "technology"],
  ["Cloud & hosting (internal)", "technology"],
  ["Hardware & devices", "technology"],
  ["Marketing & website", "sales"],
  ["Sales & BD travel", "sales"],
  ["Bad debt / write-off", "risk"],
  ["Bench cost", "risk"],
  ["Taxes & statutory dues", "corpOps"],
  ["Client meetings & travel", "bizdev"],
  ["Conferences, events & networking", "bizdev"],
  ["Memberships, books & research", "bizdev"],
  ["New product / venture spend", "ventures"],
  ["Strategic investment", "ventures"],
  ["Emergency spend (survival)", "survival"],
  ["Profit distribution", "profit"],
  ["Client pass-through (hosting, APIs, SaaS)", null],
];

const buckets = [
  { key: "delivery", name: "Delivery", percent: 65, category: "DELIVERY", description: "Resource/delivery compensation pool" },
  { key: "growth", name: "Growth / Talent / R&D", percent: 10, category: "GROWTH", description: "Hiring, contractors, training, AI R&D, ESOP/incentives" },
  { key: "corpOps", name: "Corporate Operations", percent: 8, category: "CORPORATE", description: "CA, audit, ROC, legal, accounting, banking, compliance" },
  { key: "technology", name: "Technology / Infrastructure", percent: 4, category: "CORPORATE", description: "AI tools, Microsoft 365, GitHub, cloud, security, software" },
  { key: "sales", name: "Sales / Marketing", percent: 4, category: "CORPORATE", description: "Lead generation, website, CRM, proposals, marketing, BD" },
  { key: "risk", name: "Working Capital / Risk", percent: 4, category: "CORPORATE", description: "Payment delays, FX, bench, bad debt" },
  { key: "survival", name: "Survival Reserve", percent: 0, category: "CORPORATE", description: "Runway reserve — target 12 months of unavoidable burn" },
  { key: "ventures", name: "Ventures & Investments", percent: 0, category: "GROWTH", description: "New products, new companies, investments, acquisitions" },
  { key: "bizdev", name: "Business Development & Founder Ops", percent: 0, category: "CORPORATE", description: "Client meetings, travel, conferences, networking, memberships, market exploration" },
  { key: "profit", name: "Retained Company Profit", percent: 5, category: "CORPORATE", isProfit: true, description: "Actual retained profit / capital accumulation" },
];

// [name, family, marketMin, marketMax, usSalary, standard, floor, ctcMin, ctcMax]
const roles: [string, string, number, number, number, number, number, number, number][] = [
  ["Product Manager", "Product & Delivery Mgmt", 45, 75, 165000, 60, 55, 40, 70],
  ["Technical Product Manager", "Product & Delivery Mgmt", 50, 80, 175000, 65, 60, 45, 80],
  ["Business Analyst", "Analysis & Design", 35, 55, 115000, 45, 40, 15, 25],
  ["UI/UX Designer", "Analysis & Design", 35, 60, 135000, 45, 40, 20, 35],
  ["Frontend Developer — React/Next.js", "Core Engineering", 40, 65, 150000, 50, 45, 22, 38],
  ["Backend Developer — Node/Python/.NET", "Core Engineering", 40, 70, 160000, 55, 50, 25, 42],
  ["Full-Stack Developer", "Core Engineering", 45, 70, 160000, 60, 55, 25, 45],
  ["Mobile Developer", "Core Engineering", 40, 65, 155000, 55, 50, 25, 40],
  ["QA Engineer (Manual)", "Quality", 28, 45, 105000, 35, 30, 15, 25],
  ["Automation QA / SDET", "Quality", 35, 55, 140000, 45, 40, 25, 40],
  ["DevOps / Cloud Engineer", "Specialist Engineering", 50, 85, 175000, 65, 60, 30, 55],
  ["Technical Lead", "Technical Leadership", 50, 80, 185000, 70, 60, 35, 55],
  ["Solution / Software Architect", "Technical Leadership", 60, 100, 195000, 80, 70, 45, 70],
  ["AI / LLM Engineer", "Specialist Engineering", 55, 95, 210000, 80, 70, 45, 90],
  ["Data Engineer", "Specialist Engineering", 45, 75, 175000, 60, 55, 30, 50],
  ["Cybersecurity Engineer", "Specialist Engineering", 50, 85, 170000, 65, 60, 30, 50],
  ["Technical Project Manager", "Product & Delivery Mgmt", 45, 70, 154000, 55, 50, 30, 45],
  ["Documentation / Client Communication", "Support", 30, 50, 110000, 35, 30, 12, 20],
];

async function main() {
  for (const [i, s] of settings.entries()) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { type: "number", ...s, sortOrder: i },
    });
  }

  for (const [i, b] of buckets.entries()) {
    await prisma.allocationBucket.upsert({
      where: { key: b.key },
      update: {},
      create: { isProfit: false, ...b, sortOrder: i },
    });
  }

  for (const [i, r] of roles.entries()) {
    const [name, family, marketMin, marketMax, usSalary, standardRate, floorRate, ctcMinL, ctcMaxL] = r;
    await prisma.roleRate.upsert({
      where: { name },
      update: {},
      // floorRate null = follow floor rule (all v2 floors match the rule)
      create: { name, family, marketMin, marketMax, usSalary, standardRate, floorRate: floorRate === standardRate - (standardRate >= 70 ? 10 : 5) ? null : floorRate, ctcMinL, ctcMaxL, sortOrder: i },
    });
  }

  for (const [i, [name, bucketKey]] of categories.entries()) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name, bucketKey, sortOrder: i } });
  }

  // Research naming: Risk → Working Capital (only if still on the old default name)
  await prisma.allocationBucket.updateMany({ where: { key: "risk", name: "Risk / Working Capital" }, data: { name: "Working Capital / Risk" } });

  for (const [i, key] of POLICY_KEYS.entries()) await prisma.allocationBucket.updateMany({ where: { key }, data: { sortOrder: i } });

  const hasActive = (await prisma.financialPolicy.count({ where: { active: true } })) > 0;
  for (const p of policies) {
    const allocations = JSON.stringify(POLICY_KEYS.map((key, i) => ({ key, percent: p.pct[i] })));
    await prisma.financialPolicy.upsert({
      where: { name: p.name },
      update: {},
      create: { name: p.name, stage: p.stage, description: p.description, allocations, active: !hasActive && !!p.active },
    });
  }

  const email = (process.env.SEED_ADMIN_EMAIL || "admin@genclover.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe@2026";
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Gen Clover Admin", email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) },
  });

  // Sample client + project = the md "Sample Monthly Retainer (160 hrs)"
  if ((await prisma.project.count()) === 0) {
    const client = await prisma.client.create({
      data: { name: "Sample Client Inc.", contactName: "Jane Doe", email: "jane@example.com", country: "USA", city: "Austin, TX", timezone: "America/Chicago", notes: "Demo record seeded from the rate card sample retainer." },
    });
    const allBuckets = await prisma.allocationBucket.findMany({ orderBy: { sortOrder: "asc" } });
    const snapshot = JSON.stringify(allBuckets.map(({ key, name, percent, category, isProfit }) => ({ key, name, percent, category, isProfit })));
    const byName = Object.fromEntries((await prisma.roleRate.findMany()).map((r) => [r.name, r]));
    const lines: [string, string, number][] = [
      ["Product Management", "Product Manager", 30],
      ["Architecture / Technical Lead", "Technical Lead", 10],
      ["Full-Stack Development", "Full-Stack Developer", 90],
      ["QA", "QA Engineer (Manual)", 15],
      ["DevOps", "DevOps / Cloud Engineer", 10],
      ["Documentation / Client Communication", "Documentation / Client Communication", 5],
    ];
    const year = new Date().getFullYear();
    await prisma.project.create({
      data: {
        code: `GC-${year}-0001`,
        name: "Product Engineering Retainer",
        clientId: client.id,
        status: "ACTIVE",
        engagementModel: "RETAINER",
        startDate: new Date(year, new Date().getMonth(), 1),
        agreedAt: new Date(),
        agreedMonthly: 9250,
        agreedRetainerHrs: 160,
        agreedExtraRate: 60,
        agreementNotes: "Sample: 160 hrs/month retainer at $9,250, extra hours at $60/hr.",
        allocationSnapshot: snapshot,
        createdById: admin.id,
        resources: {
          create: lines.map(([label, roleName, hours], i) => {
            const r = byName[roleName];
            const floor = r.floorRate ?? r.standardRate - (r.standardRate >= 70 ? 10 : 5);
            return { label, roleId: r.id, hoursPerMonth: hours, tier: "STANDARD", quotedRate: r.standardRate, agreedRate: r.standardRate, standardRate: r.standardRate, floorRate: floor, sortOrder: i };
          }),
        },
      },
    });
  }

  console.log(`Seed complete. Admin login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
