// Who sees which leads. Owners and the CFO see every lead; so does a sales manager the owner allows to generate or
// move leads (they need the whole list to do that); any other sales manager sees their own and their team's; a
// seller sees only their own. Leads nobody owns (the pool) are seen by owners and by managers allowed to hand them
// out, on the Distribute page. Onboarding (won deals only) sees won leads. Every lead query in the Lead Finder is
// narrowed by leadScope, and every action on a lead checks assertLeadAccess.
import { can } from "@genclover/auth/access";
import { type Prisma, prisma } from "@genclover/db";

type Viewer = { id: string; role: string };

/** Owners and the CFO: no narrowing. */
export const seesAllLeads = (u: Viewer) => can(u.role, "leads.all") || can(u.role, "leads.manage");

/**
 * Every lead, the pool included: owners and the CFO, and sales managers allowed to generate or move leads. (For now a
 * manager with either permission sees other managers' teams too; narrow this when there are several sales teams.)
 */
export async function seesAll(u: Viewer) {
  if (seesAllLeads(u)) return true;
  if (!can(u.role, "leads.team")) return false;
  const m = await salesMember(u.id);
  return !!m && (m.canGenerateLeads || m.canReassignTeam);
}

/** This person's sales team set-up (lead permissions), or defaults when they have none. */
export async function salesMember(userId: string) {
  return prisma.salesMember.findUnique({ where: { userId } });
}

/** The owners whose leads this person sees: themselves, plus their team for sales managers. */
export async function visibleOwners(u: Viewer) {
  if (!can(u.role, "leads.team")) return [u.id];
  const team = await prisma.salesMember.findMany({ where: { managerUserId: u.id }, select: { userId: true } });
  return [u.id, ...team.map((t) => t.userId)];
}

/** The where clause that limits a lead query to what this person may see. */
export async function leadScope(u: Viewer): Promise<Prisma.LeadWhereInput> {
  if (await seesAll(u)) return {};
  if (!can(u.role, "leads.view")) return can(u.role, "leads.won") ? { stage: "WON" } : { id: "none" };
  return { ownerId: { in: await visibleOwners(u) } };
}

/** The same rule for things that belong to a lead (tasks, activity, opportunities). */
export async function leadRelationScope(u: Viewer): Promise<{ lead?: Prisma.LeadWhereInput }> {
  const s = await leadScope(u);
  return Object.keys(s).length ? { lead: s } : {};
}

/** Deals this person sees: the ones they (or their team) own, or on leads they see. */
export async function opportunityScope(u: Viewer): Promise<Prisma.OpportunityWhereInput> {
  if (!can(u.role, "leads.view") || (await seesAll(u))) return {};
  const owners = await visibleOwners(u);
  return { OR: [{ ownerId: { in: owners } }, { lead: { ownerId: { in: owners } } }] };
}

export async function canSeeLead(u: Viewer, lead: { ownerId: string | null; stage: string }) {
  if (await seesAll(u)) return true;
  if (!can(u.role, "leads.view")) return can(u.role, "leads.won") && lead.stage === "WON";
  return !!lead.ownerId && (await visibleOwners(u)).includes(lead.ownerId);
}

/** Throws unless this person may see (and so work) every one of these leads. */
export async function assertLeadAccess(u: Viewer, leadIds: string | string[]) {
  const ids = [...new Set(Array.isArray(leadIds) ? leadIds : [leadIds])];
  if (!ids.length || (await seesAll(u))) return;
  const owners = await visibleOwners(u);
  const blocked = await prisma.lead.count({ where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId: { notIn: owners } }] } });
  if (blocked) throw new Error(ids.length === 1 ? "This lead belongs to someone else" : `${blocked} of these leads belong to someone else`);
}

/**
 * Who this person may move leads to: owners, anyone active on the sales team; a manager the owner allows to move
 * leads, anyone active on the sales team except themselves; everyone else, nobody (the move control is hidden).
 */
export async function moveTargets(u: Viewer): Promise<{ id: string; name: string }[]> {
  const all = await prisma.salesMember.findMany({ where: { active: true }, select: { userId: true, userName: true, managerUserId: true } });
  // Only active people whose role can work leads.
  const workers = new Set((await prisma.user.findMany({ where: { id: { in: all.map((m) => m.userId) }, active: true }, select: { id: true, role: true } })).filter((x) => can(x.role, "leads.edit")).map((x) => x.id));
  const members = all.filter((m) => workers.has(m.userId));
  if (can(u.role, "leads.manage")) return members.map((m) => ({ id: m.userId, name: m.userName })).sort((a, b) => a.name.localeCompare(b.name));
  const me = await salesMember(u.id);
  if (!can(u.role, "leads.team") || !me?.canReassignTeam) return [];
  // Not to themselves: a manager doesn't hand leads to their own account.
  return members.filter((m) => m.userId !== u.id).map((m) => ({ id: m.userId, name: m.userName })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The "Assigned to" filter: everyone who can hold leads (sales, sales managers, owners), by name, for those who see
 * every lead; a manager's own team otherwise; nothing for a seller (they only see their own).
 */
export async function ownerOptions(u: Viewer): Promise<{ id: string; name: string }[]> {
  if (await seesAll(u)) {
    const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, role: true, active: true } });
    // People who can hold leads, plus anyone who still holds some (a disabled login's leads must be findable).
    const holders = new Set((await prisma.lead.groupBy({ by: ["ownerId"], where: { ownerId: { not: null } } })).map((g) => g.ownerId));
    return users.filter((x) => (x.active && can(x.role, "leads.edit")) || holders.has(x.id)).map((x) => ({ id: x.id, name: x.active ? x.name : `${x.name} (disabled)` }));
  }
  const ids = await visibleOwners(u);
  if (ids.length < 2) return [];
  return prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** Searches and imports (they spend money and fill the pool): owners, and managers the owner allows. */
export async function canGenerateLeads(u: Viewer) {
  if (can(u.role, "leads.manage")) return true;
  return can(u.role, "leads.team") && !!(await salesMember(u.id))?.canGenerateLeads;
}

export async function assertCanGenerate(u: Viewer) {
  if (!(await canGenerateLeads(u))) throw new Error("Searches and imports need the owner's permission (Lead Finder → Sales team)");
}

/** What this person may do on the Distribute page. */
export async function distAccessFor(u: Viewer) {
  const owner = can(u.role, "leads.manage");
  const me = owner ? null : await salesMember(u.id);
  return {
    owner,
    canPool: owner || (await canGenerateLeads(u)),
    canMove: owner || (can(u.role, "leads.team") && !!me?.canReassignTeam),
    team: (await seesAll(u)) ? null : await visibleOwners(u),
  };
}
