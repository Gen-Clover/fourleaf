// The message choices for a lead at its current step: Claude's message (if reviewed, first message only)
// and one per service it has an opportunity for. Used by the lead page and the Today queue.
import { type MarketKey, marketOf } from "./markets";
import { buildMessage } from "./messages";
import { shortName } from "./names";
import { nextStep } from "./outreach";
import type { Reason } from "./scoring";
import { isService, SERVICE, SERVICES, STEP_LABEL, type ServiceKey } from "./services";

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
} & Record<(typeof SERVICES)[number]["field"], number>;

export type Option = { key: string; label: string; service: string | null; subject: string; text: string };

export function messageOptions(lead: LeadLike, sender: string): { step: number | null; stepLabel: string; options: Option[] } {
  const step = nextStep(lead);
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
