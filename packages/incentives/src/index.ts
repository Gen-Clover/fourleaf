import "server-only";
// Sales incentives, server side. One record per won deal (SalesIncentive), one money line per person per receipt
// (IncentiveEntry), and a log of every change (IncentiveChange). The rules are in rules.ts.
//
//   Won (Lead Finder)      recordAtWon: who owned the lead, their manager, what was sold, the value. Status DRAFT.
//   Onboarding (Clients)   decideAtOnboarding: required before a deal becomes a client. Approvers decide there
//                          (APPROVED / NOT_ELIGIBLE); anyone else proposes (PENDING_APPROVAL) for an approver.
//   Receipt (Finance)      previewReceipt + writeReceipt: on each payment of a linked invoice, the share of the
//                          eligible base it covers earns seller and manager lines; Finance holds that money in the
//                          "Sales incentives" fund instead of splitting it into the allocation buckets.
//   Pay run (Finance)      payableForMonth / attachToPayRun / payRunPaid: lines past their hold date are paid with
//                          the next salary, then leave the wallet.
//   Owner                  correct (any field, any time, with a reason), adjust, cancel; ownerReport flags gaps.
import { type Tx, prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { identityKeys, type IdentityInput } from "./identity";
import { type ServiceLine, parseServices, qualifying, r2, split } from "./rules";

type Db = Tx;
const db0 = prisma as unknown as Db;
export type By = { id: string | null; name: string };

const DAY = 86_400_000;

// ---------- Settings ----------

const SETTING_GROUP = "Sales incentives";
export const SETTING_DEFAULTS = { incentiveSellerPct: 8, incentiveManagerPct: 2, incentiveHoldDays: 30 };

export async function getSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(SETTING_DEFAULTS) } } });
  const m = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  const val = (k: keyof typeof SETTING_DEFAULTS) => (Number.isFinite(m[k]) ? m[k] : SETTING_DEFAULTS[k]);
  return { sellerPct: val("incentiveSellerPct"), managerPct: val("incentiveManagerPct"), holdDays: val("incentiveHoldDays") };
}

export async function saveSettings(s: { sellerPct: number; managerPct: number; holdDays: number }) {
  const rows: [keyof typeof SETTING_DEFAULTS, number, string, string][] = [
    ["incentiveSellerPct", s.sellerPct, "Seller's incentive", "%"],
    ["incentiveManagerPct", s.managerPct, "Manager's incentive", "%"],
    ["incentiveHoldDays", s.holdDays, "Hold after the client pays, before it's paid out", "days"],
  ];
  for (const [key, value, label, unit] of rows) {
    await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value), label, unit, group: SETTING_GROUP } });
  }
}

// ---------- Sales team ----------

export async function members() {
  return prisma.salesMember.findMany({ orderBy: { userName: "asc" } });
}

export async function memberOf(userId: string | null | undefined) {
  return userId ? prisma.salesMember.findUnique({ where: { userId } }) : null;
}

export async function saveMember(m: { userId: string; managerUserId: string | null; onIncentive: boolean; personId: string | null; active: boolean; canGenerateLeads?: boolean; canReassignTeam?: boolean }) {
  const [user, manager] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: m.userId }, select: { name: true } }),
    m.managerUserId ? prisma.user.findUniqueOrThrow({ where: { id: m.managerUserId }, select: { name: true } }) : null,
  ]);
  if (m.managerUserId === m.userId) throw new Error("Someone can't be their own manager");
  const data = {
    userName: user.name,
    managerUserId: m.managerUserId,
    managerName: manager?.name ?? null,
    onIncentive: m.onIncentive,
    personId: m.personId,
    active: m.active,
    ...(m.canGenerateLeads !== undefined ? { canGenerateLeads: m.canGenerateLeads } : {}),
    ...(m.canReassignTeam !== undefined ? { canReassignTeam: m.canReassignTeam } : {}),
  };
  return prisma.salesMember.upsert({ where: { userId: m.userId }, update: data, create: { userId: m.userId, ...data } });
}

/** The users someone may see the incentives of: themselves, plus the people they manage. */
export async function visibleUserIds(userId: string) {
  const team = await prisma.salesMember.findMany({ where: { managerUserId: userId }, select: { userId: true } });
  return [userId, ...team.map((t) => t.userId)];
}

// ---------- Change log ----------

const fmt = (v: unknown) => (v == null || v === "" ? null : typeof v === "object" ? JSON.stringify(v) : String(v));

async function log(db: Db, incentiveId: string, stage: string, by: By, field: string, from: unknown, to: unknown, reason?: string | null) {
  const f = fmt(from);
  const t = fmt(to);
  if (f === t && field !== "created" && field !== "note") return;
  await db.incentiveChange.create({ data: { incentiveId, stage, byId: by.id, byName: by.name, field, fromValue: f, toValue: t, reason: reason ?? null } });
}

/** Log every field that differs between two versions of a record. */
async function logDiff(db: Db, incentiveId: string, stage: string, by: By, before: Record<string, unknown>, after: Record<string, unknown>, reason?: string | null) {
  for (const k of Object.keys(after)) if (fmt(before[k]) !== fmt(after[k])) await log(db, incentiveId, stage, by, k, before[k], after[k], reason);
}

// ---------- Won ----------

/**
 * A deal was won: record who sold it and what. The seller is the deal's owner (the lead's owner, or whoever marked
 * it won if nobody owned it); their manager comes from the sales team set-up. Nothing is earned yet.
 */
