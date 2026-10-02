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
  owner: string; // "" | none | a user id
  stuck: string; // "" | 1
  sort: string; // score | newest | name | followup | google
  page: number;
};

/** meId: the signed-in user, so "owner=me" in a link means whoever opens it. */
export function parseFilters(sp: Record<string, string | string[] | undefined>, meId?: string): LeadFilters {
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
    owner: one("owner") === "me" ? (meId ?? "") : /^[\w-]{1,40}$/.test(one("owner")) ? one("owner") : "",
    stuck: one("stuck") === "1" ? "1" : "",
    sort: one("sort") || "score",
    page: Math.max(1, Number(one("page")) || 1),
  };
}

export type StuckDays = { stuckRepliedDays: number; stuckMeetingDays: number; stuckProposalDays: number };
/** The settings the filters need: hot / warm score lines and the "stuck" days. */
export type FilterSettings = StuckDays & { hotScore: number; warmScore: number };

/**
 * "Stuck": in Replied, Call / meeting or Proposal sent longer than the set days, with no message since
 * and no call or meeting planned.
 */
export function stuckWhere(s: StuckDays, now = new Date()): Prisma.LeadWhereInput {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const rule = (stage: string, days: number): Prisma.LeadWhereInput => ({
    stage,
    stageChangedAt: { not: null, lt: ago(days) },
    OR: [{ lastContactAt: null }, { lastContactAt: { lt: ago(days) } }],
  });
  return {
    doNotContact: false,
    tasks: { none: { status: "OPEN" } },
    OR: [rule("REPLIED", s.stuckRepliedDays), rule("MEETING", s.stuckMeetingDays), rule("PROPOSAL", s.stuckProposalDays)],
  };
}

export const scoreField = (f: LeadFilters) => f.service?.field ?? "bestScore";

/** Where clause for everything except the service lens (the tabs count each service within it). */
export function baseWhere(f: LeadFilters, s: FilterSettings): Prisma.LeadWhereInput {
  const { hotScore: hot, warmScore: warm } = s;
  const and: Prisma.LeadWhereInput[] = [];
  if (f.owner === "none") and.push({ ownerId: null });
  else if (f.owner) and.push({ ownerId: f.owner });
  if (f.stuck) and.push(stuckWhere(s));
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
export function listWhere(f: LeadFilters, s: FilterSettings): Prisma.LeadWhereInput {
  const base = baseWhere(f, s);
  return f.service ? { AND: [base, { [f.service.field]: { gt: 0 } }] } : base;
}

export function orderBy(f: LeadFilters): Prisma.LeadOrderByWithRelationInput[] {
  if (f.sort === "newest") return [{ createdAt: "desc" }];
  if (f.sort === "name") return [{ name: "asc" }];
  if (f.sort === "google") return [{ googleFetchedAt: "asc" }];
  if (f.sort === "followup") return [{ nextFollowUpAt: "asc" }, { [scoreField(f)]: "desc" }];
  return [{ [scoreField(f)]: "desc" }, { reviewCount: "desc" }];
}
