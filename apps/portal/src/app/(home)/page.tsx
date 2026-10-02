import Link from "next/link";
import { requireUser, roleLabel } from "@genclover/auth";
import HomeDashboard from "@/components/HomeDashboard";
import TopNav from "@/components/TopNav";
import { PORTAL_NAV, toolsFor } from "@/lib/tools";
import SearchButton from "./SearchButton";

export const dynamic = "force-dynamic";

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/**
 * Portal home, built to fit one screen: the tools first (a launcher), then the overview of every area the role
 * can see, and what needs attention. Tools are in the order of the work; add one in lib/tools.ts.
 */
export default async function PortalHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const tools = toolsFor(user.role);
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="gc-grid min-h-screen">
      <TopNav role={user.role} name={user.name} tool={PORTAL_NAV} />
      <main className="mx-auto max-w-[1536px] px-4 py-5 sm:px-6 lg:px-8">
        {denied && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">That page isn&apos;t part of the {roleLabel(user.role)} role. Ask an owner if you need it.</div>}

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{greeting()}, {user.name.split(" ")[0]}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">{today} · {roleLabel(user.role)}</p>
          </div>
          <SearchButton />
        </div>

        <section className="mb-5" aria-label="Tools">
          {tools.length === 0 ? (
            <p className="card p-5 text-sm text-neutral-600">Your role has no tools yet. Ask an owner to change it.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {tools.map((t) => (
                <Link key={t.home} href={t.href} className="card group flex items-start gap-3 p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-lg text-brand-fg transition-colors group-hover:bg-brand group-hover:text-white">{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{t.name}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-neutral-500">{t.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <HomeDashboard user={user} />
      </main>
    </div>
  );
}
