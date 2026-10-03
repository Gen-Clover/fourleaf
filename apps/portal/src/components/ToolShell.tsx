import TopNav from "@/components/TopNav";
import { requireUser } from "@genclover/auth";
import type { ToolNav } from "@genclover/ui/nav";

/** The frame around every tool's pages: that tool's top navigation and a full-width content area. */
export default async function ToolShell({ tool, children, hide }: { tool: ToolNav; children: React.ReactNode; hide?: string[] }) {
  const user = await requireUser();
  return (
    <div className="gc-grid min-h-screen">
      <TopNav role={user.role} name={user.name} tool={tool} hide={hide} />
      <main className="mx-auto max-w-[1536px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
