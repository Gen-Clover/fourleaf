// Google Places API (New) and PageSpeed Insights, with a monthly spend cap.
// Docs: developers.google.com/maps/documentation/places/web-service/text-search
// Every paid request is counted in ApiUsage before it is sent; if it would take this month's
// estimated spend past the cap, it isn't sent and BudgetError is thrown instead.
import { prisma } from "@genclover/db";
import type { Rect } from "./geo";
import { getLfSettings, type LfSettings } from "./settings";

export class BudgetError extends Error {
  constructor() {
    super("Monthly Google spend cap reached (Lead Finder → Settings)");
  }
}

export type Sku = "SEARCH" | "AREA" | "DETAILS";
const PRICING: Record<Sku, (s: LfSettings) => { price: number; free: number }> = {
  SEARCH: (s) => ({ price: s.searchPricePer1000, free: s.searchFreePerMonth }),
  AREA: (s) => ({ price: s.areaPricePer1000, free: s.areaFreePerMonth }),
  DETAILS: (s) => ({ price: s.detailsPricePer1000, free: s.detailsFreePerMonth }),
};

const month = (d = new Date()) => d.toISOString().slice(0, 7);
const usageKey = (sku: Sku) => `${month()}:${sku}`;

/** Requests this month per SKU and the estimated spend in US$ (after each SKU's free allowance). */
export async function monthUsage(s?: LfSettings) {
  const settings = s ?? (await getLfSettings());
  const rows = await prisma.apiUsage.findMany({ where: { key: { startsWith: `${month()}:` } } });
  const counts = { SEARCH: 0, AREA: 0, DETAILS: 0 } as Record<Sku, number>;
  for (const r of rows) {
    const sku = r.key.split(":")[1] as Sku;
    if (sku in counts) counts[sku] = r.count;
  }
  const spend = (Object.keys(counts) as Sku[]).reduce((sum, k) => {
    const { price, free } = PRICING[k](settings);
    return sum + (Math.max(0, counts[k] - free) * price) / 1000;
  }, 0);
  return { counts, spendUsd: spend, capUsd: settings.monthlyBudgetUsd };
}

/** Estimated US$ for `n` more requests of a SKU this month. */
export async function costOf(sku: Sku, n: number, s?: LfSettings) {
  const settings = s ?? (await getLfSettings());
  const { counts } = await monthUsage(settings);
  const { price, free } = PRICING[sku](settings);
  const billable = Math.max(0, counts[sku] + n - Math.max(free, counts[sku]));
  return (billable * price) / 1000;
}

async function reserve(sku: Sku) {
  const s = await getLfSettings();
  const { spendUsd } = await monthUsage(s);
  if (spendUsd + (await costOf(sku, 1, s)) > s.monthlyBudgetUsd + 1e-9) throw new BudgetError();
  const key = usageKey(sku);
  await prisma.apiUsage.upsert({ where: { key }, create: { key, count: 1 }, update: { count: { increment: 1 } } });
}

function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set in .env");
  return key;
}

async function places<T>(path: string, fieldMask: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://places.googleapis.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": fieldMask },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Google Places: ${json.error?.message ?? res.statusText}`);
  return json;
}

export type GPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: unknown;
  photos?: unknown[];
};

const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "primaryType",
  "googleMapsUri",
  "websiteUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "rating",
  "userRatingCount",
  "businessStatus",
  "regularOpeningHours",
  "photos",
];

const rectBody = (r: Rect) => ({ rectangle: { low: { latitude: r.south, longitude: r.west }, high: { latitude: r.north, longitude: r.east } } });

/** One page (up to 20) of places matching `phrase` inside `rect`. One Enterprise request. */
export async function searchPage(phrase: string, rect: Rect, market: string, pageToken?: string) {
  await reserve("SEARCH");
  return places<{ places?: GPlace[]; nextPageToken?: string }>("places:searchText", [...PLACE_FIELDS.map((f) => `places.${f}`), "nextPageToken"].join(","), {
    textQuery: phrase,
    pageSize: 20,
    pageToken,
    locationRestriction: rectBody(rect),
    languageCode: "en",
    regionCode: market,
  });
}

/** The map boundary of a place name ("Mohali", "Austin, TX"). One Pro request. */
export async function findArea(name: string, market: string) {
  await reserve("AREA");
  const res = await places<{ places?: { displayName?: { text: string }; formattedAddress?: string; viewport?: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } } }[] }>(
    "places:searchText",
    "places.displayName,places.formattedAddress,places.viewport",
    { textQuery: name, pageSize: 1, languageCode: "en", regionCode: market },
  );
  const p = res.places?.[0];
  if (!p?.viewport) return null;
  return {
    name: p.formattedAddress ?? p.displayName?.text ?? name,
    south: p.viewport.low.latitude,
    west: p.viewport.low.longitude,
    north: p.viewport.high.latitude,
    east: p.viewport.high.longitude,
  };
}

/** Fresh Google data for one place. One Enterprise request. */
export async function placeDetails(placeId: string) {
  await reserve("DETAILS");
  return places<GPlace>(`places/${encodeURIComponent(placeId)}`, PLACE_FIELDS.join(","));
}

/** Google PageSpeed mobile performance score 0–100 (free, 25,000 a day). */
export async function pageSpeed(url: string): Promise<number | null> {
  const q = new URLSearchParams({ url, strategy: "MOBILE", category: "PERFORMANCE" });
  if (process.env.GOOGLE_MAPS_API_KEY) q.set("key", process.env.GOOGLE_MAPS_API_KEY);
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(120_000) });
  const json = (await res.json().catch(() => ({}))) as { lighthouseResult?: { categories?: { performance?: { score?: number } } }; error?: { message?: string } };
  if (!res.ok) throw new Error(`PageSpeed: ${json.error?.message ?? res.statusText}`);
  const score = json.lighthouseResult?.categories?.performance?.score;
  return score == null ? null : Math.round(score * 100);
}
