import ToolShell from "@/components/ToolShell";
import { leadFinderNav } from "@genclover/lead-finder/nav";

export const dynamic = "force-dynamic";

/** Lead Finder pages, under /leads. */
export default function LeadFinderLayout({ children }: { children: React.ReactNode }) {
  return <ToolShell tool={leadFinderNav}>{children}</ToolShell>;
}
