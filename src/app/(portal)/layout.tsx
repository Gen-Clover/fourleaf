import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { getParams } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { companyName } = await getParams();
  return (
    <div className="min-h-screen">
      <Sidebar role={user.role} name={user.name} company={companyName} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
