import ToolShell from "@/components/ToolShell";
import { financeNav } from "@genclover/finance/nav";

export const dynamic = "force-dynamic";

/** Financial System pages (and, for now, the portal admin pages). The dashboard is at /finance. */
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <ToolShell tool={financeNav}>{children}</ToolShell>;
}
