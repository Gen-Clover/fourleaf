// Handing out leads fairly, moving them, and rotating the ones nobody works.
//
//   Pool        Leads from searches and imports belong to nobody until they're handed out (Distribute page).
//   Rotation    Leads are grouped into score bands (hot to cold) and each band is split evenly between the people in
//               the rotation (active sales managers and sellers), dealt best-first so each person gets the same mix.
//               When a band doesn't divide evenly, the extra leads go to whoever has had the fewest extras in that
//               band (then the fewest open leads, then the longest wait), so whoever got one less this time gets one
//               more next time.
//   Moving      Owners move any lead to anyone on the sales team (won leads too). A manager the owner allows moves
//               any lead that isn't won to anyone on the team but themselves. Everyone else can't move leads.
//   Inactivity  The worker rotates leads their owner hasn't worked for N days (stages the owner ticks), after a
//               warning; they go to someone else in the rotation, never back to the same person.
// No Next.js or server-only imports: the worker runs rotateInactive.
import { can } from "@genclover/auth/access";
import { prisma } from "@genclover/db";
import { CLOSED_STAGES, OPEN_STAGES, STAGE_LABEL } from "./services";

type By = { id: string | null; name: string };
type Viewer = { id: string; role: string; name: string };

const DAY = 86_400_000;

// ---------- Score bands ----------

export const BANDS = [
  { key: "A", label: "80–100", min: 80 },
  { key: "B", label: "60–79", min: 60 },
  { key: "C", label: "40–59", min: 40 },
  { key: "D", label: "20–39", min: 20 },
  { key: "E", label: "1–19", min: 1 },
  { key: "U", label: "Not scored", min: -Infinity },
] as const;
export const bandOf = (score: number | null | undefined) => (score && score > 0 ? BANDS.find((b) => score >= b.min)!.key : "U");
export const bandLabel = (key: string) => BANDS.find((b) => b.key === key)?.label ?? key;

// ---------- Settings ----------

const ROTATION_KEYS = { rotationEnabled: 1, rotationIdleDays: 30, rotationWarnDays: 7 };
/** Stages the inactivity rotation applies to by default: early stages. Meetings and proposals are left alone. */
export const DEFAULT_ROTATION_STAGES = ["NEW", "QUALIFIED", "CONTACTED", "REPLIED"];
export const ROTATABLE_STAGES: string[] = [...OPEN_STAGES, "SNOOZED"].filter((s) => !CLOSED_STAGES.includes(s));

export async function rotationSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...Object.keys(ROTATION_KEYS), "rotationStages"] } } });
  const v = (k: keyof typeof ROTATION_KEYS) => {
    const r = rows.find((x) => x.key === k);
    return r && Number.isFinite(Number(r.value)) ? Number(r.value) : ROTATION_KEYS[k];
  };
  let stages = DEFAULT_ROTATION_STAGES;
  try {
    const raw = rows.find((x) => x.key === "rotationStages")?.value;
    if (raw) stages = (JSON.parse(raw) as string[]).filter((s) => ROTATABLE_STAGES.includes(s));
  } catch {
    // keep the default
  }
  return { enabled: v("rotationEnabled") === 1, idleDays: v("rotationIdleDays"), warnDays: v("rotationWarnDays"), stages };
}

export async function saveRotationSettings(s: { enabled: boolean; idleDays: number; warnDays: number; stages: string[] }) {
  const rows: [string, string, string, string, string][] = [
    ["rotationEnabled", s.enabled ? "1" : "0", "Rotate inactive leads", "", "1 = on"],
    ["rotationIdleDays", String(s.idleDays), "Rotate after no activity for", "days", ""],
    ["rotationWarnDays", String(s.warnDays), "Warn the owner this many days before", "days", ""],
    ["rotationStages", JSON.stringify(s.stages.filter((x) => ROTATABLE_STAGES.includes(x))), "Stages that rotate", "", "JSON list of stages"],
  ];
  for (const [key, value, label, unit, description] of rows) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value, label, unit, description, group: "Lead rotation", type: key === "rotationStages" ? "text" : "number" } });
  }
}

// ---------- People in the rotation ----------

