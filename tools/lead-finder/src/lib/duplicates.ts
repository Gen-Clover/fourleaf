// A lead added by hand is checked against every lead and client in the company, not just the person's own, so the
// same business can't be entered twice (and credited twice). Matches: phone, website domain, email, Google place,
// or the same name in the same area.
import { prisma } from "@genclover/db";
import { domainOf, nameKey, phoneKey } from "@genclover/incentives/identity";
import { identityMatches } from "@genclover/incentives";

export type Duplicate = { kind: "lead" | "client"; code: string; name: string; owner: string | null; on: string[] };

export async function findDuplicates(x: { name: string; phone?: string | null; website?: string | null; email?: string | null; area?: string | null; linkedinUrl?: string | null }) {
  const phone = phoneKey(x.phone);
  const domain = domainOf(x.website);
  const email = x.email?.trim().toLowerCase() || null;
  const name = nameKey(x.name);
  const or = [
    phone ? { phone: { contains: phone.slice(-7) } } : null,
    phone ? { intlPhone: { contains: phone.slice(-7) } } : null,
    domain ? { website: { contains: domain, mode: "insensitive" as const } } : null,
    email ? { emails: { has: email } } : null,
    email ? { email: { equals: email, mode: "insensitive" as const } } : null,
    x.linkedinUrl ? { linkedinUrl: { equals: x.linkedinUrl.trim(), mode: "insensitive" as const } } : null,
    x.name.trim().length >= 3 ? { name: { contains: x.name.trim().split(/\s+/).slice(0, 2).join(" "), mode: "insensitive" as const } } : null,
  ].filter((c): c is NonNullable<typeof c> => !!c);
  const candidates = or.length
    ? await prisma.lead.findMany({ where: { OR: or }, select: { code: true, name: true, phone: true, intlPhone: true, website: true, email: true, emails: true, area: true, linkedinUrl: true, ownerName: true }, take: 50 })
    : [];
  const out: Duplicate[] = [];
  for (const c of candidates) {
    const on: string[] = [];
    if (phone && (phoneKey(c.phone) === phone || phoneKey(c.intlPhone) === phone)) on.push("phone");
    if (domain && domainOf(c.website) === domain) on.push("website");
    if (email && (c.email?.toLowerCase() === email || c.emails.includes(email))) on.push("email");
    if (x.linkedinUrl && c.linkedinUrl && c.linkedinUrl.toLowerCase() === x.linkedinUrl.trim().toLowerCase()) on.push("LinkedIn");
    if (name && nameKey(c.name) === name && (!x.area || !c.area || c.area.toLowerCase().includes(x.area.trim().toLowerCase()) || x.area.toLowerCase().includes(c.area.toLowerCase()))) on.push("name");
    if (on.length) out.push({ kind: "lead", code: c.code, name: c.name, owner: c.ownerName, on });
  }
  for (const m of await identityMatches({ name: x.name, website: x.website, phone: x.phone })) out.push({ kind: "client", code: m.number, name: m.name, owner: null, on: m.on });
  return out;
}

/** Throws a readable error when the business is already in the company's leads or clients. */
export async function assertNotDuplicate(x: Parameters<typeof findDuplicates>[0]) {
  const d = await findDuplicates(x);
  if (!d.length) return;
  const first = d[0];
  const who = first.kind === "client" ? "a client" : first.owner ? `a lead owned by ${first.owner}` : "a lead in the pool";
  throw new Error(
    `Already in the company: ${first.code} ${first.name} is ${who} (same ${first.on.join(", ")})${d.length > 1 ? ` and ${d.length - 1} more match` : ""}. If it should be yours, ask your manager or the owner to move it to you.`,
  );
}
