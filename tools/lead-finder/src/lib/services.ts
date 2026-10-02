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

export const STAGES = ["NEW", "QUALIFIED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "SNOOZED", "WON", "LOST", "NOT_A_FIT"] as const;
export const STAGE_LABEL: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  MEETING: "Call / meeting",
  PROPOSAL: "Proposal sent",
  SNOOZED: "Not now (snoozed)",
  WON: "Won",
  LOST: "Lost",
  NOT_A_FIT: "Not a fit",
};
/** Stages where nobody is working the lead any more. */
export const CLOSED_STAGES = ["WON", "LOST", "NOT_A_FIT"];
/** Being worked right now (Today queue, "Open" filter). Snoozed leads wait for their date instead. */
export const OPEN_STAGES = STAGES.filter((s) => !CLOSED_STAGES.includes(s) && s !== "SNOOZED");
/** Stages after a reply: the automatic follow-up sequence stops here. */
export const ENGAGED_STAGES = ["REPLIED", "MEETING", "PROPOSAL"];

export const SOURCES: Record<string, string> = {
  MAPS: "Google Maps search",
  MANUAL: "Added by hand",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  WARM: "Warm network",
  LINKEDIN: "LinkedIn",
  IMPORT: "Imported list (CSV)",
  INBOUND: "Inbound enquiry (website, email)",
  EVENT: "Event / conference",
  PARTNER: "Partner",
};
export const LOST_REASONS = ["Price", "Timing / not now", "No reply", "Not interested", "Went with someone else", "Built it themselves", "Other"];
export const NOT_FIT_REASONS = ["Too small", "Wrong niche", "Big chain / franchise", "Closed or moved", "Duplicate", "Already a client", "Other"];
export const WIN_REASONS = ["Liked the preview / demo", "Price / value", "Speed (7-day delivery)", "Trust / referral", "Fast follow-up", "Other"];

/** How a reply is sorted; each has suggested answers (lib/replies.ts) and a next step. */
export const REPLY_CATEGORIES: Record<string, { label: string; hint: string }> = {
  INTERESTED: { label: "Interested", hint: "Book a call or send the preview" },
  PRICE: { label: "Asked for price / details", hint: "Send the package and price, offer a call" },
  NOT_NOW: { label: "Not now", hint: "Snooze until the date they gave" },
  NOT_INTERESTED: { label: "Not interested", hint: "Close as Lost; thank them" },
  WRONG_PERSON: { label: "Wrong person", hint: "Ask who handles it; update the contact" },
};

/** Packages by market (strategy doc, section 2). Names only: prices live with owners (see roadmap: access). */
export const PACKAGES = ["Starter", "Growth", "Premium", "Custom"];
export const CARE_PLANS = ["None", "Care Basic", "Care Plus", "Care Pro"];
export const ADD_ONS = [
  "Extra pages",
  "Ad landing page",
  "Forms to Sheet / CRM",
  "Analytics & pixels",
  "Google Business Profile setup",
  "Online booking",
  "Razorpay / payments",
  "WhatsApp bot",
  "AI assistant",
  "Second language",
  "Speed & SEO audit",
];

export const TASK_TYPES: Record<string, string> = { CALL: "Call back", MEETING: "Meeting (video)", VISIT: "Visit" };
export const MEETING_OUTCOMES: Record<string, string> = {
  PROPOSAL: "Send a proposal",
  THINKING: "They'll think about it",
  NOT_NOW: "Not now (snooze)",
  NOT_INTERESTED: "Not interested",
  NO_SHOW: "Didn't happen / no-show",
};


/** The follow-up sequence: message n goes this many days after the first message (strategy doc, section 7). */
export const SEQUENCE_DAYS = [0, 1, 3, 7];
export const STEP_LABEL = ["First message", "Follow-up 1 (day 1)", "Follow-up 2 (day 3)", "Last follow-up (day 7)"];