export async function recordAtWon(o: { opportunityId: string; by: By; services: ServiceLine[]; summary: string }) {
  const existing = await prisma.salesIncentive.findFirst({ where: { opportunityId: o.opportunityId } });
  if (existing) return existing;
  const opp = await prisma.opportunity.findUniqueOrThrow({
    where: { id: o.opportunityId },
    select: { id: true, leadId: true, clientId: true, ownerId: true, ownerName: true, value: true, currency: true, wonAt: true, lead: { select: { ownerId: true, ownerName: true, source: true } } },
  });
  const [s, member] = await Promise.all([getSettings(), memberOf(opp.ownerId)]);
  const q = qualifying(o.services, null, true);
  const inc = await prisma.salesIncentive.create({
    data: {
      code: await ids.nextIncentiveCode(prisma),
      opportunityId: opp.id,
      leadId: opp.leadId,
      clientId: opp.clientId,
      sellerUserId: opp.ownerId,
      sellerName: opp.ownerName,
      managerUserId: member?.managerUserId ?? null,
      managerName: member?.managerName ?? null,
      sellerRatePct: s.sellerPct,
      managerRatePct: s.managerPct,
      leadSource: opp.lead?.source ?? null,
      wonAt: opp.wonAt ?? new Date(),
      wonSummary: o.summary,
      wonValue: opp.value,
      wonCurrency: opp.currency,
      leadOwnerAtWonId: opp.lead?.ownerId ?? null,
      leadOwnerAtWon: opp.lead?.ownerName ?? null,
      services: JSON.stringify(o.services),
      qualifyingKey: q?.key ?? null,
      qualifyingLabel: q?.label ?? null,
      qualifyingKind: q?.kind ?? null,
      baseAmount: q?.value ?? null,
      currency: opp.currency,
    },
  });
  await log(db0, inc.id, "WON", o.by, "created", null, `${inc.code}: seller ${inc.sellerName ?? "none"}${inc.managerName ? `, manager ${inc.managerName}` : ""}; ${o.summary}`);
  return inc;
}

/** Deals won before incentives existed (or created without one): make the record when they reach onboarding. */
export async function ensureForOpportunity(opportunityId: string, by: By) {
  const existing = await prisma.salesIncentive.findFirst({ where: { opportunityId } });
  if (existing) return existing;
  const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, select: { title: true, services: true, value: true, model: true } });
  const line: ServiceLine = { key: "DEAL", label: opp.title, kind: opp.model === "MAINTENANCE" ? "MONTHLY" : "ONE_TIME", value: opp.value };
  return recordAtWon({ opportunityId, by, services: [line], summary: `${opp.title} (recorded at onboarding)` });
}

// ---------- Identity / new client ----------

export type IdentityMatch = { clientId: string; name: string; number: string; on: string[]; hard: boolean; paidInvoices: number };

/**
 * Existing clients that look like the same business. Hard = a registration matches (GSTIN, PAN, CIN, EIN): it is
 * the same business. Soft = website domain, phone or name: probably the same, a person should check.
 */
export async function identityMatches(x: IdentityInput, excludeClientId?: string | null): Promise<IdentityMatch[]> {
  const k = identityKeys(x);
  const clients = await prisma.client.findMany({ select: { id: true, name: true, number: true, gstin: true, pan: true, cin: true, ein: true, website: true, phone: true } });
  const out: IdentityMatch[] = [];
  for (const c of clients) {
    if (c.id === excludeClientId) continue;
    const ck = identityKeys(c);
    const on: string[] = [];
    if (k.gstin && ck.gstin === k.gstin) on.push("GSTIN");
    else if (k.pan && ck.pan === k.pan) on.push("PAN");
    if (k.cin && ck.cin === k.cin) on.push("CIN");
    if (k.ein && ck.ein === k.ein) on.push("EIN");
    const hard = on.length > 0;
    if (k.domain && ck.domain === k.domain) on.push("website");
    if (k.phone && ck.phone === k.phone) on.push("phone");
    if (k.name && ck.name === k.name) on.push("name");
    if (on.length) out.push({ clientId: c.id, name: c.name, number: c.number, on, hard, paidInvoices: 0 });
  }
  if (out.length) {
    const paid = await prisma.invoice.groupBy({ by: ["clientId"], where: { clientId: { in: out.map((m) => m.clientId) }, status: { in: ["PAID", "PARTIAL"] } }, _count: { _all: true } });
    for (const m of out) m.paidInvoices = paid.find((p) => p.clientId === m.clientId)?._count._all ?? 0;
  }
  return out.sort((a, b) => Number(b.hard) - Number(a.hard));
}

/** A client's registration numbers changed: note it on their incentives, so the owner's report shows it. */
export async function clientIdentityChanged(clientId: string, by: By, from: string, to: string, isOwner: boolean) {
  const deals = await prisma.salesIncentive.findMany({ where: { clientId }, select: { id: true } });
  for (const d of deals) await log(db0, d.id, isOwner ? "OWNER" : "ONBOARDING", by, "client identity", from, to, "client record edited");
}

/** A new client: no paid invoice ever, and no other client is the same business (registration match). */
export async function newClientCheck(clientId: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true, gstin: true, pan: true, cin: true, ein: true, website: true, phone: true } });
  const ownPaid = await prisma.invoice.count({ where: { clientId, status: { in: ["PAID", "PARTIAL"] } } });
  const matches = await identityMatches(c, clientId);
  const hard = matches.filter((m) => m.hard);
  const soft = matches.filter((m) => !m.hard);
  const notes = [
    ownPaid ? `already has ${ownPaid} paid invoice(s)` : null,
    ...hard.map((m) => `same business as ${m.number} ${m.name} (${m.on.join(", ")})`),
    ...soft.map((m) => `looks like ${m.number} ${m.name} (${m.on.join(", ")}): check`),
  ].filter(Boolean);
  return { isNew: ownPaid === 0 && hard.length === 0, note: notes.join("; ") || null, matches };
}

