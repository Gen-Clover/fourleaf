// Lead list filters, shared by the list page, bulk actions and the CSV export (same URL parameters).
import type { Prisma } from "@genclover/db";
import { isMarket } from "./markets";
import { isService, OPEN_STAGES, SERVICE, STAGES, type Service } from "./services";
import { endOfTodayIst } from "./time";

export type LeadFilters = {
  service: Service | null;
  market: string; // "" | IN | US
  stage: string; // OPEN | ALL | DNC | a stage
  temp: string; // "" | HOT | WARM | COLD
  niche: string;
  site: string; // "" | NONE | SOCIAL | DOWN | OK
  q: string;
  search: string;
  followUp: string; // "" | DUE
  /** Google data last updated between these dates (YYYY-MM-DD), or older than N days. */
  gFrom: string;
  gTo: string;
  gOlder: string;
  /** "" = hide other branches of the same business; "show" = list every branch. */
  branches: string;
  claude: string; // "" | HIGH | MEDIUM | LOW | NONE (not reviewed)
  sort: string; // score | newest | name | followup | google
  page: number;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const service = one("service");
  const market = one("market");
  return {
    service: isService(service) ? SERVICE[service] : null,
    market: isMarket(market) ? market : "",
    stage: one("stage") || "OPEN",
    temp: one("temp"),
    niche: one("niche"),
    site: one("site"),
    q: one("q").trim(),
    search: one("search"),
    followUp: one("followUp"),
    gFrom: /^\d{4}-\d{2}-\d{2}$/.test(one("gFrom")) ? one("gFrom") : "",
    gTo: /^\d{4}-\d{2}-\d{2}$/.test(one("gTo")) ? one("gTo") : "",
    gOlder: /^\d{1,3}$/.test(one("gOlder")) ? one("gOlder") : "",
    branches: one("branches") === "show" ? "show" : "",
    claude: ["HIGH", "MEDIUM", "LOW", "NONE"].includes(one("claude")) ? one("claude") : "",
    sort: one("sort") || "score",
    page: Math.max(1, Number(one("page")) || 1),
  };
}

export const scoreField = (f: LeadFilters) => f.service?.field ?? "bestScore";

/** Where clause for everything except the service lens (the tabs count each service within it). */
export function baseWhere(f: LeadFilters, hot: number, warm: number): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (f.stage === "OPEN") and.push({ stage: { in: [...OPEN_STAGES] }, doNotContact: false });
  else if (f.stage === "DNC") and.push({ doNotContact: true });
  else if ((STAGES as readonly string[]).includes(f.stage)) and.push({ stage: f.stage });
  if (f.market) and.push({ market: f.market });
  if (f.niche) and.push({ nicheKey: f.niche });
  if (f.site) and.push({ siteState: f.site });
  if (f.search) and.push({ hits: { some: { searchId: f.search } } });
  if (!f.branches) and.push({ branchOfId: null });
  // "not: null": MongoDB orders a missing date before every date, so lte alone would match leads with none.
  // Due = today or overdue (IST), the same as the dashboard and the Today queue.
  if (f.followUp === "DUE") and.push({ nextFollowUpAt: { not: null, lte: endOfTodayIst() } });
  if (f.sort === "followup") and.push({ nextFollowUpAt: { not: null } });
  if (f.gFrom || f.gTo || f.gOlder) {
    const range: Prisma.DateTimeNullableFilter = { not: null };
    if (f.gFrom) range.gte = new Date(`${f.gFrom}T00:00:00+05:30`);
    if (f.gTo) range.lt = new Date(new Date(`${f.gTo}T00:00:00+05:30`).getTime() + 86_400_000);
    if (f.gOlder) range.lt = new Date(Date.now() - Number(f.gOlder) * 86_400_000);
    and.push({ googleFetchedAt: range });
  }
  if (f.claude === "NONE") and.push({ claudeAt: null });
  else if (f.claude) and.push({ claudeFit: f.claude });
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    and.push({ OR: [{ name: contains }, { code: contains }, { area: contains }, { address: contains }, { phone: contains }, { website: contains }, { email: contains }] });
  }
  const field = scoreField(f);
  if (f.temp === "HOT") and.push({ [field]: { gte: hot } });
  else if (f.temp === "WARM") and.push({ [field]: { gte: warm, lt: hot } });
  else if (f.temp === "COLD") and.push({ [field]: { gt: 0, lt: warm } });
  return and.length ? { AND: and } : {};
}

/** With the service lens: only leads that have an opportunity for that service. */
export function listWhere(f: LeadFilters, hot: number, warm: number): Prisma.LeadWhereInput {
  const base = baseWhere(f, hot, warm);
  return f.service ? { AND: [base, { [f.service.field]: { gt: 0 } }] } : base;
}

export function orderBy(f: LeadFilters): Prisma.LeadOrderByWithRelationInput[] {
  if (f.sort === "newest") return [{ createdAt: "desc" }];
  if (f.sort === "name") return [{ name: "asc" }];
  if (f.sort === "google") return [{ googleFetchedAt: "asc" }];
  if (f.sort === "followup") return [{ nextFollowUpAt: "asc" }, { [scoreField(f)]: "desc" }];
  return [{ [scoreField(f)]: "desc" }, { reviewCount: "desc" }];
}
