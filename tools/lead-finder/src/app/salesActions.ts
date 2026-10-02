"use server";

// Company accounts (B2B), their contacts, opportunities (deals) and imports. Deal values follow the deal
// permissions (lib/dealAccess.ts): owners and CFO see all; Sales sees their own.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertPermission } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { type Result, fail, optDate, optStr } from "@genclover/ui/result";
import { B2B_SERVICES, hostOf, IMPORT_SOURCES, INDUSTRIES, matchServices, OPP_MODELS, OPP_STAGES } from "../lib/b2b";
import { canSeeDeal } from "../lib/dealAccess";
import { isMarket } from "../lib/markets";
import { SOURCES } from "../lib/services";
import { changeStage } from "../lib/stages";

const email = z.string().trim().transform((s) => (s === "" ? null : s.toLowerCase())).pipe(z.email("Invalid email").nullable()).optional();
const url = optStr.refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Links must start with https://");
const serviceList = z.array(z.string().refine((s) => s in B2B_SERVICES, "Unknown service")).max(16).default([]);
const normalizeUrl = (u: string | null | undefined) => (u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : null);

async function editor() {
  const user = await assertPermission("leads.edit");
  return { user, by: { id: user.id, name: user.name } };
}

// ---------- Accounts ----------

const AccountSchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  market: z.string().refine(isMarket, "Pick a market"),
  source: z.enum(Object.keys(SOURCES) as [string, ...string[]]).default("MANUAL"),
  website: optStr,
  industry: optStr,
  subIndustry: optStr,
  companySize: optStr,
  linkedinUrl: url,
  area: optStr,
  services: serviceList,
  contactName: optStr,
  contactTitle: optStr,
  contactEmail: email,
  contactPhone: optStr,
  contactLinkedin: url,
  note: optStr,
});

/** A company account (B2B), typed in or from LinkedIn. Gets a GL- ID like every lead and is owned by whoever adds it. */
export async function addAccount(input: z.input<typeof AccountSchema>): Promise<Result & { id?: string }> {
  try {
    const { user, by } = await editor();
    const d = AccountSchema.parse(input);
    const host = hostOf(d.website);
    const dup = await prisma.lead.findFirst({
      where: { OR: [{ name: { equals: d.name, mode: "insensitive" } }, ...(host ? [{ website: { contains: host, mode: "insensitive" as const } }] : [])] },
      select: { id: true, code: true, name: true },
    });
    if (dup) throw new Error(`Already in the Lead Finder: ${dup.code} ${dup.name}. Open it and add a contact or opportunity there.`);
    const code = await ids.nextLeadId(prisma);
    const lead = await prisma.lead.create({
      data: {
        code,
        kind: "B2B",
        name: d.name,
        market: d.market,
        source: d.source,
        website: normalizeUrl(d.website),
        industry: d.industry,
        subIndustry: d.subIndustry,
        companySize: d.companySize,
        linkedinUrl: d.linkedinUrl,
        area: d.area,
        services: d.services,
        contactName: d.contactName,
        email: d.contactEmail,
        emails: d.contactEmail ? [d.contactEmail] : [],
        phone: d.contactPhone,
        auditStatus: "NONE",
        siteState: d.website ? "OK" : "NONE",
        stage: "QUALIFIED",
        stageChangedAt: new Date(),
        ownerId: user.id,
        ownerName: user.name,
        contacts: d.contactName
          ? { create: { name: d.contactName, title: d.contactTitle, email: d.contactEmail, phone: d.contactPhone, linkedinUrl: d.contactLinkedin, isPrimary: true } }
          : undefined,
      },
    });
    await prisma.leadActivity.create({ data: { leadId: lead.id, type: "SYSTEM", text: `Company account added (${SOURCES[d.source]})`, byId: by.id, byName: by.name } });
    if (d.note) await prisma.leadActivity.create({ data: { leadId: lead.id, type: "NOTE", text: d.note, byId: by.id, byName: by.name } });
    await audit(user, "CREATE", "Lead", lead.id, `Added company account ${code} ${d.name}`);
    revalidatePath("/leads/accounts");
    return { ok: true, message: `${code} added.`, id: lead.id };
  } catch (e) {
    return fail(e);
  }
}

const AccountInfo = z.object({
  kind: z.enum(["LOCAL", "B2B"]),
  industry: optStr,
  subIndustry: optStr,
  companySize: optStr,
  linkedinUrl: url,
  services: serviceList,
});