// ---------- Onboarding ----------

export type Decision = {
  applies: boolean;
  services: ServiceLine[];
  pickedKey: string | null; // null = the highest-value service
  note?: string | null;
};

const snapshot = (i: { status: string; sellerUserId: string | null; managerUserId: string | null; sellerRatePct: number; managerRatePct: number; services: string; qualifyingKey: string | null; baseAmount: number | null; currency: string; clientId: string | null; projectId: string | null }) => ({
  status: i.status,
  seller: i.sellerUserId,
  manager: i.managerUserId,
  sellerRatePct: i.sellerRatePct,
  managerRatePct: i.managerRatePct,
  services: parseServices(i.services).map((s) => `${s.label}${s.kind === "MONTHLY" ? " (monthly)" : ""}: ${s.value ?? "?"}`).join(" | "),
  qualifying: i.qualifyingKey,
  baseAmount: i.baseAmount,
  currency: i.currency,
  clientId: i.clientId,
  projectId: i.projectId,
});

function qualify(services: ServiceLine[], pickedKey: string | null) {
  const q = qualifying(services, pickedKey, !pickedKey);
  return { qualifyingKey: q?.key ?? null, qualifyingLabel: q?.label ?? null, qualifyingKind: q?.kind ?? null, baseAmount: q?.value ?? null, autoSelected: !pickedKey };
}

/**
 * The onboarding step: the incentive is decided (approvers) or proposed (everyone else) when the deal becomes a
 * client. Someone who can't see amounts keeps the values recorded at Won; an approver sets the negotiated ones.
 */
export async function decideAtOnboarding(incentiveId: string, d: Decision, o: { by: By; canApprove: boolean; canSeeAmounts: boolean; clientId: string; projectId?: string | null }) {
  const inc = await prisma.salesIncentive.findUniqueOrThrow({ where: { id: incentiveId } });
  if (["APPROVED", "NOT_ELIGIBLE", "CANCELLED"].includes(inc.status) && !o.canApprove) throw new Error(`${inc.code} is already decided; an owner can correct it`);
  const old = parseServices(inc.services);
  // Without amounts, the person only picks which services were sold; values stay as recorded.
  const services = o.canSeeAmounts ? d.services : d.services.map((s) => ({ ...s, value: old.find((x) => x.key === s.key)?.value ?? null }));
  if (!services.length) throw new Error("List at least one service that was sold");
  const q = qualify(services, d.pickedKey);
  const check = await newClientCheck(o.clientId);
  if (d.applies && !inc.sellerUserId) throw new Error("No seller on this deal: an owner sets the seller first (Incentives → the deal)");
  if (d.applies && o.canApprove && !(q.baseAmount && q.baseAmount > 0)) throw new Error("Enter the agreed price of the qualifying service (excluding GST)");
  if (!d.applies && !d.note?.trim()) throw new Error("Say why there's no incentive on this deal");
  const status = o.canApprove ? (d.applies ? "APPROVED" : "NOT_ELIGIBLE") : "PENDING_APPROVAL";
  if (status === "APPROVED" && (o.by.id === inc.sellerUserId || o.by.id === inc.managerUserId)) throw new Error("The seller and their manager can't approve their own incentive: ask an owner or the CFO");
  const now = new Date();
  const data = {
    ...q,
    services: JSON.stringify(services),
    clientId: o.clientId,
    projectId: o.projectId ?? inc.projectId,
    status,
    newClient: check.isNew,
    duplicateNote: check.note,
    proposedEligible: d.applies,
    proposedById: o.by.id,
    proposedByName: o.by.name,
    proposedAt: now,
    ...(o.canApprove ? { decidedById: o.by.id, decidedByName: o.by.name, decidedAt: now, decisionNote: d.note?.trim() || null } : { decisionNote: d.note?.trim() || null }),
  };
  const saved = await prisma.salesIncentive.update({ where: { id: incentiveId }, data });
  await logDiff(db0, incentiveId, "ONBOARDING", o.by, snapshot(inc), snapshot(saved), d.note);
  if (!check.isNew) await log(db0, incentiveId, "SYSTEM", { id: null, name: "New-client check" }, "newClient", null, check.note);
  return saved;
}

/** An approver decides a proposed incentive (review queue). The seller and their manager can't. */
export async function approve(incentiveId: string, o: { by: By; approve: boolean; note?: string | null; services?: ServiceLine[]; pickedKey?: string | null; isOwner: boolean }) {
  const inc = await prisma.salesIncentive.findUniqueOrThrow({ where: { id: incentiveId } });
  if (!["PENDING_APPROVAL", "DRAFT"].includes(inc.status)) throw new Error(`${inc.code} is already decided; use Correct to change it`);
  if (o.by.id && (o.by.id === inc.sellerUserId || o.by.id === inc.managerUserId)) {
    if (!o.isOwner) throw new Error("The seller and their manager can't decide their own incentive");
    if (!o.note?.trim()) throw new Error("Deciding an incentive you earn from: add a note saying why");
  }
  if (!o.approve && !o.note?.trim()) throw new Error("Say why there's no incentive");
  const services = o.services ?? parseServices(inc.services);
  const q = qualify(services, o.pickedKey === undefined ? (inc.autoSelected ? null : inc.qualifyingKey) : o.pickedKey);
  if (o.approve && !(q.baseAmount && q.baseAmount > 0)) throw new Error("Enter the agreed price of the qualifying service (excluding GST)");
  if (o.approve && !inc.sellerUserId) throw new Error("Set the seller first");
  const saved = await prisma.salesIncentive.update({
    where: { id: incentiveId },
    data: { ...q, services: JSON.stringify(services), status: o.approve ? "APPROVED" : "NOT_ELIGIBLE", decidedById: o.by.id, decidedByName: o.by.name, decidedAt: new Date(), decisionNote: o.note?.trim() || null },
  });
  await logDiff(db0, incentiveId, "APPROVAL", o.by, snapshot(inc), snapshot(saved), o.note);
  return saved;
}