/** Active sales managers and sellers (Sales team page), with their open lead counts. */
export async function rotationPeople() {
  const members = await prisma.salesMember.findMany({ where: { active: true } });
  // Only people whose role can work leads: a CFO or accountant ticked by mistake gets nothing.
  const users = (await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) }, active: true }, select: { id: true, name: true, role: true } })).filter((u) => can(u.role, "leads.edit"));
  const open = await prisma.lead.groupBy({ by: ["ownerId"], where: { ownerId: { in: users.map((u) => u.id) }, stage: { in: [...OPEN_STAGES, "SNOOZED"] } }, _count: { _all: true } });
  return users.map((u) => ({ id: u.id, name: u.name, open: open.find((o) => o.ownerId === u.id)?._count._all ?? 0, managerUserId: members.find((m) => m.userId === u.id)?.managerUserId ?? null }));
}

// ---------- Assigning ----------

export type AssignVia = "SELF" | "ROTATION" | "MANUAL" | "TEAM" | "EXPIRY" | "WON_FIX";
const VIA_TEXT: Record<AssignVia, string> = { SELF: "added it", ROTATION: "rotation", MANUAL: "assigned by an owner", TEAM: "moved by their manager", EXPIRY: "rotated: no activity", WON_FIX: "won lead corrected by an owner" };

/** Give leads to one person (or nobody), logging each one on the lead's timeline. */
export async function assignLeads(leadIds: string[], to: { id: string; name: string } | null, o: { by: By; via: AssignVia; note?: string }) {
  if (!leadIds.length) return 0;
  const now = new Date();
  await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { ownerId: to?.id ?? null, ownerName: to?.name ?? null, assignedAt: to ? now : null, assignedVia: to ? o.via : null, rotationWarnedAt: null } });
  await prisma.leadActivity.createMany({
    data: leadIds.map((leadId) => ({ leadId, type: "SYSTEM", text: to ? `Assigned to ${to.name} (${VIA_TEXT[o.via]})${o.note ? `: ${o.note}` : ""}` : `Back to the pool${o.note ? `: ${o.note}` : ""}`, byId: o.by.id, byName: o.by.name, service: null, step: null })),
  });
  return leadIds.length;
}

/**
 * Split leads between people fairly by score band (see the top of this file). Returns how many each person got.
 * exclude: people who must not receive a given lead (its current owner, when rotating for inactivity).
 */
export async function distribute(leadIds: string[], people: { id: string; name: string; open: number }[], o: { by: By; via: AssignVia; exclude?: Map<string, string> }) {
  if (!people.length) throw new Error("Nobody is in the rotation: mark sales people active on the Sales team page");
  const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, bestScore: true, ownerId: true } });
  const counters = await prisma.leadRotation.findMany({ where: { userId: { in: people.map((p) => p.id) } } });
  const counter = (userId: string, band: string) => counters.find((c) => c.userId === userId && c.band === band);
  // Someone new to a band starts level with the others' fewest extras, so they don't take every extra for weeks.
  const floorExtras = (band: string) => {
    const known = people.map((p) => counter(p.id, band)?.extras).filter((x): x is number => x != null);
    return known.length ? Math.min(...known) : 0;
  };
  const given = new Map<string, string[]>(people.map((p) => [p.id, []]));
  const extrasGiven = new Map<string, number>();
  const openNow = new Map(people.map((p) => [p.id, p.open]));

  for (const band of BANDS.map((b) => b.key)) {
    const inBand = leads.filter((l) => bandOf(l.bestScore) === band).sort((a, b) => b.bestScore - a.bestScore);
    if (!inBand.length) continue;
    // Who gets the band's extras first: fewest extras so far, then fewest open leads, then the longest wait.
    const order = [...people].sort((a, b) => {
      const ea = counter(a.id, band)?.extras ?? floorExtras(band);
      const eb = counter(b.id, band)?.extras ?? floorExtras(band);
      if (ea !== eb) return ea - eb;
      if (openNow.get(a.id)! !== openNow.get(b.id)!) return openNow.get(a.id)! - openNow.get(b.id)!;
      return (counter(a.id, band)?.lastAssignedAt?.getTime() ?? 0) - (counter(b.id, band)?.lastAssignedAt?.getTime() ?? 0);
    });
    const even = Math.floor(inBand.length / order.length);
    const extras = inBand.length % order.length;
    // Deal best-first, one each in turn, so everyone gets the same mix of the band; the first `extras` people get one more.
    let i = 0;
    for (const lead of inBand) {
      let tries = 0;
      let p = order[i % order.length];
      // A lead never goes back to the person it is being taken from.
      while (o.exclude?.get(lead.id) === p.id && tries < order.length) {
        i++;
        tries++;
        p = order[i % order.length];
      }
      if (o.exclude?.get(lead.id) === p.id) continue; // only that person is in the rotation
      given.get(p.id)!.push(lead.id);
      openNow.set(p.id, openNow.get(p.id)! + 1);
      i++;
    }
    const now = new Date();
    for (const [k, p] of order.entries()) {
      const got = given.get(p.id)!.filter((id) => inBand.some((l) => l.id === id)).length;
      if (!got) continue;
      const extra = k < extras && got > even ? 1 : 0;
      if (extra) extrasGiven.set(p.id, (extrasGiven.get(p.id) ?? 0) + 1);
      const c = counter(p.id, band);
      if (c) await prisma.leadRotation.update({ where: { id: c.id }, data: { extras: { increment: extra }, received: { increment: got }, lastAssignedAt: now } });
      else await prisma.leadRotation.create({ data: { userId: p.id, band, extras: floorExtras(band) + extra, received: got, lastAssignedAt: now } });
    }
  }
  const result: { id: string; name: string; count: number }[] = [];
  for (const p of people) {
    const ids = given.get(p.id)!;
    if (ids.length) await assignLeads(ids, p, { by: o.by, via: o.via });
    result.push({ id: p.id, name: p.name, count: ids.length });
  }
  return result;
}

