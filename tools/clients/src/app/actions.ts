"use server";

// Clients, contacts, onboarding and agreements. Amounts on agreements are finance data: only roles with
// "finance.view" can set or see them.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertPermission, can } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { type Result, fail, optDate, optStr } from "@genclover/ui/result";
import { AGREEMENT_STATUSES, AGREEMENT_TYPES, parseChecklist } from "../lib/agreements";
import { cleanTaxFields } from "../lib/taxProfile";

const email = z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.email("Invalid email").nullable()).optional();
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const upper = z.string().trim().transform((s) => (s === "" ? null : s.toUpperCase())).nullable().optional();

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Client / company name is required"),
  legalName: optStr,
  contactName: optStr,
  email,
  phone: optStr,
  country: optStr,
  state: optStr,
  city: optStr,
  timezone: optStr,
  website: optStr,
  industry: optStr,
  billingAddress: optStr,
  gstin: upper.refine((v) => !v || GSTIN_RE.test(v), "GSTIN should look like 03ABCDE1234F1Z5"),
  pan: upper.refine((v) => !v || PAN_RE.test(v), "PAN should look like ABCDE1234F"),
  currency: z.enum(["INR", "USD"]).default("USD"),
  paymentTermsDays: z.string().trim().transform((s) => (s === "" ? null : Math.round(Number(s)))).pipe(z.number().min(0).max(180).nullable()).optional(),
  accountManager: optStr,
  notes: optStr,
});

const NewClientSchema = ClientSchema.extend({
  code: z.string().transform(ids.normalizeClientCode).pipe(z.string().regex(ids.CLIENT_CODE_RE, `Client code: ${ids.CLIENT_CODE_HINT}`)),
});

const touchClient = (id?: string) => {
  revalidatePath("/clients");
  revalidatePath("/clients/onboarding");
  if (id) revalidatePath(`/clients/${id}`);
};

async function createClientRecord(user: { id: string; name: string }, data: z.infer<typeof NewClientSchema>, status: "ONBOARDING" | "ACTIVE") {
  const taken = await prisma.client.findUnique({ where: { code: data.code }, select: { name: true } });
  if (taken) throw new Error(`Client code ${data.code} is already used by ${taken.name}`);
  const number = await ids.nextClientNumber(prisma);
  const c = await prisma.client.create({ data: { ...data, number, status, onboardedAt: status === "ACTIVE" ? new Date() : null } });
  await audit(user, "CREATE", "Client", c.id, `Created client ${number} (${data.code}) ${data.name}`);
  return c;
}

export async function saveClient(_: Result, fd: FormData): Promise<Result> {
  const id = String(fd.get("id") ?? "");
  let clientId = id;
  try {
    const user = await assertPermission("clients.edit");
    if (id) {
      const data = cleanTaxFields(ClientSchema.parse(Object.fromEntries(fd)));
      await prisma.client.update({ where: { id }, data });
      await audit(user, "UPDATE", "Client", id, `Updated client ${data.name}`);
    } else {
      clientId = (await createClientRecord(user, cleanTaxFields(NewClientSchema.parse(Object.fromEntries(fd))), "ACTIVE")).id;
    }
    touchClient(clientId);
  } catch (e) {
    return fail(e);
  }
  if (!id) redirect(`/clients/${clientId}`);
  return { ok: true, message: "Client saved." };
}

export async function deleteClient(id: string) {
  const user = await assertPermission("admin");
  const c = await prisma.client.findUniqueOrThrow({ where: { id }, include: { _count: { select: { projects: true, invoices: true } } } });
  if (c._count.projects > 0 || c._count.invoices > 0) throw new Error("Client has projects or invoices — mark it inactive instead");
  await prisma.client.delete({ where: { id } });
  await audit(user, "DELETE", "Client", id, `Deleted client ${c.name}`);
  touchClient();
  redirect("/clients");
}

