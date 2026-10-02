import "server-only";
import { prisma } from "@genclover/db";

// Maker-checker: some things need a second person before they happen.
//   PAY_RUN          a month's pay (always)
//   EXPENSE          paying an expense at or above the approval limit (Settings → Pay & approvals)
//   PRICE_EXCEPTION  agreeing a project priced below the rate-card floor
// The person who asked can't approve it. An owner may approve their own request, with a note (small teams).

export const APPROVAL_TYPES: Record<string, string> = {
  PAY_RUN: "Pay run",
  EXPENSE: "Expense payment",
  PRICE_EXCEPTION: "Price below floor",
};

type Who = { id: string; name: string };

/** The latest approval for this thing, or a new pending one. Returns it either way. */
export async function requestApproval(type: string, entityId: string, o: { summary: string; amountInr?: number | null; link?: string; by: Who }) {
  const existing = await prisma.approval.findFirst({ where: { type, entityId }, orderBy: { createdAt: "desc" } });
  if (existing && existing.status !== "REJECTED") return existing;
  return prisma.approval.create({
    data: { type, entityId, summary: o.summary, amountInr: o.amountInr ?? null, link: o.link ?? null, requestedById: o.by.id, requestedByName: o.by.name },
  });
}

export async function isApproved(type: string, entityId: string) {
  return !!(await prisma.approval.findFirst({ where: { type, entityId, status: "APPROVED" } }));
}

/** Check who may decide: never the requester, unless an owner who writes why. */
export function checkDecider(approval: { requestedById: string | null }, user: { id: string; role: string }, note: string | null | undefined, isOwner: boolean) {
  if (approval.requestedById && approval.requestedById === user.id) {
    if (!isOwner) throw new Error("Someone other than the requester approves this");
    if (!note?.trim()) throw new Error("Approving your own request: add a note saying why (no second person available)");
  }
}
