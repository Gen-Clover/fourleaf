import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { MARKETS, MARKET_KEYS } from "../../lib/markets";
import { SERVICES } from "../../lib/services";
import { googleKeyConfigured } from "../../lib/settings";
import NewSearchForm from "./NewSearchForm";
import GenerateGate from "../../lib/GenerateGate";
import { canGenerateLeads } from "../../lib/scope";

export default async function NewSearchPage() {
  const user = await requirePermission("leads.edit");
  if (!(await canGenerateLeads(user))) return <GenerateGate title="New search" />;
  const niches = await prisma.leadNiche.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { key: true, label: true, phrases: true, market: true } });
  return (
    <>
      <PageHeader title="New search" subtitle="Find businesses on Google Maps by niche and area. Each new business becomes a lead with its own GL- ID, and its website is checked automatically." />
      <NewSearchForm
        niches={niches}
        markets={MARKET_KEYS.map((k) => ({ key: k, label: MARKETS[k].label }))}
        services={SERVICES.map((s) => ({ key: s.key, label: s.label, about: s.about, offers: Object.fromEntries(MARKET_KEYS.map((m) => [m, MARKETS[m].offers[s.key]])) }))}
        keyConfigured={googleKeyConfigured()}
      />
    </>
  );
}
