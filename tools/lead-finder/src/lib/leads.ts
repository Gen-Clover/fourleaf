// Lead data shared by the pages and the background worker (no Next.js or server-only imports here).
import { Prisma, prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { auditWebsite, isSocialOnly } from "./audit";
import { type GPlace, pageSpeed, placeDetails } from "./google";
import { cityFromAddress, cleanName, personFromName } from "./names";
import { type AuditFacts, scoreLead } from "./scoring";
import { getLfSettings } from "./settings";
import { changeStage } from "./stages";

export const SYSTEM_USER = "Lead Finder";

/** Lead fields copied from Google (refreshed or cleared under Google's storage terms). */
export function googleFields(p: GPlace) {
  return {
    name: cleanName(p.displayName?.text ?? "Unnamed business"),
    primaryType: p.primaryType ?? null,
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    phone: p.nationalPhoneNumber ?? null,
    intlPhone: p.internationalPhoneNumber ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    hasHours: !!p.regularOpeningHours,
    photoCount: p.photos?.length ?? 0,
    businessStatus: p.businessStatus ?? null,
    googleFetchedAt: new Date(),
  };
}

export const GOOGLE_FIELDS_CLEARED = {
  primaryType: null,
  address: null,
  lat: null,
  lng: null,
  phone: null,
  intlPhone: null,
  mapsUrl: null,
  rating: null,
  reviewCount: null,
  hasHours: null,
  photoCount: null,
  businessStatus: null,
  googleFetchedAt: null,
};

/**
 * Save a Google place as a lead: a new lead gets a GL- ID, a known one (same place ID) is refreshed.
 * Returns the lead and whether it was created.
 */
export async function upsertPlace(p: GPlace, ctx: { nicheKey: string | null; area: string | null; market: string }) {
  const fields = googleFields(p);
  const website = p.websiteUri ?? null;
  // The town from the business's own address; the searched area only if the address has none.
  const area = cityFromAddress(fields.address) ?? ctx.area;
  const existing = await prisma.lead.findFirst({ where: { placeId: p.id }, select: { id: true, website: true, nicheKey: true, personName: true } });
  if (existing) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: { ...fields, area, website: website ?? existing.website, nicheKey: existing.nicheKey ?? ctx.nicheKey, personName: existing.personName ?? personFromName(fields.name) },
    });
    return { id: existing.id, isNew: false, websiteChanged: !!website && website !== existing.website };
  }
  try {
    const code = await ids.nextLeadId(prisma);
    const lead = await prisma.lead.create({
      data: {
        ...fields,
        code,
        placeId: p.id,
        source: "MAPS",
        market: ctx.market,
        nicheKey: ctx.nicheKey,
        area,
        website,
        personName: personFromName(fields.name),
        auditStatus: website ? "PENDING" : "NONE",
      },
      select: { id: true },
    });
    return { id: lead.id, isNew: true, websiteChanged: false };
  } catch (e) {
    // Another search cell saved the same place a moment earlier: use that lead.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const lead = await prisma.lead.findFirstOrThrow({ where: { placeId: p.id }, select: { id: true } });
      return { id: lead.id, isNew: false, websiteChanged: false };
    }
    throw e;
  }
}

/** Recompute a lead's scores from its data, its niche and its latest audit, then apply the qualify rules. */
export async function rescore(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const [audit, niche] = await Promise.all([
    prisma.websiteAudit.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } }),
    lead.nicheKey ? prisma.leadNiche.findUnique({ where: { key: lead.nicheKey } }) : null,
  ]);
  const s = scoreLead(
    {
      website: lead.website,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      hasHours: lead.hasHours,
      photoCount: lead.photoCount,
      nicheValue: niche?.value ?? null,
      bookingRelevant: niche?.bookingRelevant ?? false,
      fromGoogle: !!lead.placeId && !!lead.googleFetchedAt,
      branchCount: lead.branchCount,
    },
    audit as AuditFacts | null,
  );
  const siteState = !lead.website ? "NONE" : !audit ? "PENDING" : audit.socialOnly ? "SOCIAL" : !audit.reachable ? "DOWN" : "OK";
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      siteState,
      ability: s.ability,
      sNewWebsite: s.NEW_WEBSITE,
      sRedesign: s.REDESIGN,
      sLeadCapture: s.LEAD_CAPTURE,
      sGoogleProfile: s.GOOGLE_PROFILE,
      sSeoSpeed: s.SEO_SPEED,
      sBooking: s.BOOKING,
      sAiAutomation: s.AI_AUTOMATION,
      bestScore: s.best,
      bestService: s.bestService,
      reasons: JSON.stringify(s.reasons),
    },
  });
  await autoQualify(leadId);
  return s;
}