export async function saveAccountInfo(id: string, input: z.input<typeof AccountInfo>): Promise<Result> {
  try {
    const { user } = await editor();
    const d = AccountInfo.parse(input);
    await prisma.lead.update({ where: { id }, data: d });
    await audit(user, "UPDATE", "Lead", id, `Company details updated`);
    revalidatePath(`/leads/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Contacts at an account ----------

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  title: optStr,
  email,
  phone: optStr,
  linkedinUrl: url,
  isPrimary: z.boolean().default(false),
  notes: optStr,
});

export async function saveLeadContact(leadId: string, contactId: string | null, input: z.input<typeof ContactSchema>): Promise<Result> {
  try {
    const { user } = await editor();
    const d = ContactSchema.parse(input);
    if (d.isPrimary) await prisma.leadContact.updateMany({ where: { leadId }, data: { isPrimary: false } });
    if (contactId) await prisma.leadContact.update({ where: { id: contactId }, data: d });
    else await prisma.leadContact.create({ data: { ...d, leadId } });
    // The primary contact is who messages go to.
    if (d.isPrimary) {
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { emails: true } });
      await prisma.lead.update({
        where: { id: leadId },
        data: { contactName: d.name, ...(d.email ? { email: d.email, emails: [...new Set([d.email, ...lead.emails])] } : {}), ...(d.phone ? { phone: d.phone } : {}) },
      });
    }
    await audit(user, contactId ? "UPDATE" : "CREATE", "LeadContact", leadId, `Contact ${d.name}`);
    revalidatePath(`/leads/${leadId}`);
    return { ok: true, message: "Contact saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLeadContact(contactId: string): Promise<Result> {
  try {
    const { user } = await editor();
    const c = await prisma.leadContact.delete({ where: { id: contactId } });
    await audit(user, "DELETE", "LeadContact", c.leadId, `Contact ${c.name} removed`);
    revalidatePath(`/leads/${c.leadId}`);
    return { ok: true, message: "Removed." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Opportunities ----------

const OppSchema = z.object({
  leadId: optStr,
  clientId: optStr,
  title: z.string().trim().min(1, "Give the opportunity a title, e.g. Data migration to the new ERP"),
  services: serviceList,
  model: z.enum(Object.keys(OPP_MODELS) as [string, ...string[]]),
  stage: z.enum(Object.keys(OPP_STAGES) as [string, ...string[]]),
  probability: z.string().trim().transform((s) => (s === "" ? null : Math.round(Number(s)))).pipe(z.number().min(0).max(100).nullable()).optional(),
  value: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(0).nullable()).optional(),
  currency: z.enum(["INR", "USD"]).default("INR"),
  expectedCloseAt: optDate,
  ownerId: optStr,
  source: optStr,
  nextStep: optStr,
  lostReason: optStr,
  notes: optStr,
});

const touchOpp = (o: { id: string; leadId: string | null; clientId: string | null }) => {
  revalidatePath("/leads/opportunities");
  revalidatePath(`/leads/opportunities/${o.id}`);
  revalidatePath("/leads/won");
  revalidatePath("/clients/onboarding");
  if (o.leadId) revalidatePath(`/leads/${o.leadId}`);
  if (o.clientId) revalidatePath(`/clients/${o.clientId}`);
};

/** Create or update. Won deals go to the onboarding queue; the account is marked Won too. */
export async function saveOpportunity(id: string | null, input: Record<string, unknown>): Promise<Result & { id?: string }> {
  try {
    const { user, by } = await editor();
    const d = OppSchema.parse(input);
    if (!d.leadId && !d.clientId) throw new Error("An opportunity belongs to an account or a client");
    if (d.stage === "LOST" && !d.lostReason) throw new Error("Say why it was lost");
    const prev = id ? await prisma.opportunity.findUniqueOrThrow({ where: { id } }) : null;
    if (prev?.onboardedAt && d.stage !== "WON") throw new Error("This deal is onboarded already; it can't leave Won");
    const owner = d.ownerId ? await prisma.user.findUnique({ where: { id: d.ownerId }, select: { id: true, name: true } }) : null;
    const ownerId = owner?.id ?? prev?.ownerId ?? user.id;
    const ownerName = owner?.name ?? prev?.ownerName ?? user.name;
    // Values only from people allowed to see this deal; otherwise the stored value stays.
    const mayValue = canSeeDeal(user, { ownerId: prev ? prev.ownerId : ownerId });
    const won = d.stage === "WON";
    const data = {
      title: d.title,
      services: d.services,
      model: d.model,
      stage: d.stage,
      probability: d.probability ?? OPP_STAGES[d.stage].probability,
      expectedCloseAt: d.expectedCloseAt,
      ownerId,
      ownerName,
      source: d.source,
      nextStep: d.nextStep,
      lostReason: d.stage === "LOST" ? d.lostReason : null,
      notes: d.notes,
      wonAt: won ? (prev?.wonAt ?? new Date()) : null,
      ...(mayValue ? { value: d.value ?? null, currency: d.currency } : {}),
    };
    const saved = prev
      ? await prisma.opportunity.update({ where: { id: prev.id }, data })
      : await prisma.opportunity.create({ data: { ...data, code: await ids.nextOpportunityCode(prisma), leadId: d.leadId, clientId: d.clientId, createdBy: user.name } });
    if (saved.leadId && (!prev || prev.stage !== saved.stage)) {
      await prisma.leadActivity.create({
        data: { leadId: saved.leadId, type: "STAGE", text: `Opportunity ${saved.code} "${saved.title}": ${prev ? `${OPP_STAGES[prev.stage]?.label} → ` : ""}${OPP_STAGES[saved.stage].label}`, byId: by.id, byName: by.name },
      });
      // Winning a deal makes the account a customer in the pipeline too.
      if (won) {
        const lead = await prisma.lead.findUniqueOrThrow({ where: { id: saved.leadId }, select: { stage: true } });
        if (lead.stage !== "WON") await changeStage(saved.leadId, "WON", { by, reason: `deal ${saved.code}`, data: { wonAt: new Date(), nextFollowUpAt: null } });
      }
    }
    await audit(user, prev ? "UPDATE" : "CREATE", "Opportunity", saved.id, `${saved.code} ${saved.title}: ${saved.stage}`);
    touchOpp(saved);
    return { ok: true, message: won && !prev?.wonAt ? `${saved.code} won: it's in the onboarding queue.` : `${saved.code} saved.`, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOpportunity(id: string) {
  const { user } = await editor();
  const o = await prisma.opportunity.findUniqueOrThrow({ where: { id } });
  if (o.stage === "WON") throw new Error("Won deals can't be deleted");
  await prisma.opportunity.delete({ where: { id } });
  await audit(user, "DELETE", "Opportunity", id, `${o.code} deleted`);
  touchOpp(o);
  redirect(o.leadId ? `/leads/${o.leadId}` : "/leads/opportunities");
}

// ---------- Import ----------

const ImportRow = z.object({
  company: z.string().trim().min(1),
  website: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  companyLinkedin: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedin: z.string().optional(),
  services: z.string().optional(),
  notes: z.string().optional(),
});

const clean = (s: string | undefined) => (s && s.trim() ? s.trim() : null);
const linkOrNull = (s: string | undefined) => {
  const v = clean(s);
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : /linkedin\.com/i.test(v) ? `https://${v.replace(/^\/+/, "")}` : null;
};

/**
 * Import company accounts and their contacts. Several rows for one company become one account with several
 * contacts. A company already in the Lead Finder (same name or website) is not duplicated: new contacts are
 * added to it. Everything imported is tagged with the import, so a wrong file can be found and cleaned up.
 */
export async function importAccounts(input: { fileName: string; source: string; market: string; services: string[]; rows: unknown[] }): Promise<Result & { created?: number; merged?: number; contacts?: number; skipped?: number }> {
  try {
    const { user, by } = await editor();
    const source = z.enum(Object.keys(IMPORT_SOURCES) as [string, ...string[]]).parse(input.source);
    if (!isMarket(input.market)) throw new Error("Pick a market");
    const defaultServices = serviceList.parse(input.services);
    const rows = z.array(z.unknown()).max(5000, "Up to 5,000 rows per import").parse(input.rows);
    const imp = await prisma.leadImport.create({ data: { fileName: input.fileName.slice(0, 200), source, createdBy: user.name, rows: rows.length } });
    const existing = await prisma.lead.findMany({ select: { id: true, name: true, website: true } });
    const byName = new Map(existing.map((l) => [l.name.trim().toLowerCase(), l.id]));
    const byHost = new Map(existing.filter((l) => hostOf(l.website)).map((l) => [hostOf(l.website)!, l.id]));
    const knownEmails = new Set((await prisma.leadContact.findMany({ where: { email: { not: null } }, select: { email: true } })).map((c) => c.email!.toLowerCase()));
    let created = 0,
      merged = 0,
      contacts = 0,
      skipped = 0;
    for (const raw of rows) {
      const r = ImportRow.safeParse(raw);
      if (!r.success) {
        skipped++;
        continue;
      }
      const x = r.data;
      const host = hostOf(clean(x.website));
      let leadId = byName.get(x.company.trim().toLowerCase()) ?? (host ? byHost.get(host) : undefined);
      const services = [...new Set([...matchServices(x.services), ...defaultServices])];
      const industry = clean(x.industry);
      if (!leadId) {
        const code = await ids.nextLeadId(prisma);
        const lead = await prisma.lead.create({
          data: {
            code,
            kind: "B2B",
            name: x.company.trim(),
            market: input.market,
            source: source === "LINKEDIN" ? "LINKEDIN" : "IMPORT",
            importId: imp.id,
            website: normalizeUrl(clean(x.website)),
            industry: industry && INDUSTRIES.find((i) => i.toLowerCase() === industry.toLowerCase()) ? INDUSTRIES.find((i) => i.toLowerCase() === industry.toLowerCase())! : industry,
            companySize: clean(x.companySize),
            area: [clean(x.city), clean(x.country)].filter(Boolean).join(", ") || null,
            linkedinUrl: linkOrNull(x.companyLinkedin),
            services,
            auditStatus: "NONE",
            siteState: clean(x.website) ? "OK" : "NONE",
            stage: "NEW",
            stageChangedAt: new Date(),
            ownerId: user.id,
            ownerName: user.name,
          },
        });
        leadId = lead.id;
        byName.set(x.company.trim().toLowerCase(), leadId);
        if (host) byHost.set(host, leadId);
        await prisma.leadActivity.create({ data: { leadId, type: "SYSTEM", text: `Imported from ${input.fileName} (${IMPORT_SOURCES[source]})`, byId: by.id, byName: by.name } });
        created++;
      } else merged++;
      const name = clean(x.fullName) ?? ([clean(x.firstName), clean(x.lastName)].filter(Boolean).join(" ") || null);
      const mail = clean(x.email)?.toLowerCase() ?? null;
      if (name && !(mail && knownEmails.has(mail))) {
        const first = (await prisma.leadContact.count({ where: { leadId } })) === 0;
        await prisma.leadContact.create({ data: { leadId, name, title: clean(x.title), email: mail, phone: clean(x.phone), linkedinUrl: linkOrNull(x.linkedin), isPrimary: first, notes: clean(x.notes) } });
        if (first) await prisma.lead.update({ where: { id: leadId }, data: { contactName: name, ...(mail ? { email: mail, emails: [mail] } : {}), ...(clean(x.phone) ? { phone: clean(x.phone) } : {}) } });
        if (mail) knownEmails.add(mail);
        contacts++;
      }
    }
    await prisma.leadImport.update({ where: { id: imp.id }, data: { created, duplicates: merged, errors: skipped } });
    await audit(user, "CREATE", "LeadImport", imp.id, `${input.fileName}: ${created} new accounts, ${merged} existing, ${contacts} contacts, ${skipped} skipped`);
    revalidatePath("/leads/accounts");
    revalidatePath("/leads/import");
    return { ok: true, message: `Imported: ${created} new accounts, ${merged} already known (contacts added), ${contacts} contacts, ${skipped} rows skipped.`, created, merged, contacts, skipped };
  } catch (e) {
    return fail(e);
  }
}

/** Remove the accounts an import created that nobody has worked on yet (no messages, no deals). */
export async function undoImport(importId: string): Promise<Result> {
  try {
    const { user } = await editor();
    const leads = await prisma.lead.findMany({ where: { importId, contactCount: 0, opportunities: { none: {} } }, select: { id: true } });
    const ids_ = leads.map((l) => l.id);
    await prisma.leadContact.deleteMany({ where: { leadId: { in: ids_ } } });
    await prisma.leadActivity.deleteMany({ where: { leadId: { in: ids_ } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids_ } } });
    await audit(user, "DELETE", "LeadImport", importId, `Import undone: ${ids_.length} untouched account(s) removed`);
    revalidatePath("/leads/import");
    revalidatePath("/leads/accounts");
    return { ok: true, message: `${ids_.length} untouched account(s) removed. Accounts someone already worked on were kept.` };
  } catch (e) {
    return fail(e);
  }
}
