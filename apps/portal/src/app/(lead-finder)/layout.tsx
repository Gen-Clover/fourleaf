import ToolShell from "@/components/ToolShell";
import { requireUser } from "@genclover/auth";
import { leadFinderNav } from "@genclover/lead-finder/nav";
import { canGenerateLeads, distAccessFor } from "@genclover/lead-finder/lib/scope";

export const dynamic = "force-dynamic";

/**
 * Lead Finder pages, under /leads. Menu items this person can't use are hidden even when their role could: searches
 * and imports need the owner's "Can generate leads", Distribute needs a lead permission.
 */
export default async function LeadFinderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [gen, dist] = await Promise.all([canGenerateLeads(user), distAccessFor(user)]);
  const hide = [...(gen ? [] : ["/leads/find", "/leads/searches", "/leads/import"]), ...(dist.owner || dist.canPool || dist.canMove ? [] : ["/leads/distribute"])];
  return (
    <ToolShell tool={leadFinderNav} hide={hide}>
      {children}
    </ToolShell>
  );
}
