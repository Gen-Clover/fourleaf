import { can } from "@genclover/auth/access";

/** Leave deal fields out of lead queries; pages that show a deal read it separately, after canSeeDeal. */
export const NO_DEAL = { dealValue: true, dealCurrency: true, expectedCloseAt: true } as const;

/**
 * Who sees a lead's deal value: owners and the CFO see every one; Sales sees the deals on leads they own
 * (and unassigned leads, which become theirs when they set a value). Totals across leads (pipeline value,
 * forecast, won value) stay with owners and the CFO: see "deals.all".
 */
export function canSeeDeal(user: { id: string; role: string }, lead: { ownerId: string | null }) {
  return can(user.role, "deals.all") || (can(user.role, "deals.own") && (lead.ownerId === user.id || lead.ownerId == null));
}

/**
 * Opportunity values this person may see, by opportunity id: all for owners / CFO; for Sales only the deals they
 * own (or unassigned ones). Pages load opportunities without values and merge these in, so no other value is read.
 */
export async function visibleDealValues(user: { id: string; role: string }, ids: string[]) {
  if (!can(user.role, "deals.all") && !can(user.role, "deals.own")) return new Map<string, number | null>();
  const { prisma } = await import("@genclover/db");
  const rows = await prisma.opportunity.findMany({
    where: { id: { in: ids }, ...(can(user.role, "deals.all") ? {} : { OR: [{ ownerId: user.id }, { ownerId: null }] }) },
    select: { id: true, value: true },
  });
  return new Map(rows.map((r) => [r.id, r.value]));
}