// ---------- Moving (who may move what) ----------

/**
 * Check a move and return the receiver. Owners: any lead to anyone in the sales team. A manager the owner allows:
 * their team's leads, not won, to someone in their team. Nobody else.
 */
export async function checkMove(user: Viewer, toUserId: string | null) {
  const members = await prisma.salesMember.findMany();
  const owner = can(user.role, "leads.manage");
  const to = toUserId ? await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, name: true, active: true, role: true } }) : null;
  if (toUserId && (!to || !to.active)) throw new Error("Pick an active person");
  if (to && !can(to.role, "leads.edit")) throw new Error(`${to.name}'s role can't work leads`);
  if (to && !members.some((m) => m.userId === to.id && m.active) && to.id !== user.id) throw new Error(`${to.name} isn't in the sales team (Lead Finder → Sales team)`);
  if (owner) return { to, via: "MANUAL" as AssignVia };
  const me = members.find((m) => m.userId === user.id);
  if (!can(user.role, "leads.team") || !me?.canReassignTeam) throw new Error("Moving leads needs the owner's permission (Lead Finder → Sales team)");
  if (!to) throw new Error("Pick who gets them");
  // A manager allowed to move leads moves them to anyone on the sales team except themselves; which leads may move
  // depends on their stage (classify, below).
  if (to.id === user.id) throw new Error("Managers don't move leads to themselves: ask an owner");
  return { to, via: "TEAM" as AssignVia };
}

// ---------- Stage rules for moving a lead ----------
//
// The more a lead has been worked, the more its owner is protected:
//   FREE          New, Qualified, Lost, Not a fit (nobody is mid-conversation)
//   WARN          Contacted (messages sent, no reply), Snoozed: moves, with what the mover should know
//   REASON        Replied, or any lead past Contacted its owner worked in the last 7 days: moves with a reason
//   OWNER_REASON  Call / meeting, Proposal sent: owners only, with a reason
//   FORCE         Won: owners only, ticking "force" and giving a reason (the incentive is not moved)
//   BLOCKED       Do not contact (nobody should own it), or a rule above the mover's role
//   SAME          already theirs
// A move or a hand-out only ever moves what these rules allow; the rest is skipped and reported.

export type MoveClass = "FREE" | "WARN" | "REASON" | "OWNER_REASON" | "FORCE" | "BLOCKED" | "SAME";
export const MOVE_CLASS_LABEL: Record<MoveClass, string> = {
  FREE: "Will move",
  WARN: "Will move (read the note)",
  REASON: "Needs a reason",
  OWNER_REASON: "Owner only, with a reason",
  FORCE: "Won: an owner can force it, with a reason",
  BLOCKED: "Can't be moved",
  SAME: "Already theirs",
};
const RECENT_DAYS = 7;
const PAST_CONTACTED = ["REPLIED", "MEETING", "PROPOSAL", "SNOOZED"];
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

