// Seeds the portal from docs/finance/Gen-Clover-Rate-Card-2026.md (Final v2).
import bcrypt from "bcryptjs";
import { applyFinalAllocation, BUCKET_PURPOSE, POLICY_KEYS, SUBCATEGORIES } from "./allocation";
// The shared client: omitted optional fields are stored as null (see src/sql-nulls.ts).
import { prisma } from "../src/index";

const settings = [
  // Company
  { key: "companyName", value: "Gen Clover", label: "Company name", group: "Company", type: "text" },
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
  { key: "invoicePrefix", value: "GCI", label: "Invoice number prefix", group: "Invoicing", type: "text", description: "Invoices are numbered PREFIX/26-27/0001: one consecutive series per financial year (GST). Change it only before a year's first invoice." },
  { key: "paymentTermsDays", value: "30", label: "Payment terms", group: "Invoicing", unit: "days" },
  { key: "companyState", value: "Punjab", label: "State of registration (GST)", group: "Invoicing", type: "text", description: "Same state as the client = CGST + SGST; another state = IGST; outside India = export under LUT" },
  { key: "companyPan", value: "", label: "Company PAN", group: "Invoicing", type: "text" },
  { key: "gstRatePct", value: "18", label: "GST rate on services", group: "Invoicing", unit: "%", description: "IT services (SAC 998314) are 18%" },
  // Pay, approvals and costing
  { key: "tdsContractorPct", value: "10", label: "TDS on contractor payments", group: "Pay & approvals", unit: "%", description: "Default deduction on contractor invoices (e.g. 10% under section 194J); set per person if different. Confirm with your CA." },
  { key: "approvalLimitInr", value: "25000", label: "Second approval above", group: "Pay & approvals", unit: "₹", description: "Expenses at or above this need a second person to approve before they are paid. Pay runs always do." },
  { key: "overheadPerHourInr", value: "0", label: "Overhead per logged hour", group: "Pay & approvals", unit: "₹ / hr", description: "Rent, tools, admin spread over hours, for project margin after overhead. 0 = off." },
  // Treasury & alerts (CFO dashboard)
  { key: "runwayTargetMonths", value: "12", label: "Survival runway target", group: "Treasury & alerts", unit: "months", description: "Survival fund ÷ monthly unavoidable burn" },
  { key: "runwayMinMonths", value: "6", label: "Survival runway minimum", group: "Treasury & alerts", unit: "months", description: "Below this is a critical alert" },
  { key: "minCashInr", value: "500000", label: "Minimum operating cash", group: "Treasury & alerts", unit: "₹", description: "Bank cash below this is a critical alert" },
  { key: "benchMaxPct", value: "10", label: "Bench tolerance", group: "Treasury & alerts", unit: "%", description: "Share of team capacity not staffed on billable work" },
  { key: "commitmentHorizonDays", value: "30", label: "Commitment horizon", group: "Treasury & alerts", unit: "days", description: "Obligations due within this window reduce available funds" },
  { key: "paymentLagMonths", value: "2", label: "Payment lag", group: "Treasury & alerts", unit: "months", description: "Months from starting work to first cash (bill in arrears + terms)" },
  // Lead Finder (edited under Lead Finder → Settings). Google prices: Maps Platform price list, Sep 2026.
  { key: "lfMonthlyBudgetUsd", value: "10", label: "Monthly Google spend cap", group: "Lead Finder", unit: "US$", description: "Searches pause when this month's estimated spend would pass it. 0 = free allowance only." },
  { key: "lfSearchPricePer1000", value: "35", label: "Text Search (Enterprise) price", group: "Lead Finder", unit: "US$ / 1,000", description: "Each page of up to 20 results is one request" },
  { key: "lfSearchFreePerMonth", value: "1000", label: "Text Search free requests", group: "Lead Finder", unit: "per month" },
  { key: "lfAreaPricePer1000", value: "32", label: "Area lookup (Text Search Pro) price", group: "Lead Finder", unit: "US$ / 1,000", description: "Finding the boundary of each place you type" },
  { key: "lfAreaFreePerMonth", value: "5000", label: "Area lookup free requests", group: "Lead Finder", unit: "per month" },
  { key: "lfDetailsPricePer1000", value: "20", label: "Place Details (Enterprise) price", group: "Lead Finder", unit: "US$ / 1,000", description: "Refreshing Google data for leads you are still working" },
  { key: "lfDetailsFreePerMonth", value: "1000", label: "Place Details free requests", group: "Lead Finder", unit: "per month" },
  { key: "lfCellKm", value: "4", label: "Search grid cell size", group: "Lead Finder", unit: "km", description: "Thorough searches start with cells this wide and split busy ones" },
  { key: "lfMinCellKm", value: "0.5", label: "Smallest grid cell", group: "Lead Finder", unit: "km" },
  { key: "lfHotScore", value: "70", label: "Hot lead score", group: "Lead Finder", unit: "0–100" },
  { key: "lfWarmScore", value: "45", label: "Warm lead score", group: "Lead Finder", unit: "0–100" },
  { key: "lfAutoQualifyScore", value: "85", label: "Qualify automatically at score", group: "Lead Finder", unit: "0–100", description: "New leads at or above this score, with a phone or email, become Qualified. 0 = off." },
  { key: "lfChainBranches", value: "6", label: "Big chain at branches", group: "Lead Finder", unit: "branches", description: "Businesses with this many branches are marked Not a fit. 0 = off." },
  { key: "lfNightlySpeedTests", value: "40", label: "Nightly speed tests", group: "Lead Finder", unit: "leads", description: "Google PageSpeed runs each night (2 AM IST) on the best leads with websites. 0 = off." },
  { key: "lfDailyNewContacts", value: "30", label: "New contacts per day", group: "Lead Finder", unit: "leads", description: "First messages the Today queue offers each day, on top of due follow-ups" },
  { key: "lfEmailDailyLimit", value: "40", label: "Emails per day", group: "Lead Finder", unit: "emails", description: "Most emails the portal sends in a day, to protect the sending domain" },
  { key: "lfAutoEmailFollowUps", value: "0", label: "Send email follow-ups automatically", group: "Lead Finder", unit: "1 = on", description: "After a person sends the first email, the worker sends follow-ups during business hours. Stops on reply." },
  { key: "lfStuckRepliedDays", value: "2", label: "Stuck in Replied after", group: "Lead Finder", unit: "days", description: "Replied but no call, meeting or proposal since" },
  { key: "lfStuckMeetingDays", value: "3", label: "Stuck in Call / meeting after", group: "Lead Finder", unit: "days" },
  { key: "lfStuckProposalDays", value: "7", label: "Stuck in Proposal sent after", group: "Lead Finder", unit: "days", description: "Proposal sent and no answer since" },
  { key: "lfBookingLink", value: "", label: "Booking link", group: "Lead Finder", type: "text", description: "Calendly, Cal.com or Google booking page, added to suggested replies" },
  { key: "lfNoReplyDays", value: "7", label: "Close as No reply after", group: "Lead Finder", unit: "days", description: "Days after the last follow-up with no reply. 0 = off." },
];

