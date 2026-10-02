// The message choices for a lead at its current step: Claude's message (if reviewed, first message only)
// and one per service it has an opportunity for. Used by the lead page and the Today queue.
import { type MarketKey, marketOf } from "./markets";
import { buildMessage } from "./messages";
import { shortName } from "./names";
import { nextStep } from "./outreach";
import { serviceLabel } from "./b2b";
import { b2bMessage } from "./b2bMessages";
import type { Reason } from "./scoring";
import { suggestedReplies } from "./replies";
import { ENGAGED_STAGES, isService, REPLY_CATEGORIES, SERVICE, SERVICES, STEP_LABEL, type ServiceKey } from "./services";

type LeadLike = {
  name: string;
  market: string;
  area: string | null;
  contactName: string | null;
  personName: string | null;
  contactCount: number;
  firstService: string | null;
  reasons: string | null;
  claudeMessage: string | null;
  claudeService: string | null;
  stage: string;
  replyCategory: string | null;
  bestService: string | null;
  kind?: string;
  industry?: string | null;
  services?: string[];
} & Record<(typeof SERVICES)[number]["field"], number>;

export type Option = { key: string; label: string; service: string | null; subject: string; text: string };

export function messageOptions(lead: LeadLike, sender: string, extras: { bookingLink?: string | null } = {}): { step: number | null; stepLabel: string; options: Option[] } {
  const step = nextStep(lead);
  // After a reply: suggested answers for what they said, not the next follow-up.
  if (ENGAGED_STAGES.includes(lead.stage)) {
    const service = isService(lead.firstService) ? lead.firstService : isService(lead.bestService) ? lead.bestService : null;
    const business = shortName(lead.name);
    const subject = `Re: ${business}`;
    const replies = suggestedReplies(lead.replyCategory, {
      market: marketOf(lead.market).key as MarketKey,
      person: lead.contactName ?? lead.personName,
      business,
      sender,
      service,
      bookingLink: extras.bookingLink ?? null,
    });
    const label = lead.replyCategory ? `Answer: ${REPLY_CATEGORIES[lead.replyCategory]?.label.toLowerCase()}` : "Answer their reply";
    return { step, stepLabel: label, options: replies.map((r) => ({ key: r.key, label: r.label, service, subject, text: r.text })) };
  }
  // Company accounts: one message per service they may need, from the B2B templates.
  if (lead.kind === "B2B") {
    const s = step ?? 3;
    const services = s > 0 && lead.firstService ? [lead.firstService] : lead.services?.length ? lead.services : ["WEB_APP"];
    const options = services.map((service) => {
      const m = b2bMessage(s, { company: shortName(lead.name), person: lead.contactName ?? lead.personName, industry: lead.industry ?? null, service, sender, market: lead.market });
      return { key: service, label: serviceLabel(service), service, subject: m.subject, text: m.text };
    });
    return { step, stepLabel: step == null ? "Sequence finished" : STEP_LABEL[step], options };
  }
  const market = marketOf(lead.market).key as MarketKey;
  const reasons: Reason[] = lead.reasons ? JSON.parse(lead.reasons) : [];
  const business = shortName(lead.name);
  const person = lead.contactName ?? lead.personName;
  const s = step ?? 3;
  // Follow-ups stay on the subject of the first message.
  const services: ServiceKey[] =
    s > 0 && isService(lead.firstService)
      ? [lead.firstService]
      : SERVICES.filter((sv) => lead[sv.field] > 0)
          .sort((a, b) => lead[b.field] - lead[a.field])
          .map((sv) => sv.key);
  const options: Option[] = services.map((service) => {
    const m = buildMessage({ service, market, step: s, business, person, area: lead.area, reasons, sender });
    return { key: service, label: SERVICE[service].label, service, subject: m.subject, text: m.text };
  });
  if (s === 0 && lead.claudeMessage) {
    const service = isService(lead.claudeService) ? lead.claudeService : (services[0] ?? null);
    const subject = service ? buildMessage({ service, market, step: 0, business, person, area: lead.area, reasons, sender }).subject : `${business}: an idea`;
    options.unshift({ key: "CLAUDE", label: "Claude's message", service, subject, text: lead.claudeMessage });
  }
  return { step, stepLabel: step == null ? "Sequence finished" : STEP_LABEL[step], options };
}
