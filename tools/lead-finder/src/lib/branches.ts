// Branch detection: leads that share a website or a phone number are one business with several
// locations. The branch with most Google reviews leads (branchOfId = null); the others point to it,
// so the business is contacted once. Names alone aren't used: "City Dental Clinic" in two towns
// is usually two different businesses.
import { prisma } from "@genclover/db";
import { isSocialOnly } from "./audit";
import { rescore } from "./leads";

function siteKey(website: string | null) {
  if (!website || isSocialOnly(website)) return null;
  try {
    return `site:${new URL(website).hostname.replace(/^www\./, "").toLowerCase()}`;
  } catch {
    return null;
  }
}
const phoneKey = (phone: string | null) => {
  const d = phone?.replace(/\D/g, "") ?? "";
  return d.length >= 10 ? `tel:${d.slice(-10)}` : null;
};

/** Group all leads into businesses and update branch fields where they changed. Returns leads updated. */
export async function computeBranches() {
  const leads = await prisma.lead.findMany({
    select: { id: true, website: true, intlPhone: true, phone: true, reviewCount: true, brandKey: true, branchCount: true, branchOfId: true },
  });
  // Union-find over shared website hosts and phone numbers.
  const parent = new Map(leads.map((l) => [l.id, l.id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const byKey = new Map<string, string>();
  const keyOf = new Map<string, string>();
  for (const l of leads) {
    for (const key of [siteKey(l.website), phoneKey(l.intlPhone ?? l.phone)]) {
      if (!key) continue;
      keyOf.set(l.id, keyOf.get(l.id) ?? key);
      const other = byKey.get(key);
      if (other) parent.set(find(l.id), find(other));
      else byKey.set(key, l.id);
    }
  }
  const groups = new Map<string, typeof leads>();
  for (const l of leads) {
    const root = find(l.id);
    groups.set(root, [...(groups.get(root) ?? []), l]);
  }

  let updated = 0;
  for (const members of groups.values()) {
    const lead = [...members].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0];
    const brandKey = members.length > 1 ? (keyOf.get(lead.id) ?? null) : null;
    for (const m of members) {
      const next = { brandKey, branchCount: members.length, branchOfId: m.id === lead.id || members.length === 1 ? null : lead.id };
      if (m.brandKey === next.brandKey && m.branchCount === next.branchCount && m.branchOfId === next.branchOfId) continue;
      await prisma.lead.update({ where: { id: m.id }, data: next });
      await rescore(m.id);
      updated++;
    }
  }
  return updated;
}