// ---------- Owner corrections ----------

export type Correction = Partial<{
  sellerUserId: string | null;
  managerUserId: string | null;
  sellerRatePct: number;
  managerRatePct: number;
  services: ServiceLine[];
  pickedKey: string | null;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "NOT_ELIGIBLE" | "CANCELLED";
  projectId: string | null;
  currency: "INR" | "USD";
}>;

/**
 * An owner changes anything, at any stage, with a reason. Money already earned stays as it was, except: a new
 * seller or manager takes over lines not yet paid, and cancelling reverses everything not yet paid.
 */
export async function correct(incentiveId: string, c: Correction, o: { by: By; reason: string }) {
  if (!o.reason.trim()) throw new Error("Give a reason: it goes in the change report");
  const inc = await prisma.salesIncentive.findUniqueOrThrow({ where: { id: incentiveId } });
  const userName = async (id: string | null | undefined) => (id ? (await prisma.user.findUniqueOrThrow({ where: { id }, select: { name: true } })).name : null);
  const data: Record<string, unknown> = {};
  if (c.sellerUserId !== undefined) Object.assign(data, { sellerUserId: c.sellerUserId, sellerName: await userName(c.sellerUserId) });
  if (c.managerUserId !== undefined) Object.assign(data, { managerUserId: c.managerUserId, managerName: await userName(c.managerUserId) });
  if (c.sellerRatePct !== undefined) data.sellerRatePct = c.sellerRatePct;
  if (c.managerRatePct !== undefined) data.managerRatePct = c.managerRatePct;
  if (c.projectId !== undefined) data.projectId = c.projectId;
  if (c.currency !== undefined) data.currency = c.currency;
  if (c.services !== undefined || c.pickedKey !== undefined) {
    const services = c.services ?? parseServices(inc.services);
    Object.assign(data, { services: JSON.stringify(services), ...qualify(services, c.pickedKey === undefined ? (inc.autoSelected ? null : inc.qualifyingKey) : c.pickedKey) });
  }
  if (c.status !== undefined && c.status !== inc.status) {
    data.status = c.status;
    if (["APPROVED", "NOT_ELIGIBLE"].includes(c.status)) Object.assign(data, { decidedById: o.by.id, decidedByName: o.by.name, decidedAt: new Date(), decisionNote: o.reason });
  }
  const sellerId = (data.sellerUserId as string | null | undefined) ?? inc.sellerUserId;
  const managerId = (data.managerUserId as string | null | undefined) ?? inc.managerUserId;
  if (sellerId && sellerId === managerId) throw new Error("The seller and the manager must be different people (leave the manager empty)");
  const saved = await prisma.$transaction(async (tx) => {
    const s = await tx.salesIncentive.update({ where: { id: incentiveId }, data });
    // Unpaid lines move to the new payee; lines already in a pay run or paid stay where they are.
    for (const [role, id, name] of [["SELLER", c.sellerUserId, data.sellerName], ["MANAGER", c.managerUserId, data.managerName]] as const) {
      if (id === undefined) continue;
      if (id) await tx.incentiveEntry.updateMany({ where: { incentiveId, role, payRunId: null, paidOn: null }, data: { userId: id, userName: String(name) } });
      else await reverseUnpaid(tx as unknown as Db, incentiveId, o.by, `${role.toLowerCase()} removed`, role);
    }
    if (c.status === "CANCELLED" || c.status === "NOT_ELIGIBLE") await reverseUnpaid(tx as unknown as Db, incentiveId, o.by, `deal ${c.status === "CANCELLED" ? "cancelled" : "marked not eligible"}`);
    return s;
  });
  await logDiff(db0, incentiveId, "OWNER", o.by, snapshot(inc), snapshot(saved), o.reason);
  return saved;
}

/** Undo what hasn't been paid: lines not in a pay run are cancelled with an equal and opposite line. */
async function reverseUnpaid(db: Db, incentiveId: string, by: By, why: string, role?: "SELLER" | "MANAGER") {
  const open = await db.incentiveEntry.findMany({ where: { incentiveId, paidOn: null, ...(role ? { role } : {}) } });
  const byUser = new Map<string, { userName: string; role: string; amount: number; basis: number; basisInr: number }>();
  for (const e of open) {
    const k = `${e.userId}:${e.role}`;
    const r = byUser.get(k) ?? { userName: e.userName, role: e.role, amount: 0, basis: 0, basisInr: 0 };
    r.amount += e.amountInr;
    r.basis += e.basisAmount;
    r.basisInr += e.basisInr;
    byUser.set(k, r);
  }
  const now = new Date();
  for (const [k, r] of byUser) {
    if (Math.abs(r.amount) < 0.005) continue;
    await db.incentiveEntry.create({
      data: { incentiveId, userId: k.split(":")[0], userName: r.userName, role: r.role, type: "REVERSAL", basisAmount: -r.basis, basisInr: -r.basisInr, amountInr: -r2(r.amount), date: now, availableOn: now, note: `Reversed: ${why}`, createdBy: by.name },
    });
  }
}