type PlanLead = {
  id: string;
  code: string;
  name: string;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  doNotContact: boolean;
  contactCount: number;
  lastContactAt: Date | null;
  snoozeUntil: Date | null;
  assignedAt: Date | null;
  createdAt: Date;
  lastReplyAt: Date | null;
};

/** Which rule applies to one lead, for this mover. */
export function classify(l: PlanLead, o: { owner: boolean; toUserId: string | null; workedRecently: boolean; workedOn: Date | null }): { cls: MoveClass; note: string } {
  if (l.doNotContact) return { cls: "BLOCKED", note: "Do not contact: nobody should own it" };
  if (o.toUserId !== null && l.ownerId === o.toUserId) return { cls: "SAME", note: "Already theirs" };
  if (l.stage === "WON") {
    return o.owner
      ? { cls: "FORCE", note: `Won by ${l.ownerName ?? "nobody"}: the incentive stays with the seller unless corrected on the incentive` }
      : { cls: "BLOCKED", note: "Won: only an owner can move it" };
  }
  if (l.stage === "MEETING" || l.stage === "PROPOSAL") {
    const what = l.stage === "MEETING" ? "In a call / meeting" : "Proposal sent";
    return o.owner ? { cls: "OWNER_REASON", note: `${what} with ${l.ownerName ?? "its owner"}` } : { cls: "BLOCKED", note: `${what}: only an owner can move it` };
  }
  if (l.stage === "REPLIED") return { cls: "REASON", note: `They replied to ${l.ownerName ?? "its owner"}${l.lastReplyAt ? ` on ${ymd(l.lastReplyAt)}` : ""}: a live conversation` };
  if (l.ownerId && PAST_CONTACTED.includes(l.stage) && o.workedRecently) return { cls: "REASON", note: `${l.ownerName ?? "Its owner"} worked it on ${ymd(o.workedOn)}` };
  if (l.stage === "CONTACTED") {
    return { cls: "WARN", note: `${l.ownerName ?? "Someone"} sent ${l.contactCount} message(s)${l.lastContactAt ? `, last on ${ymd(l.lastContactAt)}` : ""}: the follow-ups continue with the new owner` };
  }
  if (l.stage === "SNOOZED") return { cls: "WARN", note: `Snoozed until ${ymd(l.snoozeUntil)}: the date stays` };
  return { cls: "FREE", note: "" };
}

export type MovePlanItem = { id: string; code: string; name: string; stage: string; ownerId: string | null; owner: string | null; cls: MoveClass; note: string };

/** The rule for each lead. "Worked recently" means its owner did something on it (not just got it) in the last 7 days. */
async function classifyLeads(leadIds: string[], owner: boolean, toUserId: string | null): Promise<MovePlanItem[]> {
  const leads: PlanLead[] = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, code: true, name: true, stage: true, ownerId: true, ownerName: true, doNotContact: true, contactCount: true, lastContactAt: true, snoozeUntil: true, assignedAt: true, createdAt: true, lastReplyAt: true },
  });
  const worked = await lastWorked(leads.filter((l) => l.ownerId && PAST_CONTACTED.includes(l.stage)));
  const since = Date.now() - RECENT_DAYS * DAY;
  return leads.map((l) => {
    const w = worked.get(l.id) ?? null;
    const touched = !!w && w.getTime() > (l.assignedAt ?? l.createdAt).getTime() && w.getTime() >= since;
    const { cls, note } = classify(l, { owner, toUserId, workedRecently: touched, workedOn: w });
    return { id: l.id, code: l.code, name: l.name, stage: l.stage, ownerId: l.ownerId, owner: l.ownerName, cls, note };
  });
}

/** What a move would do, lead by lead, before anything changes (the preview). Checks who may move too. */
export async function planMove(user: Viewer, leadIds: string[], toUserId: string | null) {
  const { to, via } = await checkMove(user, toUserId);
  const owner = can(user.role, "leads.manage");
  const items = await classifyLeads(leadIds, owner, toUserId);
  const counts = Object.fromEntries((Object.keys(MOVE_CLASS_LABEL) as MoveClass[]).map((c) => [c, items.filter((i) => i.cls === c).length])) as Record<MoveClass, number>;
  return { to, via, owner, items, counts };
}

const canGo = (c: MoveClass, reason: string, force: boolean) =>
  c === "FREE" || c === "WARN" || ((c === "REASON" || c === "OWNER_REASON") && !!reason) || (c === "FORCE" && force && !!reason);