/**
 * Qualify rules for leads nobody has looked at yet (stage New):
 * a big chain → Not a fit; score at or above the setting with a phone or email → Qualified.
 */
export async function autoQualify(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.stage !== "NEW" || lead.doNotContact || lead.branchOfId) return;
  const s = await getLfSettings();
  let stage: string | null = null;
  let why = "";
  if (s.chainBranches > 0 && lead.branchCount >= s.chainBranches) [stage, why] = ["NOT_A_FIT", `big chain (${lead.branchCount} branches)`];
  else if (s.autoQualifyScore > 0 && lead.bestScore >= s.autoQualifyScore && (lead.phone || lead.intlPhone || lead.email || lead.whatsappNumber) && lead.businessStatus !== "CLOSED_TEMPORARILY")
    [stage, why] = ["QUALIFIED", `score ${lead.bestScore} ≥ ${s.autoQualifyScore} and a way to reach them`];
  if (!stage) return;
  await changeStage(leadId, stage, {
    by: { id: null, name: SYSTEM_USER },
    reason: `automatic: ${why}`,
    data: stage === "NOT_A_FIT" ? { notFitReason: "Big chain / franchise" } : {},
  });
}

/** Check the lead's website (and optionally its Google speed score), save the audit and contacts, rescore. */
export async function auditLead(leadId: string, opts: { speedTest?: boolean } = {}) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { website: true, email: true, emails: true, personName: true, whatsappNumber: true, socials: true } });
  if (!lead.website) {
    await prisma.lead.update({ where: { id: leadId }, data: { auditStatus: "NONE", auditedAt: new Date() } });
    return rescore(leadId);
  }
  const result = await auditWebsite(lead.website);
  let psiMobile: number | null = null;
  if (opts.speedTest && result.reachable && !result.socialOnly) psiMobile = await pageSpeed(result.finalUrl ?? result.url).catch(() => null);
  await prisma.websiteAudit.create({ data: { ...result, leadId, psiMobile, psiAt: psiMobile != null ? new Date() : null } });
  // Contacts found on the website fill in what we don't have yet; nothing typed in is overwritten.
  const emails = [...new Set([...lead.emails, ...result.emails])].slice(0, 5);
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      auditStatus: "DONE",
      auditedAt: new Date(),
      emails,
      email: lead.email ?? emails[0] ?? null,
      personName: lead.personName ?? result.personName,
      whatsappNumber: lead.whatsappNumber ?? result.whatsappNumber,
      socials: result.socials ?? lead.socials,
    },
  });
  return rescore(leadId);
}

/** Add Google's mobile speed score to the latest audit (runs a fresh audit if there is none). */
export async function speedTestLead(leadId: string) {
  const audit = await prisma.websiteAudit.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });
  if (!audit) return auditLead(leadId, { speedTest: true });
  if (!audit.reachable || audit.socialOnly) return rescore(leadId);
  const psiMobile = await pageSpeed(audit.finalUrl ?? audit.url);
  await prisma.websiteAudit.update({ where: { id: audit.id }, data: { psiMobile, psiAt: new Date() } });
  return rescore(leadId);
}

/** Fetch fresh Google data for a lead (Google's storage terms), one Place Details request. */
export async function refreshFromGoogle(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { placeId: true, website: true, source: true } });
  if (!lead.placeId) return;
  const p = await placeDetails(lead.placeId);
  const fields = googleFields(p);
  const website = p.websiteUri ?? lead.website;
  await prisma.lead.update({ where: { id: leadId }, data: { ...fields, area: cityFromAddress(fields.address) ?? undefined, website } });
  if (website !== lead.website) await auditLead(leadId);
  else await rescore(leadId);
}

export const websiteKind = (website: string | null) => (!website ? "none" : isSocialOnly(website) ? "social" : "site");
