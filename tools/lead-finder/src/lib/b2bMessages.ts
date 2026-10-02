// Outreach to company accounts (B2B): short, specific, one ask. Email or LinkedIn, first message and three
// follow-ups (same days as local leads). The service is one the account may need (their services list).
import { serviceLabel } from "./b2b";

type Ctx = { company: string; person: string | null; industry: string | null; service: string; sender: string; market: string };

const first = (name: string | null) => (name ? name.trim().split(/\s+/)[0] : null);

/** What each service does for a company, in one line. */
const VALUE: Record<string, string> = {
  WEB_APP: "internal tools and customer portals that replace spreadsheets and email threads",
  WEBSITE: "a fast, modern website that turns visitors into enquiries",
  MOBILE_APP: "iOS and Android apps your customers and field teams actually use",
  ECOMMERCE: "online stores and B2B ordering that cut manual order handling",
  AI_AUTOMATION: "AI assistants and automations that take repetitive work off your team",
  DATA_MIGRATION: "moving data between systems safely, with checks at every step and no downtime surprises",
  DATA_ANALYTICS: "dashboards that show the numbers you need without someone building reports by hand",
  INTEGRATIONS: "connecting the tools you already use so data flows without copy-paste",
  CRM_ERP: "CRM and ERP set-ups that fit how your team works",
  CLOUD_DEVOPS: "cloud set-up, deployments and monitoring that keep things running and costs in check",
  UI_UX: "product design that makes complex software simple to use",
  QA_TESTING: "testing that catches problems before your customers do",
  DEDICATED_TEAM: "experienced developers working as part of your team, month to month",
  MAINTENANCE: "ongoing support, updates and fixes for software you already have",
  SEO_MARKETING: "search and digital marketing that brings in qualified enquiries",
  CONSULTING: "a second opinion on technology decisions before you commit budget",
};

export function b2bMessage(step: number, c: Ctx): { subject: string; text: string } {
  const hi = first(c.person) ? `Hi ${first(c.person)},` : "Hello,";
  const svc = serviceLabel(c.service).toLowerCase();
  const value = VALUE[c.service] ?? `${svc} work`;
  const sector = c.industry ? ` in ${c.industry.toLowerCase()}` : "";
  const sign = `\n\n${c.sender}\nGen Clover · genclover.com`;
  switch (step) {
    case 0:
      return {
        subject: `${c.company}: ${svc}`,
        text: `${hi}\n\nI run Gen Clover, a software studio. We build ${value}, and we work with companies${sector} like ${c.company}.\n\nIs ${svc} something you're looking at this year? If it is, I'd be glad to share how we'd approach it in a 20-minute call. No preparation needed on your side.${sign}`,
      };
    case 1:
      return {
        subject: `Re: ${c.company}: ${svc}`,
        text: `${hi}\n\nQuick follow-up on my note about ${svc}. If a short call isn't convenient, I can send a one-page outline of how we'd do it for ${c.company} instead. Would that help?${sign}`,
      };
    case 2:
      return {
        subject: `Re: ${c.company}: ${svc}`,
        text: `${hi}\n\nOne example: for a company${sector}, we ${c.service === "DATA_MIGRATION" ? "moved years of records to a new system over a weekend, with a full check of every row" : c.service === "AI_AUTOMATION" ? "automated the first reply to customer enquiries, so the team only handles the ones that need a person" : "shipped the first working version in weeks, then improved it every sprint with their team"}.\n\nIf something like this would be useful at ${c.company}, reply and I'll set up a call.${sign}`,
      };
    default:
      return {
        subject: `Re: ${c.company}: ${svc}`,
        text: `${hi}\n\nI won't keep following up. If ${svc} becomes a priority later, just reply to this and we'll pick it up from there.\n\nAll the best to you and the team at ${c.company}.${sign}`,
      };
  }
}
