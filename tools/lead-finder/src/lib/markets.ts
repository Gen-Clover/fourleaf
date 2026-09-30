// Markets: where a lead is, which prices and message style apply, and its local time.
// To add a country: add an entry here and niches with that market (Lead Finder → Settings).
import type { ServiceKey } from "./services";

export type MarketKey = "IN" | "US";

export type Market = {
  key: MarketKey;
  label: string;
  /** Google regionCode for searches. */
  region: string;
  /** Email first (WhatsApp is rare for US businesses); India is WhatsApp first. */
  emailFirst: boolean;
  /** Business hours (local) for sending messages automatically. */
  hours: [number, number];
  country: string;
  /** What each service costs in this market (quoted in messages and on lead pages). */
  offers: Record<ServiceKey, string>;
};

export const MARKETS: Record<MarketKey, Market> = {
  IN: {
    key: "IN",
    label: "India",
    region: "IN",
    emailFirst: false,
    hours: [10, 18],
    country: "India",
    // Strategy doc, section 2 (prices + 18% GST)
    offers: {
      NEW_WEBSITE: "Starter / Growth / Premium, ₹30–50K + GST",
      REDESIGN: "Growth / Premium, ₹40–50K + GST",
      LEAD_CAPTURE: "Forms ₹2,500 · WhatsApp bot ₹10–15K",
      GOOGLE_PROFILE: "Profile setup & optimisation ₹3,000",
      SEO_SPEED: "Speed and SEO audit with fixes ₹7,500",
      BOOKING: "Booking ₹5K · Razorpay ₹8–12K",
      AI_AUTOMATION: "AI assistant & automation, quoted per business",
    },
  },
  US: {
    key: "US",
    label: "USA",
    region: "US",
    emailFirst: true,
    hours: [9, 17],
    country: "USA",
    // Strategy doc: US sites $1,500–5,000, hourly $40–60; smaller items are those hours × rate.
    offers: {
      NEW_WEBSITE: "Website $1,500–5,000",
      REDESIGN: "Redesign $1,500–5,000",
      LEAD_CAPTURE: "Forms & chat from $300",
      GOOGLE_PROFILE: "Profile setup from $250",
      SEO_SPEED: "Speed & SEO fixes from $600",
      BOOKING: "Online booking from $400",
      AI_AUTOMATION: "AI assistant & automation, custom quote",
    },
  },
};

export const MARKET_KEYS = Object.keys(MARKETS) as MarketKey[];
export const isMarket = (k: string | null | undefined): k is MarketKey => !!k && k in MARKETS;
export const marketOf = (k: string | null | undefined) => MARKETS[isMarket(k) ? k : "IN"];

/** IANA time zone for a lead: IST in India; in the US, by longitude (good enough for send times). */
export function timeZoneFor(market: string, lng: number | null) {
  if (market !== "US") return "Asia/Kolkata";
  if (lng == null) return "America/New_York";
  if (lng > -87.5) return "America/New_York";
  if (lng > -101) return "America/Chicago";
  if (lng > -115) return "America/Denver";
  return "America/Los_Angeles";
}

/** The lead's local time now, e.g. { label: "9:40 AM CT", hour: 9, weekday: 2 }. */
export function localTime(market: string, lng: number | null, now = new Date()) {
  const timeZone = timeZoneFor(market, lng);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true, weekday: "short", timeZoneName: "short" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { label: `${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`, hour, weekday, timeZone };
}

/** Within the market's business hours on a weekday (for sending automatically). */
export function inBusinessHours(market: string, lng: number | null, now = new Date()) {
  const t = localTime(market, lng, now);
  const [from, to] = marketOf(market).hours;
  return t.weekday >= 1 && t.weekday <= 5 && t.hour >= from && t.hour < to;
}