/**
 * Move leads by the stage rules. What needs a reason moves only with one; won leads only when an owner forces it;
 * blocked ones never. Open calls and meetings follow the lead; both people are emailed about protected moves.
 */
export async function moveLeads(user: Viewer, leadIds: string[], toUserId: string | null, o: { reason?: string; force?: boolean; note?: string } = {}) {
  const plan = await planMove(user, leadIds, toUserId);
  const reason = o.reason?.trim() ?? "";
  const go = plan.items.filter((i) => canGo(i.cls, reason, !!o.force));
  const skipped = plan.items.filter((i) => !canGo(i.cls, reason, !!o.force) && i.cls !== "SAME");
  if (!go.length) return { moved: 0, skipped, plan };
  const protectedMoves = go.filter((i) => i.cls === "REASON" || i.cls === "OWNER_REASON" || i.cls === "FORCE");
  const text = [o.note?.trim(), reason && `reason: ${reason}`].filter(Boolean).join("; ") || undefined;
  const viaOf = (i: MovePlanItem): AssignVia => (i.cls === "FORCE" ? "WON_FIX" : plan.via);
  for (const via of [...new Set(go.map(viaOf))]) await assignLeads(go.filter((i) => viaOf(i) === via).map((i) => i.id), plan.to, { by: user, via, note: text });
  // Open calls and meetings on these leads now belong to the new owner (back to the pool: they stay where they are).
  if (plan.to) await prisma.leadTask.updateMany({ where: { leadId: { in: go.map((i) => i.id) }, status: "OPEN" }, data: { assigneeId: plan.to.id, assigneeName: plan.to.name } });
  if (protectedMoves.length) await notifyMove(user, protectedMoves, plan.to, reason);
  // Written directly (not via @genclover/db/audit, which is server-only): this file also runs in the worker.
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      action: "UPDATE",
      entity: "Lead",
      entityId: null,
      summary: `${go.length} lead(s) moved to ${plan.to?.name ?? "the pool"}${protectedMoves.length ? ` (${protectedMoves.length} protected)` : ""}${skipped.length ? `; ${skipped.length} skipped` : ""}${text ? `: ${text}` : ""}`,
    },
  });
  return { moved: go.length, skipped, plan };
}

/** Email the people losing and gaining protected leads (Replied and later), when email is set up. Never blocks a move. */
async function notifyMove(by: Viewer, items: MovePlanItem[], to: { id: string; name: string } | null, reason: string) {
  try {
    const { emailConfigured, sendSystemEmail } = await import("./email");
    if (!emailConfigured()) return;
    const line = (i: MovePlanItem) => `· ${i.code} ${i.name} (${stageLabel(i.stage)})`;
    const ids = [...new Set([...items.map((i) => i.ownerId), to?.id].filter((x): x is string => !!x))];
    const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    for (const p of people) {
      const gaining = !!to && p.id === to.id;
      const mine = gaining ? items : items.filter((i) => i.ownerId === p.id);
      const subject = gaining ? `${mine.length} lead(s) moved to you` : `${mine.length} lead(s) moved from you to ${to?.name ?? "the pool"}`;
      const body = `${by.name} moved these leads ${gaining ? "to you" : `from you to ${to?.name ?? "the pool"}`}.\nReason: ${reason}\n\n${mine.map(line).join("\n")}`;
      await sendSystemEmail(p.email, subject, body).catch(() => false);
    }
  } catch {
    // A courtesy: a failure here never undoes or blocks the move.
  }
}

/** The leads a hand-out by rotation may take from their current owner (FREE and WARN only; protected ones stay). */
export async function rotatableForHandOut(user: Viewer, leadIds: string[]) {
  const items = await classifyLeads(leadIds, can(user.role, "leads.manage"), null);
  const ids = items.filter((i) => i.cls === "FREE" || i.cls === "WARN").map((i) => i.id);
  return { ids, kept: items.length - ids.length };
}

// ---------- Inactivity ----------

/**
 * When each lead was last worked by its owner: their last message, call, meeting, note, stage change or reply
 * (only opening the lead doesn't count), or when they got it, whichever is later.
 */