/** An owner's manual correction to someone's earned amount (+ or −), paid or recovered in the next pay run. */
export async function adjust(incentiveId: string, o: { by: By; role: "SELLER" | "MANAGER"; amountInr: number; reason: string }) {
  if (!o.reason.trim()) throw new Error("Give a reason");
  if (!o.amountInr) throw new Error("Enter an amount (negative to recover)");
  const inc = await prisma.salesIncentive.findUniqueOrThrow({ where: { id: incentiveId } });
  const userId = o.role === "SELLER" ? inc.sellerUserId : inc.managerUserId;
  const userName = o.role === "SELLER" ? inc.sellerName : inc.managerName;
  if (!userId || !userName) throw new Error(`This deal has no ${o.role.toLowerCase()}`);
  const now = new Date();
  await prisma.incentiveEntry.create({ data: { incentiveId, userId, userName, role: o.role, type: "ADJUSTMENT", amountInr: r2(o.amountInr), date: now, availableOn: now, note: o.reason, createdBy: o.by.name } });
  await log(db0, incentiveId, "OWNER", o.by, `adjustment (${o.role.toLowerCase()})`, null, r2(o.amountInr), o.reason);
}

/** Count (or stop counting) an invoice towards this incentive. Only future receipts are affected. */
export async function setInvoiceLink(invoiceId: string, incentiveId: string | null, by: By, reason?: string | null) {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { number: true, incentiveId: true, clientId: true } });
  if (incentiveId) {
    const inc = await prisma.salesIncentive.findUniqueOrThrow({ where: { id: incentiveId }, select: { clientId: true } });
    if (inc.clientId && inc.clientId !== inv.clientId) throw new Error("That invoice belongs to another client");
  }
  await prisma.invoice.update({ where: { id: invoiceId }, data: { incentiveId } });
  const target = incentiveId ?? inv.incentiveId;
  if (target) await log(db0, target, "OWNER", by, "invoice", incentiveId ? null : inv.number, incentiveId ? inv.number : null, reason ?? (incentiveId ? "invoice counted" : "invoice no longer counted"));
}

// ---------- Receipts (Finance) ----------

type InvoiceForReceipt = {
  id: string;
  number: string;
  clientId: string;
  projectId: string | null;
  incentiveId: string | null;
  issueDate: Date;
  currency: string;
  fxRate: number;
  total: number;
  subtotal: number | null;
  taxAmount: number;
  lines: { kind: string; amount: number }[];
};
type ReceiptInput = { date: Date; amountUsd: number; inrReceived: number; bankChargesInr: number; tdsInr: number };

export type ReceiptPreview = {
  incentiveId: string;
  code: string;
  linkInvoice: boolean;
  totalInr: number;
  lines: { userId: string; userName: string; role: "SELLER" | "MANAGER"; ratePct: number; basisAmount: number; basisInr: number; amountInr: number; availableOn: Date }[];
};

