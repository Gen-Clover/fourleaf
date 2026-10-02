import { prisma } from "@genclover/db";

export type LfSettings = {
  monthlyBudgetUsd: number;
  searchPricePer1000: number;
  searchFreePerMonth: number;
  areaPricePer1000: number;
  areaFreePerMonth: number;
  detailsPricePer1000: number;
  detailsFreePerMonth: number;
  cellKm: number;
  minCellKm: number;
  hotScore: number;
  warmScore: number;
  /** New leads at or above this score, with a phone or email, become Qualified automatically. 0 = off. */
  autoQualifyScore: number;
  /** Businesses with this many branches or more are marked "Not a fit" (big chains). 0 = off. */
  chainBranches: number;
  /** Speed tests run each night on the best leads with websites. 0 = off. */
  nightlySpeedTests: number;
  /** First messages the "Today" queue offers per day, on top of due follow-ups. */
  dailyNewContacts: number;
  /** Most emails the portal sends in a day (protects the sending domain). */
  emailDailyLimit: number;
  /** 1 = the worker sends email follow-ups on its own (after a person sent the first message). */
  autoEmailFollowUps: number;
  /** Days after the last follow-up with no reply before the lead is closed as Lost (No reply). 0 = off. */
  noReplyDays: number;
  /** A lead is "stuck" after this many days in the stage with nothing happening. */
  stuckRepliedDays: number;
  stuckMeetingDays: number;
  stuckProposalDays: number;
};

const DEFAULTS: LfSettings = {
  monthlyBudgetUsd: 10,
  searchPricePer1000: 35,
  searchFreePerMonth: 1000,
  areaPricePer1000: 32,
  areaFreePerMonth: 5000,
  detailsPricePer1000: 20,
  detailsFreePerMonth: 1000,
  cellKm: 4,
  minCellKm: 0.5,
  hotScore: 70,
  warmScore: 45,
  autoQualifyScore: 85,
  chainBranches: 6,
  nightlySpeedTests: 40,
  dailyNewContacts: 30,
  emailDailyLimit: 40,
  autoEmailFollowUps: 0,
  noReplyDays: 7,
  stuckRepliedDays: 2,
  stuckMeetingDays: 3,
  stuckProposalDays: 7,
};

/** Lead Finder settings (Setting rows in the "Lead Finder" group, keys lfXxx). */
export async function getLfSettings(): Promise<LfSettings> {
  const rows = await prisma.setting.findMany({ where: { group: "Lead Finder" } });
  const s = { ...DEFAULTS };
  for (const r of rows) {
    const key = (r.key.slice(2, 3).toLowerCase() + r.key.slice(3)) as keyof LfSettings;
    const n = Number(r.value);
    if (key in s && r.type !== "text" && Number.isFinite(n)) s[key] = n;
  }
  return s;
}

/** Text settings (links, not numbers). */
export async function getLfTexts() {
  const rows = await prisma.setting.findMany({ where: { group: "Lead Finder", type: "text" } });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value.trim()]));
  return { bookingLink: m.lfBookingLink || null };
}

export const googleKeyConfigured = () => !!process.env.GOOGLE_MAPS_API_KEY;
