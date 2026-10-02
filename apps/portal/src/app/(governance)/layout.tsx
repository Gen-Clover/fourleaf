import ToolShell from "@/components/ToolShell";
import { governanceNav } from "@genclover/governance/nav";

export const dynamic = "force-dynamic";

/** Governance & Compliance: compliance calendar, issues, decisions. */
export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return <ToolShell tool={governanceNav}>{children}</ToolShell>;
}