// Lead Finder niche presets (strategy doc, section 3). Phrases are what each search asks Google for.
const niches: { key: string; label: string; phrases: string[]; market?: string; value: string; bookingRelevant?: boolean }[] = [
  { key: "immigration", label: "Immigration & study-abroad consultants", phrases: ["immigration consultant", "visa consultant", "study abroad consultant", "IELTS coaching", "PR visa consultant"], value: "HIGH" },
  { key: "dental", label: "Dental clinics", phrases: ["dentist", "dental clinic", "orthodontist"], value: "HIGH", bookingRelevant: true },
  { key: "skin-hair", label: "Skin & hair clinics", phrases: ["dermatologist", "skin clinic", "hair transplant clinic"], value: "HIGH", bookingRelevant: true },
  { key: "ivf", label: "IVF & fertility centres", phrases: ["IVF centre", "fertility clinic"], value: "HIGH", bookingRelevant: true },
  { key: "physio", label: "Physiotherapy clinics", phrases: ["physiotherapist", "physiotherapy clinic"], value: "MEDIUM", bookingRelevant: true },
  { key: "real-estate", label: "Real estate brokers & builders", phrases: ["real estate agent", "property dealer", "builder developer"], value: "HIGH" },
  { key: "hotels", label: "Hotels, homestays & resorts", phrases: ["hotel", "homestay", "resort"], value: "MEDIUM", bookingRelevant: true },
  { key: "manufacturers", label: "Manufacturers & exporters", phrases: ["manufacturer", "exporter", "industrial supplier"], value: "MEDIUM" },
  { key: "interiors", label: "Interior designers & architects", phrases: ["interior designer", "architect"], value: "MEDIUM" },
  { key: "ca-law", label: "CA & law firms", phrases: ["chartered accountant", "law firm", "advocate"], value: "MEDIUM" },
  { key: "coaching", label: "Coaching institutes", phrases: ["coaching institute", "tuition centre"], value: "MEDIUM" },
  { key: "gyms-salons", label: "Premium gyms & salons", phrases: ["gym", "fitness centre", "beauty salon", "unisex salon"], value: "LOW", bookingRelevant: true },
  { key: "us-home", label: "US home services", phrases: ["roofing contractor", "HVAC contractor", "landscaping company", "cleaning service"], market: "US", value: "HIGH" },
  { key: "us-clinics", label: "US dentists & med spas", phrases: ["dentist", "med spa"], market: "US", value: "HIGH", bookingRelevant: true },
  { key: "us-lawyers", label: "US law firms", phrases: ["personal injury lawyer", "family lawyer"], market: "US", value: "HIGH" },
  { key: "us-plumbers", label: "US plumbers", phrases: ["plumber", "emergency plumber", "drain cleaning"], market: "US", value: "HIGH" },
  { key: "us-hvac", label: "US HVAC", phrases: ["HVAC contractor", "air conditioning repair", "furnace repair"], market: "US", value: "HIGH" },
  { key: "us-roofers", label: "US roofers", phrases: ["roofing contractor", "roof repair"], market: "US", value: "HIGH" },
  { key: "us-chiro", label: "US chiropractors", phrases: ["chiropractor", "chiropractic clinic"], market: "US", value: "MEDIUM", bookingRelevant: true },
  { key: "us-medspa", label: "US med spas", phrases: ["med spa", "medical spa", "botox clinic"], market: "US", value: "HIGH", bookingRelevant: true },
  { key: "us-dental", label: "US dentists", phrases: ["dentist", "cosmetic dentist", "family dentistry"], market: "US", value: "HIGH", bookingRelevant: true },
  { key: "us-law", label: "US law firms (all)", phrases: ["personal injury lawyer", "family law attorney", "criminal defense attorney", "estate planning attorney"], market: "US", value: "HIGH" },
];