/** The incentive an invoice counts towards: the one it's linked to, or the client's approved one with base left. */
async function incentiveForInvoice(inv: InvoiceForReceipt) {
  if (inv.incentiveId) return { inc: await prisma.salesIncentive.findUnique({ where: { id: inv.incentiveId } }), link: false };
  const candidates = await prisma.salesIncentive.findMany({ where: { clientId: inv.clientId, status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  for (const inc of candidates) {
    if (inc.projectId && inc.projectId !== inv.projectId) continue;
    // Invoices issued well before the deal was won are older work, not this deal.
    if (inc.wonAt && inv.issueDate.getTime() < inc.wonAt.getTime() - 7 * DAY) continue;
    if ((await countedSoFar(inc.id)) < (inc.baseAmount ?? 0) - 0.005) return { inc, link: true };
  }
  return { inc: null, link: false };
}

async function countedSoFar(incentiveId: string, db: Db = db0) {
  const rows = await db.incentiveEntry.findMany({ where: { incentiveId, role: "SELLER", type: { in: ["ACCRUAL", "REVERSAL"] } }, select: { basisAmount: true } });
  return rows.reduce((s, r) => s + r.basisAmount, 0);
}

/**
 * What a receipt earns: the share of the payment that is service revenue (no GST, no pass-through costs), up to
 * what's left of the qualifying base, times the seller's and manager's rates. Null when nothing is earned.
 */
export async function previewReceipt(inv: InvoiceForReceipt, pay: ReceiptInput): Promise<ReceiptPreview | null> {
  const { inc, link } = await incentiveForInvoice(inv);
  if (!inc || inc.status !== "APPROVED" || !inc.sellerUserId || !(inc.baseAmount && inc.baseAmount > 0) || inv.total <= 0 || pay.amountUsd <= 0) return null;
  const passThrough = inv.lines.filter((l) => l.kind === "PASS_THROUGH").reduce((s, l) => s + l.amount, 0);
  const preTax = inv.subtotal ?? inv.total - inv.taxAmount;
  const share = Math.max(0, Math.min(1, (preTax - passThrough) / inv.total));
  const eligible = pay.amountUsd * share; // in the invoice's currency
  const toIncentiveCurrency = inv.currency === inc.currency ? 1 : inc.currency === "INR" ? inv.fxRate : 1 / inv.fxRate;
  const left = inc.baseAmount - (await countedSoFar(inc.id));
  const counted = Math.min(eligible * toIncentiveCurrency, left);
  if (counted <= 0.005) return null;
  // ₹ per unit of the incentive's currency, as this receipt actually landed (TDS and bank charges are still revenue).
  const grossInr = pay.inrReceived + pay.bankChargesInr + pay.tdsInr;
  const inrPerInvoiceUnit = inv.currency === "INR" ? 1 : grossInr > 0 ? grossInr / pay.amountUsd : inv.fxRate;
  const basisInr = r2((counted / toIncentiveCurrency) * inrPerInvoiceUnit);
  const { holdDays } = await getSettings();
  const availableOn = new Date(pay.date.getTime() + holdDays * DAY);
  const amounts = split(basisInr, inc);
  const lines: ReceiptPreview["lines"] = [
    { userId: inc.sellerUserId, userName: inc.sellerName ?? "Seller", role: "SELLER", ratePct: inc.sellerRatePct, basisAmount: r2(counted), basisInr, amountInr: amounts.seller, availableOn },
  ];
  if (amounts.manager && inc.managerUserId) lines.push({ userId: inc.managerUserId, userName: inc.managerName ?? "Manager", role: "MANAGER", ratePct: inc.managerRatePct, basisAmount: 0, basisInr, amountInr: amounts.manager, availableOn });
  return { incentiveId: inc.id, code: inc.code, linkInvoice: link, totalInr: r2(lines.reduce((s, l) => s + l.amountInr, 0)), lines };
}

/** Write a previewed receipt's lines (inside Finance's payment transaction). */
export async function writeReceipt(db: Db, p: ReceiptPreview, o: { paymentId: string; invoiceId: string; invoiceNumber: string; date: Date; by: By }) {
  if (p.linkInvoice) await db.invoice.update({ where: { id: o.invoiceId }, data: { incentiveId: p.incentiveId } });
  for (const l of p.lines) {
    await db.incentiveEntry.create({
      data: { incentiveId: p.incentiveId, userId: l.userId, userName: l.userName, role: l.role, type: "ACCRUAL", paymentId: o.paymentId, invoiceNumber: o.invoiceNumber, basisAmount: l.basisAmount, basisInr: l.basisInr, ratePct: l.ratePct, amountInr: l.amountInr, date: o.date, availableOn: l.availableOn, createdBy: o.by.name },
    });
  }
  if (p.linkInvoice) await log(db, p.incentiveId, "FINANCE", o.by, "invoice", null, o.invoiceNumber, "first receipt: counted automatically");
}

/**
 * A receipt is deleted: its incentive lines not yet in a pay run go with it; lines already paid (or in a pay run)
 * are offset by a reversal that the next pay run recovers. Call before deleting the payment.
 */
export async function receiptDeleted(paymentId: string, by: By) {
  const rows = await prisma.incentiveEntry.findMany({ where: { paymentId } });
  if (!rows.length) return;
  const now = new Date();
  for (const e of rows) {
    if (!e.payRunId && !e.paidOn) await prisma.incentiveEntry.delete({ where: { id: e.id } });
    else
      await prisma.incentiveEntry.create({
        data: { incentiveId: e.incentiveId, userId: e.userId, userName: e.userName, role: e.role, type: "REVERSAL", basisAmount: -e.basisAmount, basisInr: -e.basisInr, ratePct: e.ratePct, amountInr: -e.amountInr, date: now, availableOn: now, note: `Receipt on ${e.invoiceNumber ?? "an invoice"} deleted`, createdBy: by.name },
      });
  }
  await log(db0, rows[0].incentiveId, "FINANCE", by, "receipt removed", rows[0].invoiceNumber, null, "payment deleted in Finance");
}

/** ₹ held for incentives from each receipt (to keep the fund split when receipts are re-split). */
export async function heldByPayment(paymentIds: string[]) {
  const rows = await prisma.incentiveEntry.findMany({ where: { paymentId: { in: paymentIds }, type: "ACCRUAL" }, select: { paymentId: true, amountInr: true } });
  const m = new Map<string, number>();
  for (const r of rows) if (r.paymentId) m.set(r.paymentId, r2((m.get(r.paymentId) ?? 0) + r.amountInr));
  return m;
}

// ---------- Pay runs (Finance) ----------

/** Lines ready by the end of the pay run's month, per People record. People with nothing to pay are left out. */
export async function payableForMonth(monthEnd: Date) {
  const [open, team] = await Promise.all([
    prisma.incentiveEntry.findMany({ where: { paidOn: null, payRunId: null, availableOn: { lt: monthEnd } }, include: { incentive: { select: { code: true } } }, orderBy: { date: "asc" } }),
    prisma.salesMember.findMany({ where: { personId: { not: null } }, select: { userId: true, personId: true } }),
  ]);
  const personOf = new Map(team.map((t) => [t.userId, t.personId!]));
  const byPerson = new Map<string, { personId: string; entryIds: string[]; total: number; codes: Set<string> }>();
  for (const e of open) {
    const personId = personOf.get(e.userId);
    if (!personId) continue;
    const r = byPerson.get(personId) ?? { personId, entryIds: [], total: 0, codes: new Set<string>() };
    r.entryIds.push(e.id);
    r.total = r2(r.total + e.amountInr);
    r.codes.add(e.incentive.code);
    byPerson.set(personId, r);
  }
  // A net recovery (negative) waits until there is something to recover it from.
  return [...byPerson.values()].filter((r) => r.total > 0).map((r) => ({ ...r, codes: [...r.codes] }));
}

export async function attachToPayRun(payRunId: string, entryIds: string[]) {
  if (entryIds.length) await prisma.incentiveEntry.updateMany({ where: { id: { in: entryIds }, paidOn: null }, data: { payRunId } });
}

/** A draft pay run is rebuilt, a line removed or the run deleted: its incentive lines go back to the wallet. */
export async function releasePayRun(payRunId: string, entryIds?: string[]) {
  await prisma.incentiveEntry.updateMany({ where: { payRunId, paidOn: null, ...(entryIds ? { id: { in: entryIds } } : {}) }, data: { payRunId: null } });
}

/** One person's incentive line removed from a draft pay run: their lines go back to the wallet. */
export async function releasePersonFromPayRun(payRunId: string, personId: string) {
  const users = await prisma.salesMember.findMany({ where: { personId }, select: { userId: true } });
  await prisma.incentiveEntry.updateMany({ where: { payRunId, paidOn: null, userId: { in: users.map((u) => u.userId) } }, data: { payRunId: null } });
}

export async function payRunPaid(payRunId: string, paidOn: Date) {
  await prisma.incentiveEntry.updateMany({ where: { payRunId, paidOn: null }, data: { paidOn } });
}

// ---------- Wallet ----------

export type WalletDeal = Awaited<ReturnType<typeof wallet>>["deals"][number];

/**
 * What someone can see of their incentives (and their team's): each deal with its status, how much of the base the
 * client has paid, and the money lines not yet paid (paid lines leave; only the total paid to date is shown).
 */
export async function wallet(userIds: string[] | "ALL") {
  const whereUser = userIds === "ALL" ? {} : { OR: [{ sellerUserId: { in: userIds } }, { managerUserId: { in: userIds } }] };
  const deals = await prisma.salesIncentive.findMany({
    where: { ...whereUser, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { entries: true },
  });
  const clientIds = [...new Set(deals.map((d) => d.clientId).filter((x): x is string => !!x))];
  const projectIds = [...new Set(deals.map((d) => d.projectId).filter((x): x is string => !!x))];
  const leadIds = [...new Set(deals.map((d) => d.leadId).filter((x): x is string => !!x))];
  const [clients, projects, leads, invoices] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, number: true, status: true } }),
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, status: true } }),
    prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, code: true } }),
    prisma.invoice.findMany({ where: { incentiveId: { in: deals.map((d) => d.id) } }, select: { incentiveId: true, number: true, status: true } }),
  ]);
  const now = new Date();
  return {
    deals: deals.map((d) => {
      const counted = d.entries.filter((e) => e.role === "SELLER" && e.type !== "ADJUSTMENT").reduce((s, e) => s + e.basisAmount, 0);
      const mine = (uid: string) => d.entries.filter((e) => e.userId === uid);
      return {
        id: d.id,
        code: d.code,
        status: d.status,
        client: clients.find((c) => c.id === d.clientId) ?? null,
        lead: leads.find((l) => l.id === d.leadId) ?? null,
        project: projects.find((p) => p.id === d.projectId) ?? null,
        invoices: invoices.filter((i) => i.incentiveId === d.id),
        seller: { id: d.sellerUserId, name: d.sellerName, ratePct: d.sellerRatePct },
        manager: d.managerUserId && d.managerUserId !== d.sellerUserId ? { id: d.managerUserId, name: d.managerName, ratePct: d.managerRatePct } : null,
        qualifying: d.qualifyingLabel,
        qualifyingKind: d.qualifyingKind,
        base: d.baseAmount,
        currency: d.currency,
        collected: r2(counted),
        collectedPct: d.baseAmount ? Math.min(100, Math.round((counted / d.baseAmount) * 100)) : 0,
        wonAt: d.wonAt,
        entries: d.entries,
        earnedBy: (uid: string) => r2(mine(uid).reduce((s, e) => s + e.amountInr, 0)),
        expectedFor: (uid: string) => {
          if (!d.baseAmount || !["APPROVED", "PENDING_APPROVAL", "DRAFT"].includes(d.status)) return 0;
          const rate = uid === d.sellerUserId ? d.sellerRatePct : uid === d.managerUserId && d.managerUserId !== d.sellerUserId ? d.managerRatePct : 0;
          // Estimate in ₹ for deals in another currency, at the receipts' rate so far (or the base as is).
          const perUnit = counted > 0 ? d.entries.filter((e) => e.role === "SELLER" && e.type !== "ADJUSTMENT").reduce((s, e) => s + e.basisInr, 0) / counted : 1;
          return r2(((d.baseAmount - counted) * perUnit * rate) / 100);
        },
        now,
      };
    }),
  };
}