/** ONBOARDING → ACTIVE once the checklist is done (or by decision); INACTIVE when the relationship ends. */
export async function setClientStatus(id: string, status: "ONBOARDING" | "ACTIVE" | "INACTIVE"): Promise<Result> {
  try {
    const user = await assertPermission("clients.edit");
    const c = await prisma.client.update({ where: { id }, data: { status, ...(status === "ACTIVE" ? { onboardedAt: new Date() } : {}) } });
    await audit(user, "UPDATE", "Client", id, `${c.name}: status ${status}`);
    touchClient(id);
    return { ok: true, message: status === "ACTIVE" ? "Client is active: onboarding complete." : `Status: ${status.toLowerCase()}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleChecklist(id: string, key: string, done: boolean): Promise<Result> {
  try {
    await assertPermission("clients.edit");
    const c = await prisma.client.findUniqueOrThrow({ where: { id }, select: { checklist: true } });
    const list = { ...parseChecklist(c.checklist), [key]: done };
    await prisma.client.update({ where: { id }, data: { checklist: JSON.stringify(list) } });
    touchClient(id);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Contacts ----------

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  title: optStr,
  email,
  phone: optStr,
  linkedinUrl: optStr,
  isPrimary: z.boolean().default(false),
  isBilling: z.boolean().default(false),
  notes: optStr,
});

export async function saveContact(clientId: string, contactId: string | null, input: z.input<typeof ContactSchema>): Promise<Result> {
  try {
    const user = await assertPermission("clients.edit");
    const d = ContactSchema.parse(input);
    if (d.isPrimary) await prisma.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
    if (contactId) await prisma.clientContact.update({ where: { id: contactId }, data: d });
    else await prisma.clientContact.create({ data: { ...d, clientId } });
    // The primary contact is also shown on the client record (invoices, lists).
    if (d.isPrimary) await prisma.client.update({ where: { id: clientId }, data: { contactName: d.name, email: d.email ?? undefined, phone: d.phone ?? undefined } });
    await audit(user, contactId ? "UPDATE" : "CREATE", "ClientContact", clientId, `Contact ${d.name}`);
    touchClient(clientId);
    return { ok: true, message: "Contact saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContact(contactId: string): Promise<Result> {
  try {
    const user = await assertPermission("clients.edit");
    const c = await prisma.clientContact.delete({ where: { id: contactId } });
    await audit(user, "DELETE", "ClientContact", c.clientId, `Contact ${c.name} removed`);
    touchClient(c.clientId);
    return { ok: true, message: "Removed." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Onboarding a won deal ----------

const OnboardSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), clientId: z.string().min(1, "Pick the client") }),
  z.object({ mode: z.literal("new"), client: NewClientSchema }),
]);

/**
 * A won opportunity (or a won lead from before opportunities) becomes a client: a new Client ID and code, or an
 * existing client (another project for them). The lead and opportunity are linked, so reports can trace the client
 * back to the lead that found it.
 */
export async function onboardDeal(input: { opportunityId?: string; leadId?: string } & z.input<typeof OnboardSchema>): Promise<Result & { clientId?: string }> {
  try {
    const user = await assertPermission("clients.edit");
    const d = OnboardSchema.parse(input);
    const opp = input.opportunityId ? await prisma.opportunity.findUniqueOrThrow({ where: { id: input.opportunityId } }) : null;
    const leadId = opp?.leadId ?? input.leadId ?? null;
    if (opp && opp.stage !== "WON") throw new Error("Only won opportunities can be onboarded");
    if (opp?.onboardedAt) throw new Error("This deal has already been onboarded");
    const client =
      d.mode === "existing" ? await prisma.client.findUniqueOrThrow({ where: { id: d.clientId } }) : await createClientRecord(user, cleanTaxFields(d.client), "ONBOARDING");
    const now = new Date();
    let oppId = opp?.id;
    if (opp) await prisma.opportunity.update({ where: { id: opp.id }, data: { clientId: client.id, onboardedAt: now } });
    else if (leadId) {
      // A lead won before opportunities existed: record the deal now, so every client traces to one.
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const code = await ids.nextOpportunityCode(prisma);
      oppId = (
        await prisma.opportunity.create({
          data: {
            code,
            leadId,
            clientId: client.id,
            title: lead.wonPackage ? `${lead.wonPackage}${lead.wonCarePlan && lead.wonCarePlan !== "None" ? ` + ${lead.wonCarePlan}` : ""}` : "Won deal",
            stage: "WON",
            wonAt: lead.wonAt ?? now,
            onboardedAt: now,
            value: lead.dealValue,
            currency: lead.dealCurrency ?? (lead.market === "US" ? "USD" : "INR"),
            ownerId: lead.ownerId,
            ownerName: lead.ownerName,
            createdBy: user.name,
          },
        })
      ).id;
    }
    if (leadId) await prisma.lead.update({ where: { id: leadId }, data: { clientId: client.id } });
    await audit(user, "UPDATE", "Client", client.id, `Onboarded ${client.number} ${client.name}${oppId ? ` from deal ${opp?.code ?? ""}` : ""}`);
    touchClient(client.id);
    revalidatePath("/leads/won");
    return { ok: true, message: `${client.number} · ${client.code} ready. Next: agreements and the project.`, clientId: client.id };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Agreements ----------

const AgreementSchema = z.object({
  type: z.enum(Object.keys(AGREEMENT_TYPES) as [string, ...string[]]),
  clientId: z.string().min(1, "Pick the client"),
  projectId: optStr,
  parentId: optStr,
  title: z.string().trim().min(1, "Give it a title"),
  status: z.enum(AGREEMENT_STATUSES).default("DRAFT"),
  documentUrl: optStr.refine((v) => !v || /^https?:\/\/\S+$/.test(v), "The document link must start with https://"),
  scopeSummary: optStr,
  estimatedHours: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(0).nullable()).optional(),
  value: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(0).nullable()).optional(),
  currency: optStr,
  signedAt: optDate,
  effectiveFrom: optDate,
  expiresAt: optDate,
  renewalNoticeDays: z.coerce.number().int().min(0).max(365).default(30),
  ownerName: optStr,
  notes: optStr,
});

const touchAgreements = (a: { id: string; clientId: string; projectId: string | null }) => {
  revalidatePath("/agreements");
  revalidatePath(`/agreements/${a.id}`);
  revalidatePath(`/clients/${a.clientId}`);
  if (a.projectId) revalidatePath(`/projects/${a.projectId}`);
};

/** Create or update. The code (ABR-A01, ABR-P01-S01…) is given on creation and never changes. */
export async function saveAgreement(id: string | null, input: Record<string, string>): Promise<Result & { id?: string }> {
  try {
    // A delivery manager may raise change requests and acceptance on their projects.
    const user = await assertPermission("agreements.edit", "projects.edit");
    const d = AgreementSchema.parse(input);
    const t = AGREEMENT_TYPES[d.type];
    if (!can(user.role, "agreements.edit") && !["CR", "ACCEPTANCE"].includes(d.type)) throw new Error("Your role can raise change requests and acceptance certificates only");
    if (t.scope === "PROJECT" && !d.projectId) throw new Error(`A ${t.label} belongs to a project: pick one`);
    // Amounts only from roles that may see them; for everyone else they are left as they are.
    const { value, currency, ...rest } = d;
    const money = can(user.role, "finance.view") ? { value: value ?? null, currency: value != null ? (currency ?? "INR") : null } : {};
    const fields = { ...rest, ...money, projectId: d.projectId ?? null };
    let saved;
    if (id) {
      const prev = await prisma.agreement.findUniqueOrThrow({ where: { id } });
      if (prev.type !== d.type || prev.clientId !== d.clientId) throw new Error("Type and client can't change: create a new agreement instead");
      saved = await prisma.agreement.update({ where: { id }, data: fields });
      if (prev.status !== d.status) await audit(user, "UPDATE", "Agreement", id, `${prev.code}: ${prev.status} → ${d.status}`);
      else await audit(user, "UPDATE", "Agreement", id, `${prev.code} updated`);
    } else {
      const client = await prisma.client.findUniqueOrThrow({ where: { id: d.clientId }, select: { id: true, code: true } });
      let code: string;
      if (t.scope === "PROJECT") {
        const project = await prisma.project.findUniqueOrThrow({ where: { id: d.projectId! }, select: { id: true, code: true, clientId: true } });
        if (project.clientId !== client.id) throw new Error("That project belongs to another client");
        code = await ids.nextProjectDocCode(prisma, project, t.kind!);
      } else code = await ids.nextAgreementCode(prisma, client);
      saved = await prisma.agreement.create({
        data: { ...fields, code, createdBy: user.name, versions: { create: { version: 1, documentUrl: d.documentUrl ?? null, note: "First version", createdBy: user.name } } },
      });
      await audit(user, "CREATE", "Agreement", saved.id, `${code} ${t.label}: ${d.title}`);
    }
    touchAgreements(saved);
    return { ok: true, message: `${saved.code} saved.`, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

/** A new version of the document (e.g. after the client's redlines). */
export async function addAgreementVersion(id: string, input: { documentUrl: string; note: string }): Promise<Result> {
  try {
    const user = await assertPermission("agreements.edit");
    if (input.documentUrl && !/^https?:\/\/\S+$/.test(input.documentUrl)) throw new Error("The document link must start with https://");
    const a = await prisma.agreement.findUniqueOrThrow({ where: { id } });
    const version = a.version + 1;
    await prisma.agreement.update({
      where: { id },
      data: {
        version,
        documentUrl: input.documentUrl || a.documentUrl,
        versions: { create: { version, documentUrl: input.documentUrl || null, note: input.note || null, createdBy: user.name } },
      },
    });
    await audit(user, "UPDATE", "Agreement", id, `${a.code}: version ${version}${input.note ? ` (${input.note})` : ""}`);
    touchAgreements(a);
    return { ok: true, message: `Version ${version} added.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setAgreementStatus(id: string, status: (typeof AGREEMENT_STATUSES)[number]): Promise<Result> {
  try {
    const user = await assertPermission("agreements.edit", "projects.edit");
    const a = await prisma.agreement.findUniqueOrThrow({ where: { id } });
    if (!can(user.role, "agreements.edit") && !["CR", "ACCEPTANCE"].includes(a.type)) throw new Error("Your role can update change requests and acceptance certificates only");
    await prisma.agreement.update({ where: { id }, data: { status, ...(status === "SIGNED" && !a.signedAt ? { signedAt: new Date() } : {}) } });
    await audit(user, "UPDATE", "Agreement", id, `${a.code}: ${a.status} → ${status}`);
    touchAgreements(a);
    return { ok: true, message: `${a.code}: ${status.toLowerCase()}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAgreement(id: string) {
  const user = await assertPermission("agreements.edit");
  const a = await prisma.agreement.findUniqueOrThrow({ where: { id } });
  if (a.status !== "DRAFT") throw new Error("Only drafts can be deleted; mark others terminated or superseded");
  await prisma.agreement.delete({ where: { id } });
  await audit(user, "DELETE", "Agreement", id, `${a.code} deleted (draft)`);
  touchAgreements(a);
  redirect("/agreements");
}