// Allocation policies by company stage. Keys = AllocationBucket keys; each policy totals 100%.
// Order: delivery, growth (Talent/R&D), corpOps, technology, sales, risk (Working Capital), survival, ventures, bizdev, profit
const policies: { name: string; stage: string; description: string; pct: number[]; active?: boolean }[] = [
  { name: "Rate Card v2 (65/10/25)", stage: "CUSTOM", description: "The allocation the 2026 rate card is priced on. No survival, venture or BD funds.", pct: [65, 10, 8, 4, 4, 4, 0, 0, 0, 5] },
  { name: "Base allocation", stage: "CUSTOM", description: "Research base model: delivery 55%, 10% survival reserve, ventures and BD funded.", pct: [55, 5, 7, 3, 4, 4, 10, 4, 2, 6] },
  { name: "Startup", stage: "STARTUP", description: "Proposal — prioritises survival, delivery and sales. Review before use.", pct: [56, 4, 7, 3, 6, 4, 12, 1, 2, 5] },
  { name: "Growth", stage: "GROWTH", description: "Proposal — prioritises talent/hiring, sales and delivery capacity. Review before use.", pct: [56, 8, 6, 3, 6, 4, 8, 2, 3, 4] },
  { name: "Mature", stage: "MATURE", description: "Proposal — prioritises profit, ventures and investments. Review before use.", pct: [52, 5, 6, 3, 4, 4, 8, 7, 2, 9] },
];

// Expense categories (each bucket's subcategories): prisma/allocation.ts
const categories = SUBCATEGORIES;