// ---------- Owner report ----------

export type ReportRow = Awaited<ReturnType<typeof ownerReport>>["rows"][number];

/** Every deal won in the period, what changed between Won, onboarding and now, and the flags to look at. */
export async function ownerReport(since: Date) {
  const [deals, wonOpps, changes, team] = await Promise.all([
    prisma.salesIncentive.findMany({ where: { OR: [{ wonAt: { gte: since } }, { updatedAt: { gte: since } }, { status: { in: ["DRAFT", "PENDING_APPROVAL"] } }] }, orderBy: { wonAt: "desc" }, include: { changes: { orderBy: { at: "asc" } }, entries: true } }),
    prisma.opportunity.findMany({ where: { stage: "WON", wonAt: { gte: since } }, select: { id: true, code: true, title: true, wonAt: true, ownerName: true, onboardedAt: true, lead: { select: { id: true, name: true } } } }),
    prisma.incentiveChange.findMany({ where: { at: { gte: since } }, orderBy: { at: "desc" }, take: 200, include: { incentive: { select: { code: true } } } }),
    prisma.salesMember.findMany(),
  ]);
  const withRecord = new Set(deals.map((d) => d.opportunityId));
  const missing = wonOpps.filter((o) => !withRecord.has(o.id));
  // Lead reassignments in the week before each win.
  const leadIds = deals.map((d) => d.leadId).filter((x): x is string => !!x);
  const reassigned = await prisma.leadActivity.findMany({ where: { leadId: { in: leadIds }, type: "SYSTEM", text: { startsWith: "Assigned to" } }, select: { leadId: true, at: true, text: true } });
  const clientIds = deals.map((d) => d.clientId).filter((x): x is string => !!x);
  const unlinked = await prisma.invoice.findMany({ where: { clientId: { in: clientIds }, incentiveId: null, status: { in: ["PAID", "PARTIAL"] } }, select: { clientId: true, issueDate: true, number: true } });
  const opps = await prisma.opportunity.findMany({ where: { id: { in: deals.map((d) => d.opportunityId).filter((x): x is string => !!x) } }, select: { id: true, code: true, onboardedAt: true, lead: { select: { id: true, name: true } } } });
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, number: true } });
  const member = (id: string | null) => team.find((t) => t.userId === id);

  const rows = deals.map((d) => {
    const flags: string[] = [];
    const opp = opps.find((o) => o.id === d.opportunityId);
    const counted = d.entries.filter((e) => e.role === "SELLER" && e.type !== "ADJUSTMENT").reduce((s, e) => s + e.basisAmount, 0);
    if (d.status === "DRAFT" && (opp?.onboardedAt || (d.wonAt && Date.now() - d.wonAt.getTime() > 3 * DAY))) flags.push("NO_DECISION");
    if (d.status === "PENDING_APPROVAL") flags.push("PENDING");
    if (d.leadOwnerAtWonId && d.sellerUserId !== d.leadOwnerAtWonId) flags.push("SELLER_CHANGED");
    if (d.wonAt && reassigned.some((r) => r.leadId === d.leadId && r.at <= d.wonAt! && d.wonAt!.getTime() - r.at.getTime() < 7 * DAY)) flags.push("LATE_REASSIGN");
    if (d.wonValue && d.baseAmount && d.wonCurrency === d.currency && Math.abs(d.baseAmount - d.wonValue) / d.wonValue > 0.1) flags.push("VALUE_CHANGED");
    if (d.newClient === false) flags.push("NOT_NEW");
    if (d.decidedById && (d.decidedById === d.sellerUserId || d.decidedById === d.managerUserId)) flags.push("SELF_DECIDED");
    if (d.status === "NOT_ELIGIBLE" && member(d.sellerUserId)?.onIncentive) flags.push("NO_INCENTIVE_ON_PLAN");
    if (d.status === "APPROVED" && (!member(d.sellerUserId)?.personId || (d.managerUserId && d.managerUserId !== d.sellerUserId && !member(d.managerUserId)?.personId))) flags.push("NO_PERSON");
    if (d.status === "APPROVED" && d.clientId && counted < (d.baseAmount ?? 0) && unlinked.some((i) => i.clientId === d.clientId && (!d.wonAt || i.issueDate.getTime() >= d.wonAt.getTime() - 7 * DAY))) flags.push("UNLINKED_RECEIPTS");
    if (d.decidedAt && d.changes.some((c) => c.stage === "OWNER" && c.at > d.decidedAt!)) flags.push("CHANGED_AFTER_APPROVAL");
    return {
      id: d.id,
      code: d.code,
      status: d.status,
      opportunity: opp ? { code: opp.code, onboardedAt: opp.onboardedAt } : null,
      account: clients.find((c) => c.id === d.clientId) ?? (opp?.lead ? { id: opp.lead.id, name: opp.lead.name, number: null } : null),
      wonAt: d.wonAt,
      wonSummary: d.wonSummary,
      wonValue: d.wonValue,
      wonCurrency: d.wonCurrency,
      leadOwnerAtWon: d.leadOwnerAtWon,
      seller: d.sellerName,
      manager: d.managerUserId && d.managerUserId !== d.sellerUserId ? d.managerName : null,
      qualifying: d.qualifyingLabel,
      base: d.baseAmount,
      currency: d.currency,
      collected: r2(counted),
      earnedInr: r2(d.entries.reduce((s, e) => s + e.amountInr, 0)),
      paidInr: r2(d.entries.filter((e) => e.paidOn).reduce((s, e) => s + e.amountInr, 0)),
      decidedBy: d.decidedByName,
      proposedBy: d.proposedByName,
      duplicateNote: d.duplicateNote,
      flags,
      changes: d.changes.length,
    };
  });
  return { rows, missing, changes };
}

