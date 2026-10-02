import ToolShell from "@/components/ToolShell";
import { clientsNav } from "@genclover/clients/nav";

export const dynamic = "force-dynamic";

/** Clients & Agreements: onboarding, client records, agreements. */
export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return <ToolShell tool={clientsNav}>{children}</ToolShell>;
}