const buckets = [
  { key: "delivery", name: "Delivery", percent: 40, category: "DELIVERY", description: BUCKET_PURPOSE.delivery },
  { key: "growth", name: "Growth / Talent / R&D", percent: 7, category: "GROWTH", description: BUCKET_PURPOSE.growth },
  { key: "corpOps", name: "Corporate Operations", percent: 7, category: "CORPORATE", description: BUCKET_PURPOSE.corpOps },
  { key: "technology", name: "Technology / Infrastructure", percent: 4, category: "CORPORATE", description: BUCKET_PURPOSE.technology },
  { key: "sales", name: "Sales / Marketing", percent: 5, category: "CORPORATE", description: BUCKET_PURPOSE.sales },
  { key: "risk", name: "Working Capital / Risk", percent: 9, category: "CORPORATE", description: BUCKET_PURPOSE.risk },
  { key: "survival", name: "Survival Reserve", percent: 5, category: "CORPORATE", description: BUCKET_PURPOSE.survival },
  { key: "ventures", name: "Ventures & Investments", percent: 3, category: "GROWTH", description: BUCKET_PURPOSE.ventures },
  { key: "bizdev", name: "Business Development & Founder Ops", percent: 5, category: "CORPORATE", description: BUCKET_PURPOSE.bizdev },
  { key: "profit", name: "Retained Company Profit", percent: 15, category: "CORPORATE", isProfit: true, description: BUCKET_PURPOSE.profit },
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
  // Sales incentives are paid from their own fund (held from each receipt), not from an allocation bucket.
  await prisma.expenseCategory.upsert({ where: { name: "Sales incentives" }, update: {}, create: { name: "Sales incentives", bucketKey: "incentive", sortOrder: 90 } });
  for (const [key, value, label, unit, description] of [
    ["incentiveSellerPct", "8", "Seller's incentive", "%", "Of the qualifying service (first service of a new client), excluding GST"],
    ["incentiveManagerPct", "2", "Manager's incentive", "%", "Of their team's qualifying services"],
    ["incentiveHoldDays", "30", "Hold before payout", "days", "After the client's payment, before the incentive moves to the next pay run"],
  ]) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value, label, unit, description, group: "Sales incentives" } });
  }

  for (const [i, n] of niches.entries()) {
    await prisma.leadNiche.upsert({ where: { key: n.key }, update: {}, create: { market: "IN", bookingRelevant: false, ...n, sortOrder: i } });
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
  // The final allocation (Oct 2026) and the subcategories: active on a new database.
  await applyFinalAllocation(prisma, console.log);

  const email = (process.env.SEED_ADMIN_EMAIL || "admin@genclover.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe@2026";
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Gen Clover Admin", email, role: "OWNER", passwordHash: await bcrypt.hash(password, 10) },
  });

  // One test account per role, for trying out what each role sees. Never in production.
  const roleUsers: [string, string, string, string][] = [
    ["ADMIN", "Test Admin", "admin-role@genclover.local", "AdminRole@Gc2026"],
    ["CFO", "Test CFO", "cfo@genclover.local", "Cfo@Gc2026"],
    ["SALES_MANAGER", "Test Sales Manager", "salesmanager@genclover.local", "SalesMgr@Gc2026"],
    ["SALES", "Test Sales", "sales@genclover.local", "Sales@Gc2026"],
    ["ONBOARDING", "Test Onboarding", "onboarding@genclover.local", "Onboard@Gc2026"],
    ["DELIVERY", "Test Delivery Manager", "delivery@genclover.local", "Delivery@Gc2026"],
    ["TEAM", "Test Team Member", "team@genclover.local", "Team@Gc2026"],
    ["HR", "Test HR", "hr@genclover.local", "Hr@Gc2026"],
    ["ACCOUNTANT", "Test Accountant (CA)", "ca@genclover.local", "Ca@Gc2026"],
  ];
  if (process.env.NODE_ENV !== "production") {
    for (const [role, name, userEmail, userPassword] of roleUsers) {
      await prisma.user.upsert({ where: { email: userEmail }, update: {}, create: { name, email: userEmail, role, passwordHash: await bcrypt.hash(userPassword, 10) } });
    }
    // The team member logs hours as this People record (matched by email). No salary, so it adds no cost.
    if (!(await prisma.person.findFirst({ where: { email: "team@genclover.local" } }))) {
      await prisma.person.create({ data: { name: "Test Team Member", email: "team@genclover.local", title: "Developer", costInr: 0, notes: "Test account for the Team member role. Safe to delete." } });
    }
    // The test seller reports to the test sales manager; both on incentives only, with People records for pay runs.
    const [seller, manager] = await Promise.all([prisma.user.findUnique({ where: { email: "sales@genclover.local" } }), prisma.user.findUnique({ where: { email: "salesmanager@genclover.local" } })]);
    for (const u of [manager, seller]) {
      if (!u || (await prisma.salesMember.findUnique({ where: { userId: u.id } }))) continue;
      const person =
        (await prisma.person.findFirst({ where: { email: u.email } })) ??
        (await prisma.person.create({ data: { name: u.name, email: u.email, title: u.id === manager?.id ? "Sales manager" : "Sales", department: "Sales", payModel: "COMMISSION", costInr: 0, notes: "Test account for incentives. Safe to delete." } }));
      await prisma.salesMember.create({
        data: {
          userId: u.id,
          userName: u.name,
          personId: person.id,
          onIncentive: true,
          // The test manager may run searches and hand out the pool, but not move leads (the owner allows that).
          ...(u.id === manager?.id ? { canGenerateLeads: true } : {}),
          ...(u.id === seller?.id && manager ? { managerUserId: manager.id, managerName: manager.name } : {}),
        },
      });
    }
  }

  // Gen Clover itself, as a client: products and internal work (bench, R&D, admin) are projects under it, so their
  // cost is tracked apart from client work. Code GCL.
  if (!(await prisma.client.findUnique({ where: { code: "GCL" } }))) {
    const year = new Date().getFullYear();
    const seq = await prisma.sequence.upsert({ where: { key: `client:${year}` }, create: { key: `client:${year}`, value: 1 }, update: { value: { increment: 1 } } });
    await prisma.client.create({
      data: { number: `GC-${year}-${String(seq.value).padStart(4, "0")}`, code: "GCL", name: "Gen Clover (internal)", country: "India", currency: "INR", status: "ACTIVE", notes: "Internal: Gen Clover products, bench, R&D and admin time." },
    });
  }

  // Compliance calendar for an Indian private limited company: a starting list. Due dates roll forward when each
  // filing is marked done. Confirm the exact applicability and dates with the CA / CS.
  if ((await prisma.complianceItem.count()) === 0) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const next = (day: number, monthOffset = 0) => {
      let d = new Date(Date.UTC(y, m + monthOffset, day));
      if (d < now) d = new Date(Date.UTC(y, m + monthOffset + 1, day));
      return d;
    };
    const nextOf = (months: number[], day: number) => {
      for (let i = 0; i < 24; i++) {
        const d = new Date(Date.UTC(y, m + i, day));
        if (months.includes(d.getUTCMonth() + 1) && d >= now) return d;
      }
      return next(day);
    };
    const items: { name: string; category: string; authority: string; frequency: string; dueDate: Date; notes?: string; remindDays?: number }[] = [
      { name: "GSTR-1 (outward supplies)", category: "GST", authority: "GST portal", frequency: "MONTHLY", dueDate: next(11), notes: "Invoices of the previous month. Quarterly (QRMP) if eligible." },
      { name: "GSTR-3B (summary return and GST payment)", category: "GST", authority: "GST portal", frequency: "MONTHLY", dueDate: next(20) },
      { name: "LUT renewal (export of services without IGST)", category: "GST", authority: "GST portal", frequency: "YEARLY", dueDate: nextOf([3], 31), notes: "File the LUT for the next financial year before 1 April.", remindDays: 21 },
      { name: "GSTR-9 annual return", category: "GST", authority: "GST portal", frequency: "YEARLY", dueDate: nextOf([12], 31), notes: "If applicable for the turnover." },
      { name: "TDS / TCS payment (challan 281)", category: "TDS", authority: "Income Tax", frequency: "MONTHLY", dueDate: next(7), notes: "TDS withheld last month on salaries and contractors (see the pay run)." },
      { name: "TDS return 24Q / 26Q", category: "TDS", authority: "TRACES / Income Tax", frequency: "QUARTERLY", dueDate: nextOf([7, 10, 1, 5], 31), notes: "Quarterly; Q4 due 31 May." },
      { name: "Form 16 / 16A to employees and contractors", category: "TDS", authority: "TRACES", frequency: "YEARLY", dueDate: nextOf([6], 15) },
      { name: "Advance tax instalment", category: "INCOME_TAX", authority: "Income Tax", frequency: "QUARTERLY", dueDate: nextOf([6, 9, 12, 3], 15), notes: "15 Jun, 15 Sep, 15 Dec, 15 Mar." },
      { name: "Income tax return (ITR-6) and tax audit if applicable", category: "INCOME_TAX", authority: "Income Tax", frequency: "YEARLY", dueDate: nextOf([10], 31), remindDays: 30 },
      { name: "Statutory audit of financial statements", category: "MCA", authority: "Auditor", frequency: "YEARLY", dueDate: nextOf([9], 30), remindDays: 30 },
      { name: "Annual general meeting (AGM)", category: "BOARD", authority: "Companies Act", frequency: "YEARLY", dueDate: nextOf([9], 30), remindDays: 30 },
      { name: "AOC-4 (financial statements to ROC)", category: "MCA", authority: "MCA portal", frequency: "YEARLY", dueDate: nextOf([10], 29), notes: "Within 30 days of the AGM." },
      { name: "MGT-7 / MGT-7A (annual return)", category: "MCA", authority: "MCA portal", frequency: "YEARLY", dueDate: nextOf([11], 28), notes: "Within 60 days of the AGM." },
      { name: "DIR-3 KYC for each director", category: "MCA", authority: "MCA portal", frequency: "YEARLY", dueDate: nextOf([9], 30) },
      { name: "ADT-1 (auditor appointment)", category: "MCA", authority: "MCA portal", frequency: "ONE_OFF", dueDate: nextOf([10], 14), notes: "Within 15 days of the AGM where the auditor is appointed." },
      { name: "Board meeting (at least one per quarter)", category: "BOARD", authority: "Companies Act", frequency: "QUARTERLY", dueDate: nextOf([6, 9, 12, 3], 30), notes: "Gap between two meetings must not exceed 120 days. Record decisions in the register." },
      { name: "PF and ESI contributions", category: "PAYROLL", authority: "EPFO / ESIC", frequency: "MONTHLY", dueDate: next(15), notes: "Once registered (20+ employees for PF, 10+ for ESI)." },
      { name: "Professional tax (state)", category: "PAYROLL", authority: "State", frequency: "MONTHLY", dueDate: next(15), notes: "If your state levies it; check the due date with the CA." },
      { name: "Business insurance review (professional indemnity, cyber)", category: "INSURANCE", authority: "Insurer", frequency: "YEARLY", dueDate: nextOf([3], 31), remindDays: 30 },
    ];
    for (const it of items) await prisma.complianceItem.create({ data: { remindDays: 7, ...it, notes: it.notes ?? null } });
  }

  // Sample client + project = the md "Sample Monthly Retainer (160 hrs)"
  if ((await prisma.project.count()) === 0 && (await prisma.client.count()) === 0) {
    // Readable IDs as packages/ids would hand them out, with their counters (GC-YYYY-0001, SAM-P01).
    const year = new Date().getFullYear();
    const client = await prisma.client.create({
      data: { number: `GC-${year}-0001`, code: "SAM", name: "Sample Client Inc.", contactName: "Jane Doe", email: "jane@example.com", country: "USA", city: "Austin, TX", timezone: "America/Chicago", notes: "Demo record seeded from the rate card sample retainer." },
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
    await prisma.sequence.upsert({ where: { key: `client:${year}` }, create: { key: `client:${year}`, value: 1 }, update: {} });
    await prisma.sequence.upsert({ where: { key: `project:${client.id}` }, create: { key: `project:${client.id}`, value: 1 }, update: {} });
    await prisma.project.create({
      data: {
        code: "SAM-P01",
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

  console.log(`Seed complete. Owner login: ${email} / ${password}`);
  if (process.env.NODE_ENV !== "production") for (const [role, , userEmail, userPassword] of roleUsers) console.log(`  ${role}: ${userEmail} / ${userPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
