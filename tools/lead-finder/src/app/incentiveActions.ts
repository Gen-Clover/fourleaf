"use server";

// Sales incentives: approving, owner corrections and adjustments, counting an invoice, the sales team set-up and
// the incentive settings. The rules and the money live in @genclover/incentives; every change is logged there.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission, can } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { audit } from "@genclover/db/audit";
import * as inc from "@genclover/incentives";
import type { ServiceLine } from "@genclover/incentives/rules";
import { type Result, fail } from "@genclover/ui/result";

const touch = (id?: string) => {
  revalidatePath("/leads/incentives");
  revalidatePath("/leads/incentives/review");
  if (id) revalidatePath(`/leads/incentives/${id}`);
};

const Line = z.object({
  key: z.string().min(1),
  label: z.string().trim().min(1, "Every service needs a name").max(120),
  kind: z.enum(["ONE_TIME", "MONTHLY"]),
  value: z.number().min(0).nullable(),
});
const Lines = z.array(Line).min(1, "List at least one service").max(30);

export async function approveIncentive(id: string, input: { approve: boolean; note?: string; services?: ServiceLine[]; pickedKey?: string | null }): Promise<Result> {
  try {
    const user = await assertPermission("incentives.approve", "incentives.manage");
    const services = input.services ? Lines.parse(input.services) : undefined;
    const saved = await inc.approve(id, { by: user, approve: input.approve, note: input.note, services, pickedKey: input.pickedKey, isOwner: can(user.role, "incentives.manage") });
    await audit(user, "UPDATE", "SalesIncentive", id, `${saved.code}: ${input.approve ? "approved" : "no incentive"}${input.note ? ` (${input.note})` : ""}`);
    touch(id);
    return { ok: true, message: `${saved.code} ${input.approve ? "approved" : "marked no incentive"}.` };
  } catch (e) {
    return fail(e);
  }
}

const Correction = z.object({
  sellerUserId: z.string().nullable().optional(),
  managerUserId: z.string().nullable().optional(),
  sellerRatePct: z.number().min(0).max(50).optional(),
  managerRatePct: z.number().min(0).max(50).optional(),
  services: Lines.optional(),
  pickedKey: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "NOT_ELIGIBLE", "CANCELLED"]).optional(),
  projectId: z.string().nullable().optional(),
  currency: z.enum(["INR", "USD"]).optional(),
});

/** An owner corrects anything, at any stage, with a reason (it goes in the change report). */
export async function correctIncentive(id: string, input: z.input<typeof Correction>, reason: string): Promise<Result> {
  try {
    const user = await assertPermission("incentives.manage");
    const c = Correction.parse(input);
    const saved = await inc.correct(id, c, { by: user, reason });
    await audit(user, "UPDATE", "SalesIncentive", id, `${saved.code}: corrected (${reason})`);
    touch(id);
    return { ok: true, message: "Saved. The change is in the report." };
  } catch (e) {
    return fail(e);
  }
}

export async function adjustIncentive(id: string, input: { role: "SELLER" | "MANAGER"; amountInr: number; reason: string }): Promise<Result> {
  try {
    const user = await assertPermission("incentives.manage");
    const d = z.object({ role: z.enum(["SELLER", "MANAGER"]), amountInr: z.number().refine((n) => n !== 0, "Enter an amount"), reason: z.string().trim().min(1, "Give a reason") }).parse(input);
    await inc.adjust(id, { by: user, ...d });
    await audit(user, "UPDATE", "SalesIncentive", id, `Adjustment ${d.role.toLowerCase()} ₹${d.amountInr} (${d.reason})`);
    touch(id);
    return { ok: true, message: "Adjustment added: it's paid (or recovered) in the next pay run." };
  } catch (e) {
    return fail(e);
  }
}