export async function lastWorked(leads: { id: string; ownerId: string | null; assignedAt: Date | null; createdAt: Date; lastReplyAt?: Date | null }[]) {
  const ids = leads.map((l) => l.id);
  const acts = ids.length
    ? await prisma.leadActivity.findMany({ where: { leadId: { in: ids }, type: { not: "SYSTEM" } }, orderBy: { at: "desc" }, select: { leadId: true, byId: true, at: true, type: true } })
    : [];
  // Newest first: the first matching activity per lead is its latest.
  const ownerOf = new Map(leads.map((l) => [l.id, l.ownerId]));
  const latest = new Map<string, Date>();
  for (const a of acts) if (!latest.has(a.leadId) && (a.byId === ownerOf.get(a.leadId) || a.type === "REPLY")) latest.set(a.leadId, a.at);
  const m = new Map<string, Date>();
  for (const l of leads) {
    let t = l.assignedAt ?? l.createdAt;
    const mine = latest.get(l.id);
    if (mine && mine > t) t = mine;
    if (l.lastReplyAt && l.lastReplyAt > t) t = l.lastReplyAt;
    m.set(l.id, t);
  }
  return m;
}

/**
 * The worker's daily pass: warn owners of leads that will rotate soon, and rotate the ones past the limit to
 * someone else in the rotation. Only the stages ticked in the settings; won, lost and not-a-fit never move.
 */
export async function rotateInactive(now = new Date()) {
  const s = await rotationSettings();
  if (!s.enabled || !s.stages.length) return { warned: 0, rotated: 0 };
  const candidates = await prisma.lead.findMany({
    where: { ownerId: { not: null }, stage: { in: s.stages }, doNotContact: false },
    select: { id: true, name: true, ownerId: true, ownerName: true, assignedAt: true, createdAt: true, lastReplyAt: true, rotationWarnedAt: true },
  });
  const worked = await lastWorked(candidates);
  const system: By = { id: null, name: "Lead rotation" };
  const idle = (id: string) => (now.getTime() - worked.get(id)!.getTime()) / DAY;
  const toRotate = candidates.filter((l) => idle(l.id) >= s.idleDays);
  const toWarn = candidates.filter((l) => idle(l.id) >= s.idleDays - s.warnDays && idle(l.id) < s.idleDays && (!l.rotationWarnedAt || l.rotationWarnedAt < worked.get(l.id)!));
  for (const l of toWarn) {
    const on = new Date(worked.get(l.id)!.getTime() + s.idleDays * DAY);
    await prisma.lead.update({ where: { id: l.id }, data: { rotationWarnedAt: now } });
    await prisma.leadActivity.create({ data: { leadId: l.id, type: "SYSTEM", text: `No activity for ${Math.floor(idle(l.id))} days: moves to someone else on ${on.toISOString().slice(0, 10)} unless ${l.ownerName ?? "the owner"} works it`, byId: null, byName: system.name } });
  }
  let rotated = 0;
  if (toRotate.length) {
    const people = await rotationPeople();
    if (people.length > 1) {
      const res = await distribute(toRotate.map((l) => l.id), people, { by: system, via: "EXPIRY", exclude: new Map(toRotate.map((l) => [l.id, l.ownerId!])) });
      rotated = res.reduce((n, r) => n + r.count, 0);
    }
  }
  return { warned: toWarn.length, rotated };
}

export const stageLabel = (s: string) => STAGE_LABEL[s] ?? s;

// ---------- The Distribute page's filters (also used by its "all matching" actions) ----------

export type DistFilters = {
  view: "pool" | "assigned" | "all";
  owner: string;
  stages: string[];
  idle: number; // at least this many days without the owner working it (0 = any)
  bands: string[];
  added: "" | "self" | "noself"; // added by hand by a person, or found by searches / imports
  market: string;
  q: string;
};

export function parseDistFilters(sp: Record<string, string | string[] | undefined>): DistFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  // Checkbox groups repeat the key (stage=NEW&stage=QUALIFIED); a comma list works too.
  const list = (k: string) => [sp[k] ?? []].flat().flatMap((v) => String(v).split(",")).map((x) => x.trim()).filter(Boolean);
  const view = one("view");
  return {
    view: view === "assigned" || view === "all" ? view : "pool",
    owner: /^[\w-]{1,40}$/.test(one("owner")) ? one("owner") : "",
    stages: list("stage").filter((s) => ROTATABLE_STAGES.includes(s) || s === "WON"),
    idle: Math.max(0, Math.min(365, Number(one("idle")) || 0)),
    bands: list("band").filter((b) => BANDS.some((x) => x.key === b)),
    added: one("added") === "self" ? "self" : one("added") === "noself" ? "noself" : "",
    market: ["IN", "US"].includes(one("market")) ? one("market") : "",
    q: one("q").trim().slice(0, 80),
  };
}

