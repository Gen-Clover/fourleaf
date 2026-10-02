// Suggested answers to a reply, by what the reply is about and the market. The person picks one,
// edits it, and sends it; the 1-hour reply timer stops when it's sent.
import type { MarketKey } from "./markets";
import { marketOf } from "./markets";
import { SERVICE, type ServiceKey } from "./services";

export type ReplyInput = { market: MarketKey; person: string | null; business: string; sender: string; service: ServiceKey | null; bookingLink: string | null };

type Suggestion = { key: string; label: string; text: string };

export function suggestedReplies(category: string | null, r: ReplyInput): Suggestion[] {
  const us = r.market === "US";
  const hi = `Hi ${r.person ?? r.business},`;
  const sign = us ? `\n\nBest,\n${r.sender}\nGen Clover · genclover.com` : `\n\n${r.sender}, Gen Clover`;
  const book = r.bookingLink ? ` You can pick a time here: ${r.bookingLink}` : "";
  const what = r.service ? SERVICE[r.service].label.toLowerCase() : "website";
  const offer = r.service ? marketOf(r.market).offers[r.service] : null;
  const all: Record<string, Suggestion[]> = {
    INTERESTED: [
      { key: "call", label: "Offer a call", text: `${hi} great to hear from you! A quick 10-minute call is the easiest way to get this right. When suits you today or tomorrow?${book}${sign}` },
      { key: "preview", label: "Send the preview", text: `${hi} thanks! I'll put together a free preview of your new homepage and send it over by tomorrow. Anything you'd like it to highlight (services, offers, photos)?${sign}` },
    ],
    PRICE: [
      {
        key: "price",
        label: "Share the price",
        text: `${hi} thanks for asking.${offer ? ` For ${what}, it's ${offer}.` : ""} That includes design, mobile-friendly pages, WhatsApp and enquiry forms, and going live${us ? "" : " in about 7 days"}. Happy to walk you through what's included on a short call.${book}${sign}`,
      },
      { key: "details", label: "Send details", text: `${hi} sure. Here's what we'd do for ${r.business}: a fast, phone-friendly site that sends every enquiry to your phone, set up with your Google profile. I can share examples and the exact scope on a quick call, or over message if you prefer.${sign}` },
    ],
    NOT_NOW: [
      { key: "later", label: "Check back later", text: `${hi} no problem at all, thanks for letting me know. I'll check back in a little while. If anything changes before then, just reply here.${sign}` },
    ],
    NOT_INTERESTED: [
      { key: "thanks", label: "Thank them", text: `${hi} understood, thanks for replying. All the best with ${r.business}!${sign}` },
    ],
    WRONG_PERSON: [
      { key: "who", label: "Ask who to contact", text: `${hi} thanks for letting me know. Who would be the right person to speak to about your website and online enquiries? A name and number or email would be perfect.${sign}` },
    ],
  };
  return category ? (all[category] ?? []) : [...all.INTERESTED, ...all.PRICE];
}
