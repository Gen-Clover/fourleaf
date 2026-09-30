// Outreach messages, per market and step, written from each lead's own findings. WhatsApp messages
// are always sent by a person; emails can be sent from the portal (lib/email.ts adds the footer).
import type { MarketKey } from "./markets";
import type { Reason } from "./scoring";
import { SERVICE, type ServiceKey } from "./services";

/** What the conversation is about, in a few words. */
const TOPIC: Record<ServiceKey, string> = {
  NEW_WEBSITE: "a website for {business}",
  REDESIGN: "refreshing your website",
  LEAD_CAPTURE: "getting more enquiries from your website",
  GOOGLE_PROFILE: "your Google Business Profile",
  SEO_SPEED: "your website's speed and Google ranking",
  BOOKING: "online booking",
  AI_AUTOMATION: "an AI assistant for your enquiries and bookings",
};

const PITCH: Record<MarketKey, Record<ServiceKey, string>> = {
  IN: {
    NEW_WEBSITE: "We build websites that bring enquiries straight to your WhatsApp, live in 7 days.",
    REDESIGN: "We rebuild sites so they load fast on phones and turn visitors into enquiries, in about 7 days.",
    LEAD_CAPTURE: "We can add a WhatsApp button and an enquiry form that send every lead to your phone.",
    GOOGLE_PROFILE: "We set up Google Business Profiles so more nearby customers find and call you.",
    SEO_SPEED: "We fix speed and SEO issues so Google shows your site to more people.",
    BOOKING: "We can add online booking so customers book in a few taps, even after hours.",
    AI_AUTOMATION: "We build AI assistants that answer common questions and book appointments on WhatsApp and your website, 24/7, so your team spends less time on the phone.",
  },
  US: {
    NEW_WEBSITE: "We build fast, mobile-first websites for local businesses that turn searches into calls and booked appointments.",
    REDESIGN: "We rebuild sites so they load fast on phones and turn visitors into calls and bookings.",
    LEAD_CAPTURE: "We add click-to-call, text and short enquiry forms so no visitor leaves without a way to reach you.",
    GOOGLE_PROFILE: "We optimize Google Business Profiles so more nearby customers find and call you.",
    SEO_SPEED: "We fix speed and on-page SEO so Google shows your site to more local searchers.",
    BOOKING: "We add online booking so customers can book in a few clicks, even after hours.",
    AI_AUTOMATION: "We build AI assistants that answer common questions and book appointments on your website and by text, 24/7, so your front desk isn't stuck on the phone.",
  },
};

/** The concrete fix mentioned in the day-3 follow-up. */
const FIX: Record<ServiceKey, string> = {
  NEW_WEBSITE: "a simple website that sends every enquiry straight to your phone",
  REDESIGN: "a faster, phone-friendly home page with a clear 'call' and 'book' button",
  LEAD_CAPTURE: "a one-tap WhatsApp button and a short enquiry form",
  GOOGLE_PROFILE: "a complete Google profile with hours, photos and your website link",
  SEO_SPEED: "fixing page speed and the titles Google shows in search results",
  BOOKING: "an online booking button that works after hours",
  AI_AUTOMATION: "an assistant that answers the most common questions and books appointments automatically",
};

const OFFER: Record<ServiceKey, string> = {
  NEW_WEBSITE: "Can I send you a free preview of what your homepage could look like?",
  REDESIGN: "Can I send you a free preview of a refreshed homepage?",
  LEAD_CAPTURE: "Happy to show you how it works in a 5-minute call. Would that help?",
  GOOGLE_PROFILE: "Can I send you a short list of quick fixes for your profile?",
  SEO_SPEED: "Can I send you a free one-page report of what to fix?",
  BOOKING: "Can I show you a quick demo of how booking would look on your site?",
  AI_AUTOMATION: "Could I show you a 5-minute demo of how it would handle your usual questions?",
};

export type MessageInput = {
  service: ServiceKey;
  market: MarketKey;
  /** 0 = first message, 1–3 = follow-ups on day 1, 3 and 7. */
  step: number;
  business: string;
  /** "Dr. Sharma" when known; otherwise the greeting uses "{business} team". */
  person: string | null;
  area: string | null;
  reasons: Reason[];
  sender: string;
};

const fill = (s: string, business: string) => s.replace("{business}", business);

export function buildMessage(m: MessageInput): { subject: string; text: string } {
  const greet = m.person ?? `${m.business} team`;
  const topic = fill(TOPIC[m.service], m.business);
  const us = m.market === "US";
  const points = m.reasons
    .filter((r) => r.service === m.service && r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((r) => `• ${r.text}`);
  const sign = us ? `Best,\n${m.sender}\nGen Clover · genclover.com` : `${m.sender}, Gen Clover · genclover.com`;
  const subject0 = `${m.business}: ${SERVICE[m.service].label.toLowerCase()} idea`;

  if (m.step <= 0) {
    const intro = us
      ? `I came across ${m.business}${m.area ? ` in ${m.area}` : ""} and noticed a few things that may be costing you calls:`
      : `I'm ${m.sender} from Gen Clover, a web studio${m.area ? ` working with businesses in ${m.area}` : ""}. I looked at how ${m.business} shows up online and noticed:`;
    return { subject: subject0, text: [`Hi ${greet},`, "", intro, ...points, "", PITCH[m.market][m.service], OFFER[m.service], "", sign].join("\n") };
  }
  const subject = `Re: ${subject0}`;
  if (m.step === 1)
    return {
      subject,
      text: us
        ? `Hi ${greet},\n\nFollowing up on my note about ${topic}. Would a free preview be useful? It takes two minutes to look at.\n\n${sign}`
        : `Hi ${greet}, just checking you saw my message about ${topic}. Happy to send the free preview; it takes a couple of minutes to look at.\n\n${sign}`,
    };
  if (m.step === 2)
    return {
      subject,
      text: us
        ? `Hi ${greet},\n\nOne quick idea for ${m.business}: ${FIX[m.service]}. Businesses like yours usually get more calls once that's in place. Want me to show you how it would look?\n\n${sign}`
        : `Hi ${greet}, one quick idea for ${m.business}: ${FIX[m.service]}. Businesses like yours usually get more enquiries once that's in place. Shall I show you how it would look?\n\n${sign}`,
    };
  return {
    subject,
    text: us
      ? `Hi ${greet},\n\nI'll stop following up after this one. If ${topic} becomes a priority, just reply and I'll send the free preview. All the best with ${m.business}!\n\n${sign}`
      : `Hi ${greet}, I'll stop following up after this one. If ${topic} becomes a priority, just reply here and I'll send the free preview. All the best with ${m.business}!\n\n${sign}`,
  };
}

/** wa.me needs the full international number as digits only. Local 10-digit numbers get the country code. */
export function whatsappNumber(found: string | null, intlPhone: string | null, phone: string | null, market = "IN") {
  if (found && found.replace(/\D/g, "").length >= 10) return found.replace(/\D/g, "");
  const intl = intlPhone?.replace(/\D/g, "");
  if (intl && intl.length >= 10) return intl;
  const local = phone?.replace(/\D/g, "").replace(/^0+/, "");
  if (!local) return null;
  if (market === "IN" && local.length === 10) return `91${local}`;
  if (market === "US" && local.length === 10) return `1${local}`;
  return local.length > 10 ? local : null;
}

export const whatsappLink = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
export const emailLink = (email: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