const bandWhere = (bands: string[]) =>
  bands.map((b) => {
    if (b === "U") return { bestScore: { lte: 0 } };
    const i = BANDS.findIndex((x) => x.key === b);
    const min = BANDS[i].min;
    const max = i === 0 ? 1000 : BANDS[i - 1].min;
    return { bestScore: { gte: min, lt: max } };
  });

/** The leads matching the filters that this person may act on (owners: all; managers: their team and, if allowed, the pool). */
export async function distWhere(f: DistFilters, opts: { canPool: boolean; team: string[] | null }) {
  const and: object[] = [{ doNotContact: false, branchOfId: null }];
  if (f.view === "pool") and.push({ ownerId: null });
  else if (f.view === "assigned") and.push({ ownerId: f.owner ? f.owner : { not: null } });
  else if (f.owner) and.push({ ownerId: f.owner });
  // A manager: their team's leads, plus the pool if they may hand it out.
  if (opts.team) and.push({ OR: [{ ownerId: { in: opts.team } }, ...(opts.canPool ? [{ ownerId: null }] : [])] });
  and.push({ stage: { in: f.stages.length ? f.stages : ROTATABLE_STAGES } });
  if (f.bands.length) and.push({ OR: bandWhere(f.bands) });
  if (f.added === "self") and.push({ createdById: { not: null } });
  if (f.added === "noself") and.push({ createdById: null });
  if (f.market) and.push({ market: f.market });
  if (f.q) {
    const c = { contains: f.q, mode: "insensitive" as const };
    and.push({ OR: [{ name: c }, { code: c }, { area: c }, { phone: c }, { website: c }] });
  }
  return { AND: and };
}

/** Matching leads with their idle days, filtered by the idle minimum (idle can't be filtered in the database). */
export async function distLeads(f: DistFilters, opts: { canPool: boolean; team: string[] | null }, limit = 3000) {
  const rows = await prisma.lead.findMany({
    where: await distWhere(f, opts),
    orderBy: [{ bestScore: "desc" }],
    take: limit,
    select: { id: true, code: true, name: true, area: true, market: true, stage: true, bestScore: true, ownerId: true, ownerName: true, assignedAt: true, assignedVia: true, createdAt: true, createdByName: true, lastReplyAt: true, source: true, rotationWarnedAt: true },
  });
  const worked = await lastWorked(rows.filter((r) => r.ownerId));
  const now = Date.now();
  return rows
    .map((r) => ({ ...r, band: bandOf(r.bestScore), idleDays: r.ownerId ? Math.floor((now - worked.get(r.id)!.getTime()) / DAY) : null }))
    .filter((r) => !f.idle || (r.idleDays != null && r.idleDays >= f.idle));
}

/** Per person: what they hold, how much of it is sitting idle, and what they've won lately. */
export async function holdingReport(idleDays: number, team: string[] | null) {
  const people = await rotationPeople();
  const users = team ? people.filter((p) => team.includes(p.id)) : people;
  const open = await prisma.lead.findMany({
    where: { ownerId: { in: users.map((p) => p.id) }, stage: { in: ROTATABLE_STAGES }, doNotContact: false },
    select: { id: true, ownerId: true, assignedAt: true, createdAt: true, lastReplyAt: true },
  });
  const worked = await lastWorked(open);
  const since90 = new Date(Date.now() - 90 * DAY);
  const won = await prisma.lead.groupBy({ by: ["ownerId"], where: { ownerId: { in: users.map((p) => p.id) }, stage: "WON", wonAt: { not: null, gte: since90 } }, _count: { _all: true } });
  const now = Date.now();
  return users.map((p) => {
    const mine = open.filter((l) => l.ownerId === p.id).map((l) => Math.floor((now - worked.get(l.id)!.getTime()) / DAY));
    return {
      id: p.id,
      name: p.name,
      open: mine.length,
      idle7: mine.filter((d) => d >= 7).length,
      idleLimit: mine.filter((d) => d >= idleDays).length,
      oldestIdle: mine.length ? Math.max(...mine) : 0,
      won90: won.find((w) => w.ownerId === p.id)?._count._all ?? 0,
    };
  });
}
