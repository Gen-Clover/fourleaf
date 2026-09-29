import Sidebar from "@/components/Sidebar";
import { requireUser } from "@genclover/auth";
import { financeNav } from "@genclover/finance/nav";

export const dynamic = "force-dynamic";

/** Every tool's menu, in sidebar order. Add a tool here to put it in the portal. */
const TOOLS = [financeNav];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="gc-grid min-h-screen">
      <Sidebar role={user.role} name={user.name} tools={TOOLS} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
