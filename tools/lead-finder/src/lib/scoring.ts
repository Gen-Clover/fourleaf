// Lead scores, 0–100 per service = need (up to 60, from what the audit found) + ability to pay
// (up to 40, from reviews, rating, niche and ad spend). A service with no need scores 0, so it
// doesn't show in that service's list. Every point comes with a reason: the reasons become the
// outreach message, so they are written as something you can say to the business owner.
import type { ServiceKey } from "./services";

export type AuditFacts = {
  reachable: boolean;
  socialOnly: boolean;
  https: boolean;
  mobileViewport: boolean;
  hasWhatsApp: boolean;
  hasForm: boolean;
  hasTel: boolean;
  /** A phone number is written on the site, even if not as a tap-to-call link. */
  phoneShown: boolean;
  hasBooking: boolean;
  hasChatBot: boolean;
  hasFaq: boolean;
  title: string | null;
  metaDescription: boolean;
  hasH1: boolean;
  copyrightYear: number | null;
  platform: string | null;
  adsDetected: boolean;
  sitemap: boolean | null;
  psiMobile: number | null;
  error: string | null;
  /** The page is built in the browser (empty HTML shell), so its content couldn't be checked. */
  jsRendered: boolean;
};

export type LeadFacts = {
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  hasHours: boolean | null;
  photoCount: number | null;
  nicheValue: string | null; // HIGH | MEDIUM | LOW
  bookingRelevant: boolean;
  /** true when the Google fields are known (Maps leads); manual leads skip Google-profile scoring. */
  fromGoogle: boolean;
  /** Locations of the same business (1 = single location). */
  branchCount: number;
};

export type Reason = { service: ServiceKey | "ABILITY"; points: number; text: string };
export type Scores = Record<ServiceKey, number> & { ability: number; best: number; bestService: ServiceKey | null; reasons: Reason[] };

const OLD_PLATFORMS = ["Blogspot", "Google Sites", "Joomla", "Drupal 7"];