/** Count an invoice towards this incentive (or stop counting it). Only receipts recorded after this are affected. */
export async function linkInvoice(incentiveId: string, invoiceId: string, link: boolean, reason?: string): Promise<Result> {
  try {
    const user = await assertPermission("incentives.manage");
    await inc.setInvoiceLink(invoiceId, link ? incentiveId : null, user, reason);
    await audit(user, "UPDATE", "SalesIncentive", incentiveId, `Invoice ${link ? "counted" : "no longer counted"}`);
    touch(incentiveId);
    return { ok: true, message: link ? "Counted: its next receipts earn the incentive." : "No longer counted." };
  } catch (e) {
    return fail(e);
  }
}

const Member = z.object({
  userId: z.string().min(1),
  managerUserId: z.string().nullable(),
  onIncentive: z.boolean(),
  personId: z.string().nullable(),
  active: z.boolean(),
  canGenerateLeads: z.boolean().optional(),
  canReassignTeam: z.boolean().optional(),
});

export async function saveTeamMember(input: z.input<typeof Member>): Promise<Result> {
  try {
    const user = await assertPermission("incentives.manage");
    const m = Member.parse(input);
    // The rotation hands leads only to people who can work them.
    const who = await prisma.user.findUniqueOrThrow({ where: { id: m.userId }, select: { name: true, role: true } });
    if (m.active && !can(who.role, "leads.edit")) throw new Error(`${who.name}'s role can't work leads: untick "In the lead rotation", or change their role first`);
    const saved = await inc.saveMember(m);
    await audit(user, "UPDATE", "SalesMember", saved.id, `${saved.userName}: manager ${saved.managerName ?? "none"}, ${saved.onIncentive ? "on incentives" : "not on incentives"}, ${saved.active ? "in the rotation" : "not in the rotation"}${saved.canGenerateLeads ? ", can generate leads" : ""}${saved.canReassignTeam ? ", can move team leads" : ""}${saved.personId ? "" : ", no People record"}`);
    revalidatePath("/leads/distribute");
    revalidatePath("/leads/incentives/team");
    return { ok: true, message: `${saved.userName} saved. New deals use this; deals already won keep their seller and manager.` };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Take someone off the sales team. Refused while they still own open leads (move those first on Distribute, so no
 * lead is left with an owner who isn't on the team). Won deals and incentives stay as they are.
 */
export async function removeTeamMember(userId: string): Promise<Result> {
  try {
    const user = await assertPermission("incentives.manage");
    const m = await prisma.salesMember.findUnique({ where: { userId } });
    if (!m) return { ok: true, message: "Not on the sales team." };
    const open = await prisma.lead.count({ where: { ownerId: userId, stage: { notIn: ["WON", "LOST", "NOT_A_FIT"] } } });
    if (open) throw new Error(`${m.userName} still owns ${open} open lead(s). Move them first (Pipeline → Distribute → Assigned, Owner = ${m.userName}), then remove.`);
    const orphaned = await inc.removeMember(userId);
    await audit(user, "DELETE", "SalesMember", m.id, `${m.userName} removed from the sales team${orphaned.length ? `; no manager now: ${orphaned.join(", ")}` : ""}`);
    revalidatePath("/leads/incentives/team");
    revalidatePath("/leads/distribute");
    return { ok: true, message: `${m.userName} removed.${orphaned.length ? ` ${orphaned.join(", ")} now ha${orphaned.length > 1 ? "ve" : "s"} no manager: pick a new one.` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveIncentiveSettings(input: { sellerPct: number; managerPct: number; holdDays: number }): Promise<Result> {
  try {
    const user = await assertPermission("incentives.manage");
    const s = z.object({ sellerPct: z.number().min(0).max(50), managerPct: z.number().min(0).max(50), holdDays: z.number().int().min(0).max(180) }).parse(input);
    await inc.saveSettings(s);
    await audit(user, "UPDATE", "Setting", null, `Sales incentives: seller ${s.sellerPct}%, manager ${s.managerPct}%, hold ${s.holdDays} days`);
    revalidatePath("/leads/incentives/team");
    return { ok: true, message: "Saved. Rates apply to deals won from now on; the hold applies to receipts from now on." };
  } catch (e) {
    return fail(e);
  }
}
