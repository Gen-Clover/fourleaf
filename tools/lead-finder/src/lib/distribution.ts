// Handing out leads fairly, moving them, and rotating the ones nobody works.
//
//   Pool        Leads from searches and imports belong to nobody until they're handed out (Distribute page).
//   Rotation    Leads are grouped into score bands (hot to cold) and each band is split evenly between the people in
//               the rotation (active sales managers and sellers), dealt best-first so each person gets the same mix.
//               When a band doesn't divide evenly, the extra leads go to whoever has had the fewest extras in that
//               band (then the fewest open leads, then the longest wait), so whoever got one less this time gets one
//               more next time.
//   Moving      Owners move any lead to anyone in the sales team (won leads too). A manager the owner allows moves
//               their own team's leads between their team (never won leads). Everyone else can't move leads.
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
export async function checkMove(user: Viewer, leadIds: string[], toUserId: string | null) {
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
  const team = [user.id, ...members.filter((m) => m.managerUserId === user.id).map((m) => m.userId)];
  if (to.id === user.id) throw new Error("Managers move leads between their team, not to themselves: ask an owner");
  if (!team.includes(to.id)) throw new Error(`${to.name} isn't in your team`);
  const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { ownerId: true, stage: true } });
  if (leads.some((l) => l.stage === "WON")) throw new Error("Won leads are moved by an owner only");
  if (leads.some((l) => !l.ownerId || !team.includes(l.ownerId))) throw new Error("You can move your own team's leads only");
  return { to, via: "TEAM" as AssignVia };
}

export async function moveLeads(user: Viewer, leadIds: string[], toUserId: string | null, note?: string) {
  const { to, via } = await checkMove(user, leadIds, toUserId);
  const won = await prisma.lead.count({ where: { id: { in: leadIds }, stage: "WON" } });
  const n = await assignLeads(leadIds, to, { by: user, via: won && via === "MANUAL" ? "WON_FIX" : via, note });
  // Written directly (not via @genclover/db/audit, which is server-only): this file also runs in the worker.
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: "UPDATE", entity: "Lead", entityId: null, summary: `${n} lead(s) moved to ${to?.name ?? "the pool"}${won ? ` (${won} won)` : ""}${note ? `: ${note}` : ""}` } });
  return n;
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