export function scoreLead(lead: LeadFacts, audit: AuditFacts | null, now = new Date()): Scores {
  const reasons: Reason[] = [];
  const need: Record<ServiceKey, number> = { NEW_WEBSITE: 0, REDESIGN: 0, LEAD_CAPTURE: 0, GOOGLE_PROFILE: 0, SEO_SPEED: 0, BOOKING: 0, AI_AUTOMATION: 0 };
  const add = (service: ServiceKey, points: number, text: string) => {
    need[service] += points;
    reasons.push({ service, points, text });
  };

  // Website: none, social-only, broken, or working (then look inside).
  const site = audit?.reachable && !audit.socialOnly;
  if (!lead.website) add("NEW_WEBSITE", 60, "No website: people who search for you on Google find nothing to click");
  else if (audit?.socialOnly) add("NEW_WEBSITE", 55, "Only a social media or directory page, no website of your own");
  else if (audit && !audit.reachable) add("NEW_WEBSITE", 45, `Your website doesn't open${audit.error ? ` (${audit.error})` : ""}`);

  if (site && audit) {
    if (!audit.https) add("REDESIGN", 15, 'Chrome shows your site as "Not secure" (no HTTPS)');
    if (!audit.mobileViewport) add("REDESIGN", 20, "Your site isn't built for phones, where most visitors are");
    if (audit.psiMobile != null && audit.psiMobile < 50) add("REDESIGN", 10, `Slow on phones: Google speed score ${audit.psiMobile}/100`);
    if (audit.copyrightYear && audit.copyrightYear <= now.getFullYear() - 4) add("REDESIGN", 10, `Looks unchanged since ${audit.copyrightYear}`);
    if (audit.platform && OLD_PLATFORMS.includes(audit.platform)) add("REDESIGN", 5, `Built on ${audit.platform}, which is dated`);

    if (audit.psiMobile != null) {
      if (audit.psiMobile < 50) add("SEO_SPEED", 25, `Google rates your mobile speed ${audit.psiMobile}/100`);
      else if (audit.psiMobile < 90) add("SEO_SPEED", 10, `Mobile speed ${audit.psiMobile}/100 could be better`);
    }

    // A page built in the browser is an empty shell to us: checking its content would give false alarms.
    if (!audit.jsRendered) {
      if (!audit.hasWhatsApp) add("LEAD_CAPTURE", 25, "No WhatsApp button, so visitors can't message you in one tap");
      if (!audit.hasForm) add("LEAD_CAPTURE", 20, "No enquiry form");
      if (!audit.hasTel) {
        if (audit.phoneShown) add("LEAD_CAPTURE", 5, "Your phone number isn't tap-to-call on mobile");
        else add("LEAD_CAPTURE", 15, "No phone number on the website");
      }

      if (!audit.title) add("SEO_SPEED", 15, "Pages have no title for Google to show");
      if (!audit.metaDescription) add("SEO_SPEED", 10, "No description for Google search results");
      if (audit.sitemap === false) add("SEO_SPEED", 10, "No sitemap to help Google find your pages");
      if (!audit.hasH1) add("SEO_SPEED", 5, "No main heading on the home page");

      if (lead.bookingRelevant && !audit.hasBooking) add("BOOKING", 45, "No online booking: patients and guests have to call to book");
    }
  }

  if (lead.fromGoogle) {
    if (!lead.website) add("GOOGLE_PROFILE", 20, "Your Google profile has no website link");
    if (lead.hasHours === false) add("GOOGLE_PROFILE", 15, "No opening hours on your Google profile");
    if (lead.photoCount != null && lead.photoCount < 5) add("GOOGLE_PROFILE", 10, "Few photos on your Google profile");
    if (lead.reviewCount != null && lead.reviewCount < 20) add("GOOGLE_PROFILE", 15, `Only ${lead.reviewCount} Google reviews`);
  }

  // AI automation: only for businesses busy enough that answering and booking by hand costs real staff time.
  const reviews = lead.reviewCount ?? 0;
  const busy = reviews >= 60 || lead.branchCount >= 2;
  if (busy) {
    if (reviews >= 150) add("AI_AUTOMATION", 20, `About ${reviews} Google reviews: a steady flow of enquiries every day`);
    else if (reviews >= 60) add("AI_AUTOMATION", 10, `${reviews} Google reviews: regular enquiries to answer`);
    if (lead.branchCount >= 2) add("AI_AUTOMATION", 15, `${lead.branchCount} branches: the same questions and bookings repeat at each one`);
    const checked = site && audit && !audit.jsRendered;
    if (!lead.website || (checked && !audit.hasBooking)) add("AI_AUTOMATION", 10, "Appointments are booked by phone, which ties up your staff");
    if (checked && !audit.hasChatBot) add("AI_AUTOMATION", 10, "No assistant answers questions after hours or when the line is busy");
    if (checked && audit.hasFaq) add("AI_AUTOMATION", 5, "Customers ask the same questions often (you keep an FAQ)");
    if (audit?.adsDetected) add("AI_AUTOMATION", 10, "You pay for ads, so every slow reply wastes that spend");
  }

  // Ability to pay. Nearly every business on Google is rated 4.5+, so rating and niche count for little;
  // review volume (how busy they are) and ad spend matter most.
  let ability = 0;
  const addAbility = (points: number, text: string) => {
    ability += points;
    reasons.push({ service: "ABILITY", points, text });
  };
  if (reviews >= 200) addAbility(20, `Very busy: ${reviews} Google reviews`);
  else if (reviews >= 100) addAbility(15, `Busy: ${reviews} Google reviews`);
  else if (reviews >= 40) addAbility(10, `${reviews} Google reviews`);
  else if (reviews >= 15) addAbility(5, `${reviews} Google reviews`);
  if ((lead.rating ?? 0) >= 4.5 && reviews >= 50) addAbility(5, `Well rated: ${lead.rating}★`);
  if (lead.nicheValue === "HIGH") addAbility(5, "High-value niche: each customer is worth a lot");
  else if (lead.nicheValue === "MEDIUM") addAbility(3, "Mid-value niche");
  if (lead.branchCount >= 2) addAbility(5, `${lead.branchCount} locations`);
  if (audit?.adsDetected) addAbility(10, "Already pays for Google or Meta ads");
  ability = Math.min(ability, 40);

  const scores = {} as Record<ServiceKey, number>;
  let best = 0;
  let bestService: ServiceKey | null = null;
  for (const k of Object.keys(need) as ServiceKey[]) {
    scores[k] = need[k] > 0 ? Math.min(need[k], 60) + ability : 0;
    if (scores[k] > best) [best, bestService] = [scores[k], k];
  }
  return { ...scores, ability, best, bestService, reasons };
}

export type Temperature = "HOT" | "WARM" | "COLD";
export const temperature = (score: number, hot: number, warm: number): Temperature | null =>
  score <= 0 ? null : score >= hot ? "HOT" : score >= warm ? "WARM" : "COLD";
export const TEMPERATURE_LABEL: Record<Temperature, string> = { HOT: "🔥 Hot", WARM: "Warm", COLD: "Cold" };
