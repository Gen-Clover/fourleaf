// Company accounts (B2B) and opportunities: industries, services Gen Clover sells to companies, stages and
// engagement models. Safe for server and client.

export const INDUSTRIES = [
  "Healthcare", "Pharma & life sciences", "Manufacturing", "Education & edtech", "Retail & e-commerce", "Financial services & fintech",
  "Insurance", "Real estate & construction", "Logistics & supply chain", "Hospitality & travel", "Food & beverage", "Professional services",
  "Legal", "Media & entertainment", "Marketing & advertising", "Technology & SaaS", "Telecom", "Automotive", "Energy & utilities",
  "Agriculture", "Government & public sector", "Non-profit", "Beauty & wellness", "Fitness & sports", "Other",
];

export const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,000+"];

/** What Gen Clover sells to companies. The seven local-business services (website, SEO…) are in services.ts. */
export const B2B_SERVICES: Record<string, string> = {
  WEB_APP: "Web application",
  WEBSITE: "Website",
  MOBILE_APP: "Mobile app",
  ECOMMERCE: "E-commerce",
  AI_AUTOMATION: "AI & automation",
  DATA_MIGRATION: "Data migration",
  DATA_ANALYTICS: "Data & analytics / BI",
  INTEGRATIONS: "Integrations & APIs",
  CRM_ERP: "CRM / ERP",
  CLOUD_DEVOPS: "Cloud & DevOps",
  UI_UX: "UI / UX design",
  QA_TESTING: "QA & testing",
  DEDICATED_TEAM: "Dedicated developers",
  MAINTENANCE: "Maintenance & support",
  SEO_MARKETING: "SEO & digital marketing",
  CONSULTING: "Tech consulting",
};
export const serviceLabel = (k: string) => B2B_SERVICES[k] ?? k;

/** How the work would be sold; mirrors the engagement models in Finance. */
export const OPP_MODELS: Record<string, string> = {
  FIXED_SCOPE: "Fixed scope and price",
  DEDICATED: "Dedicated resources (monthly)",
  TM: "Time & materials (hourly)",
  MAINTENANCE: "Maintenance / support plan",
  PRODUCT: "Product licence / implementation",
};

/** Open stages in order, with the default chance of winning (for the weighted forecast). */
export const OPP_STAGES: Record<string, { label: string; probability: number; open: boolean }> = {
  DISCOVERY: { label: "Discovery", probability: 10, open: true },
  QUALIFIED: { label: "Qualified (need, budget, decision maker, timeline)", probability: 25, open: true },
  PROPOSAL: { label: "Proposal sent", probability: 50, open: true },
  NEGOTIATION: { label: "Negotiation", probability: 75, open: true },
  ON_HOLD: { label: "On hold", probability: 10, open: false },
  WON: { label: "Won", probability: 100, open: false },
  LOST: { label: "Lost", probability: 0, open: false },
};
export const OPEN_OPP_STAGES = Object.entries(OPP_STAGES).filter(([, v]) => v.open).map(([k]) => k);

/** Import sources, and the column names each one uses (lower-case, matched loosely). */
export const IMPORT_SOURCES: Record<string, string> = {
  LINKEDIN: "LinkedIn (Sales Navigator / Recruiter export, or copied by hand)",
  APOLLO: "Apollo / ZoomInfo / Lusha export",
  CSV: "Any spreadsheet (CSV)",
};

export const IMPORT_FIELDS: { key: string; label: string; required?: boolean; aliases: string[] }[] = [
  { key: "company", label: "Company", required: true, aliases: ["company", "company name", "account name", "organization", "organisation", "business", "company_name", "current company"] },
  { key: "website", label: "Website", aliases: ["website", "company website", "domain", "company domain", "url", "web"] },
  { key: "industry", label: "Industry", aliases: ["industry", "sector", "vertical", "company industry"] },
  { key: "companySize", label: "Company size", aliases: ["company size", "employees", "# employees", "headcount", "size", "employee count"] },
  { key: "city", label: "City / location", aliases: ["city", "location", "company city", "geography", "region", "hq"] },
  { key: "country", label: "Country", aliases: ["country", "company country"] },
  { key: "companyLinkedin", label: "Company LinkedIn", aliases: ["company linkedin", "company linkedin url", "linkedin company", "company li"] },
  { key: "firstName", label: "Contact first name", aliases: ["first name", "firstname", "first_name", "given name"] },
  { key: "lastName", label: "Contact last name", aliases: ["last name", "lastname", "last_name", "surname", "family name"] },
  { key: "fullName", label: "Contact full name", aliases: ["name", "full name", "contact name", "contact", "person"] },
  { key: "title", label: "Contact title", aliases: ["title", "job title", "designation", "position", "role", "headline"] },
  { key: "email", label: "Contact email", aliases: ["email", "email address", "work email", "e-mail", "business email"] },
  { key: "phone", label: "Contact phone", aliases: ["phone", "phone number", "mobile", "work phone", "contact phone", "direct phone"] },
  { key: "linkedin", label: "Contact LinkedIn", aliases: ["linkedin", "linkedin url", "profile url", "person linkedin url", "linkedin profile", "li url"] },
  { key: "services", label: "Services they may need", aliases: ["services", "service", "interest", "need", "needs"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "description"] },
];

/** Guess the mapping from a CSV header row: field key → column index. */
export function guessMapping(header: string[]) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const map: Record<string, number> = {};
  for (const f of IMPORT_FIELDS) {
    const i = norm.findIndex((h) => f.aliases.includes(h));
    if (i >= 0 && !Object.values(map).includes(i)) map[f.key] = i;
  }
  return map;
}

/** A small CSV parser: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Match loosely typed service names ("web app", "AI") to service keys. */
export function matchServices(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.toLowerCase();
  return Object.entries(B2B_SERVICES)
    .filter(([k, label]) => t.includes(label.toLowerCase()) || t.includes(k.toLowerCase().replace(/_/g, " ")) || (k === "AI_AUTOMATION" && /\bai\b|automation/.test(t)))
    .map(([k]) => k);
}

/** The website's host, for spotting duplicates: "https://www.Abc.com/x" → "abc.com". */
export const hostOf = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};
