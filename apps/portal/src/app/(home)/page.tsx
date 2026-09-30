import Link from "next/link";
import { requireUser } from "@genclover/auth";
import { CloverMark, Wordmark } from "@genclover/ui/brand";
import { ThemeToggle } from "@genclover/ui/theme-toggle";
import type { ToolNav } from "@genclover/ui/nav";
import { financeNav } from "@genclover/finance/nav";
import { leadFinderNav } from "@genclover/lead-finder/nav";

export const dynamic = "force-dynamic";

/** One tile per tool. Add a tool here to put it on the portal home. */
const TOOLS: { nav: ToolNav; icon: string; description: string; status?: string }[] = [
  { nav: financeNav, icon: "₹", description: "Rate card, projects and clients, monthly billing, invoices, funds and the CFO dashboard." },
  { nav: leadFinderNav, icon: "◎", description: "Find businesses by niche and area, check their websites, and follow up the best leads until they become clients." },
];

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;

  return (
    <div className="gc-grid min-h-screen">
      <header className="border-b border-neutral-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <CloverMark className="h-8 w-8" />
            <div>
              <Wordmark className="text-sm" />
              <div className="mt-1 font-display text-[10px] font-semibold tracking-eyebrow text-brand-fg uppercase">Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user.role === "ADMIN" && (
              <nav className="hidden items-center gap-3 sm:flex">
                <Link href="/admin/users" className="text-neutral-600 hover:text-brand-fg">Users &amp; Roles</Link>
                <Link href="/admin/audit" className="text-neutral-600 hover:text-brand-fg">Audit Log</Link>
              </nav>
            )}
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="font-medium text-neutral-900">{user.name}</div>
              <div className="font-display text-[10px] font-semibold tracking-eyebrow text-neutral-500 uppercase">{user.role}</div>
            </div>
            <form action="/logout" method="post">
              <button className="btn-secondary btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {denied && <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">That page needs a higher role than {user.role}.</div>}
        <div className="eyebrow mb-2">Gen Clover tools</div>
        <h1 className="mb-8 text-2xl font-semibold text-ink">Welcome, {user.name.split(" ")[0]}</h1>
        <div className="grid gap-5 md:grid-cols-2">
          {TOOLS.map(({ nav, icon, description, status }) => (
            <Link key={nav.home} href={nav.home} className="card group flex flex-col gap-4 p-6 transition-colors hover:border-brand">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-xl text-brand-fg">{icon}</span>
                {status && <span className="badge bg-neutral-100 text-neutral-600">{status}</span>}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">{nav.tool}</h2>
                <p className="mt-1 text-sm text-neutral-600">{description}</p>
              </div>
              <span className="mt-auto text-sm font-medium text-brand-fg">Open <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span></span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