/** One deal with everything about it (detail page). */
export async function detail(id: string) {
  const d = await prisma.salesIncentive.findUniqueOrThrow({ where: { id }, include: { entries: { orderBy: { date: "asc" } }, changes: { orderBy: { at: "asc" } } } });
  const [client, opp, lead, invoices, clientInvoices] = await Promise.all([
    d.clientId ? prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true, name: true, number: true, code: true, status: true, gstin: true, pan: true, cin: true, ein: true } }) : null,
    d.opportunityId ? prisma.opportunity.findUnique({ where: { id: d.opportunityId }, select: { id: true, code: true, title: true, onboardedAt: true } }) : null,
    d.leadId ? prisma.lead.findUnique({ where: { id: d.leadId }, select: { id: true, code: true, name: true, ownerName: true, stage: true } }) : null,
    prisma.invoice.findMany({ where: { incentiveId: id }, select: { id: true, number: true, status: true, total: true, currency: true, issueDate: true } }),
    d.clientId ? prisma.invoice.findMany({ where: { clientId: d.clientId, incentiveId: null, status: { not: "VOID" } }, select: { id: true, number: true, status: true, total: true, currency: true, issueDate: true } }) : [],
  ]);
  return { d, services: parseServices(d.services), client, opp, lead, invoices, clientInvoices };
}

/** Incentives waiting for an onboarding decision, by opportunity (the onboarding page shows them with each deal). */
export async function forOpportunities(opportunityIds: string[]) {
  const rows = await prisma.salesIncentive.findMany({ where: { opportunityId: { in: opportunityIds } } });
  return new Map(rows.map((r) => [r.opportunityId!, r]));
}
