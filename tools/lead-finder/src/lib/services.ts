// The services Gen Clover sells to local businesses. A search collects businesses once; each service
// then ranks the same leads by its own need score (lib/scoring.ts). Prices per market: lib/markets.ts.

export type ServiceKey = "NEW_WEBSITE" | "REDESIGN" | "LEAD_CAPTURE" | "GOOGLE_PROFILE" | "SEO_SPEED" | "BOOKING" | "AI_AUTOMATION";

export type Service = {
  key: ServiceKey;
  label: string;
  short: string;
  /** What it is, in one line (search form, reports). */
  about: string;
  /** Lead column holding this service's score. */
  field: "sNewWebsite" | "sRedesign" | "sLeadCapture" | "sGoogleProfile" | "sSeoSpeed" | "sBooking" | "sAiAutomation";
  /** Runs Google PageSpeed on the lead's site when a search is for this service. */
  speedTest?: boolean;
};

export const SERVICES: Service[] = [
  { key: "NEW_WEBSITE", label: "New website", short: "New site", about: "No website, a social page only, or a site that's down", field: "sNewWebsite" },
  { key: "REDESIGN", label: "Website redesign", short: "Redesign", about: "Old, slow, not secure or not built for phones", field: "sRedesign", speedTest: true },
  { key: "LEAD_CAPTURE", label: "WhatsApp & lead capture", short: "WhatsApp", about: "No WhatsApp button, form or tap-to-call", field: "sLeadCapture" },
  { key: "GOOGLE_PROFILE", label: "Google Business Profile", short: "Google profile", about: "Weak Google profile: no website link, hours, photos or reviews", field: "sGoogleProfile" },
  { key: "SEO_SPEED", label: "SEO & speed", short: "SEO & speed", about: "Slow on phones, missing titles, descriptions or sitemap", field: "sSeoSpeed", speedTest: true },
  { key: "BOOKING", label: "Booking & payments", short: "Booking", about: "Clinics, hotels and salons without online booking", field: "sBooking" },
  {
    key: "AI_AUTOMATION",
    label: "AI automation",
    short: "AI",
    about: "Busy businesses answering the same enquiries by hand: an AI assistant can reply and book 24/7",
    field: "sAiAutomation",
  },
];

export const SERVICE = Object.fromEntries(SERVICES.map((s) => [s.key, s])) as Record<ServiceKey, Service>;
export const isService = (k: string | null | undefined): k is ServiceKey => !!k && k in SERVICE;

export const STAGES = ["NEW", "QUALIFIED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON", "LOST", "NOT_A_FIT"] as const;
export const STAGE_LABEL: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  MEETING: "Call / meeting",
  PROPOSAL: "Proposal sent",
  WON: "Won",
  LOST: "Lost",
  NOT_A_FIT: "Not a fit",
};
/** Stages where nobody is working the lead any more. */
export const CLOSED_STAGES = ["WON", "LOST", "NOT_A_FIT"];
export const OPEN_STAGES = STAGES.filter((s) => !CLOSED_STAGES.includes(s));
/** Stages after a reply: the automatic follow-up sequence stops here. */
export const ENGAGED_STAGES = ["REPLIED", "MEETING", "PROPOSAL"];

export const SOURCES: Record<string, string> = { MAPS: "Google Maps search", MANUAL: "Added by hand", WALK_IN: "Walk-in", REFERRAL: "Referral", WARM: "Warm network" };
export const LOST_REASONS = ["Price", "Timing / not now", "No reply", "Already has a vendor", "Built it themselves", "Other"];

/** The follow-up sequence: message n goes this many days after the first message (strategy doc, section 7). */
export const SEQUENCE_DAYS = [0, 1, 3, 7];
export const STEP_LABEL = ["First message", "Follow-up 1 (day 1)", "Follow-up 2 (day 3)", "Last follow-up (day 7)"];
