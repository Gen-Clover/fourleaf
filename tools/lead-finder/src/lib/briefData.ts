import { prisma } from "@genclover/db";
import type { BriefLead } from "./brief";
import type { Reason } from "./scoring";
import { SERVICES } from "./services";

/** Leads in the shape the Claude brief needs, in the order given. */
export async function loadBriefLeads(ids: string[]): Promise<BriefLead[]> {
  const [leads, niches] = await Promise.all([
    prisma.lead.findMany({ where: { id: { in: ids } }, include: { audits: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.leadNiche.findMany({ select: { key: true, label: true } }),
  ]);
  const nicheLabel = Object.fromEntries(niches.map((n) => [n.key, n.label]));
  const byId = new Map(leads.map((l) => [l.id, l]));
  return ids
    .map((id) => byId.get(id))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l) => {
      const a = l.audits[0];
      const yn = (label: string, v: boolean | null | undefined) => (v == null ? null : `${label} ${v ? "yes" : "no"}`);
      const checks =
        a && a.reachable && !a.socialOnly
          ? [
              yn("HTTPS", a.https),
              yn("phone-friendly", a.mobileViewport),
              a.jsRendered ? "content not checked (built in the browser)" : null,
              ...(a.jsRendered ? [] : [yn("WhatsApp button", a.hasWhatsApp), yn("enquiry form", a.hasForm), yn("online booking", a.hasBooking), yn("chat assistant", a.hasChatBot), yn("FAQ", a.hasFaq)]),
              a.psiMobile != null ? `mobile speed ${a.psiMobile}/100` : null,
              a.platform ? `built with ${a.platform}` : null,
              a.adsDetected ? "runs Google/Meta ads" : null,
            ].filter((x): x is string => !!x)
          : [];
      return {
        code: l.code,
        name: l.name,
        market: l.market,
        niche: l.nicheKey ? (nicheLabel[l.nicheKey] ?? l.nicheKey) : null,
        area: l.area,
        person: l.contactName ?? l.personName,
        rating: l.rating,
        reviewCount: l.reviewCount,
        branchCount: l.branchCount,
        website: l.website,
        siteState: l.siteState,
        checks,
        reasons: (l.reasons ? JSON.parse(l.reasons) : []) as Reason[],
        scores: Object.fromEntries(SERVICES.map((s) => [s.key, l[s.field]])),
      };
    });
}
