"use server";

// The Distribute page: hand out the pool by rotation, move leads to a person, and the inactivity rotation settings.
// Who may do what is in lib/distribution.ts (checkMove) and lib/scope.ts.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { audit } from "@genclover/db/audit";
import { errMsg, type Result } from "@genclover/ui/result";
import { distLeads, distribute, MOVE_CLASS_LABEL, type MoveClass, moveLeads, parseDistFilters, planMove, ROTATABLE_STAGES, rotatableForHandOut, rotationPeople, saveRotationSettings } from "../lib/distribution";
import { distAccessFor } from "../lib/scope";

type Viewer = { id: string; role: string; name: string };

const Target = z.object({ ids: z.array(z.string()).max(3000).optional(), query: z.string().max(2000).optional() });

/** The selected leads, or every lead matching the page's filters ("all matching"). */
async function targets(u: Viewer, t: z.infer<typeof Target>) {
  const a = await distAccessFor(u);
  if (t.ids?.length) return { a, ids: t.ids };
  const f = parseDistFilters(Object.fromEntries(new URLSearchParams(t.query ?? "")));
  return { a, ids: (await distLeads(f, { canPool: a.canPool, team: a.team })).map((l) => l.id) };
}

/** Hand leads out by rotation (score bands, evened out over runs). Managers: the pool only. Owners also re-deal
 * owned leads, but only those the move rules let go freely (New to Contacted, Snoozed; not one being worked). */
export async function distributeByRotation(input: z.input<typeof Target>): Promise<Result> {
  try {
    const user = await assertPermission("leads.edit");
    const { a, ids } = await targets(user, Target.parse(input));
    if (!a.canPool) throw new Error("Handing out leads needs the owner's permission (Sales team → Can generate leads)");
    const leads = await prisma.lead.findMany({ where: { id: { in: ids }, stage: { in: ROTATABLE_STAGES } }, select: { id: true, ownerId: true } });
    const owned = a.owner ? await rotatableForHandOut(user, leads.filter((l) => l.ownerId).map((l) => l.id)) : { ids: [], kept: 0 };
    const allowed = leads.filter((l) => !l.ownerId || owned.ids.includes(l.id));
    if (!allowed.length) throw new Error(a.owner ? `Nothing to hand out (won, lost and not-a-fit leads never rotate${owned.kept ? `; ${owned.kept} are being worked: move them with Move to…` : ""})` : "Managers hand out pool leads only");
    const people = await rotationPeople();
    const exclude = new Map(allowed.filter((l) => l.ownerId).map((l) => [l.id, l.ownerId!]));
    const res = await distribute(allowed.map((l) => l.id), people, { by: user, via: "ROTATION", exclude });
    const summary = res.filter((r) => r.count).map((r) => `${r.name} ${r.count}`).join(", ");
    await audit(user, "UPDATE", "Lead", null, `Rotation: ${allowed.length} lead(s) handed out (${summary})`);
    revalidatePath("/leads/distribute");
    revalidatePath("/leads/list");
    const kept = owned.kept ? ` ${owned.kept} being worked stayed with their owner (use Move to… with a reason).` : "";
    return { ok: true, message: `${res.reduce((n, r) => n + r.count, 0)} lead(s) handed out: ${summary || "nobody"}.${kept}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export type MovePreview = {
  ok: boolean;
  message: string;
  to?: string;
  owner?: boolean;
  groups?: { cls: MoveClass; label: string; leads: { id: string; code: string; name: string; owner: string | null; note: string }[] }[];
};

async function moveTargets(input: z.input<typeof Target> & { to: string | null }) {
  const user = await assertPermission("leads.edit");
  const { a, ids } = await targets(user, Target.parse(input));
  if (!a.canMove) throw new Error("Moving leads needs the owner's permission (Sales team → Can move team leads)");
  if (!input.to && !a.owner) throw new Error("Only an owner can put leads back in the pool");
  if (!ids.length) throw new Error("Nothing selected");
  return { user, ids };
}

/** What a move would do, grouped by rule, before anything changes. */
export async function previewMove(input: z.input<typeof Target> & { to: string | null }): Promise<MovePreview> {
  try {
    const { user, ids } = await moveTargets(input);
    const p = await planMove(user, ids, input.to);
    const order: MoveClass[] = ["FREE", "WARN", "REASON", "OWNER_REASON", "FORCE", "BLOCKED", "SAME"];
    const groups = order
      .map((cls) => ({ cls, label: MOVE_CLASS_LABEL[cls], leads: p.items.filter((i) => i.cls === cls).map((i) => ({ id: i.id, code: i.code, name: i.name, owner: i.owner, note: i.note })) }))
      .filter((g) => g.leads.length);
    return { ok: true, message: "", to: p.to?.name ?? "the pool", owner: p.owner, groups };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/**
 * Move leads to one person, or back to the pool (owners), by the stage rules (lib/distribution.ts): a reason moves
 * the ones that need one, "force" (owners, with a reason) moves won ones; the rest are skipped and listed.
 */
export async function moveTo(input: z.input<typeof Target> & { to: string | null; note?: string; reason?: string; force?: boolean }): Promise<Result> {
  try {
    const { user, ids } = await moveTargets(input);
    const reason = z.string().trim().max(500).optional().parse(input.reason);
    const r = await moveLeads(user, ids, input.to, { reason, force: !!input.force, note: input.note?.trim() || undefined });
    revalidatePath("/leads/distribute");
    revalidatePath("/leads/list");
    for (const id of ids.slice(0, 1)) revalidatePath(`/leads/${id}`);
    const skipped = r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped.slice(0, 5).map((i) => i.code).join(", ")}${r.skipped.length > 5 ? "…" : ""}.` : "";
    return { ok: r.moved > 0, message: `${r.moved} lead(s) ${input.to ? "moved" : "back in the pool"}.${skipped}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function saveRotation(input: { enabled: boolean; idleDays: number; warnDays: number; stages: string[] }): Promise<Result> {
  try {
    const user = await assertPermission("leads.manage");
    const d = z
      .object({ enabled: z.boolean(), idleDays: z.number().int().min(3).max(365), warnDays: z.number().int().min(0).max(60), stages: z.array(z.enum(ROTATABLE_STAGES as [string, ...string[]])) })
      .parse(input);
    if (d.warnDays >= d.idleDays) throw new Error("The warning must come before the rotation");
    await saveRotationSettings(d);
    await audit(user, "UPDATE", "Setting", null, `Lead rotation: ${d.enabled ? "on" : "off"}, ${d.idleDays} days idle (warning ${d.warnDays} days before), stages ${d.stages.join(", ") || "none"}`);
    revalidatePath("/leads/distribute");
    return { ok: true, message: "Saved. The worker checks once a day." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}
