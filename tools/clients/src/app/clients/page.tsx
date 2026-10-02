import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { usd0 } from "@genclover/ui/format";

const TABS: [string, string][] = [["", "All"], ["ONBOARDING", "Onboarding"], ["ACTIVE", "Active"], ["INACTIVE", "Inactive"]];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const showMoney = can(user.role, "finance.view");
  const status = TABS.some(([k]) => k === sp.status) ? sp.status ?? "" : "";
  const q = sp.q?.trim();
  const clients = await prisma.client.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      projects: { select: { status: true, months: { select: { revenue: true }, take: showMoney ? undefined : 0 } } },
      _count: { select: { agreements: true } },
    },
  });
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Every client has a Client ID (GC-2026-0001) and a code (ABR) used in project IDs, Jira and folders."
        actions={
          can(user.role, "clients.edit") && (
            <>
              <Link href="/clients/onboarding" className="btn-secondary">Onboarding queue</Link>
              <Link href="/clients/new" className="btn-primary">+ New client</Link>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k || "all"} href={k ? `/clients?status=${k}` : "/clients"} className={status === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{label}</Link>
        ))}
        <form className="ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input className="input-sm w-56" name="q" placeholder="Search name, ID, code…" defaultValue={q} />
        </form>
      </div>
      <div className="card overflow-x-auto">
        {clients.length === 0 ? (
          <Empty href={can(user.role, "clients.edit") ? "/clients/onboarding" : undefined} cta="Onboard a won deal">No clients here yet.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Client ID</th><th>Code</th><th>Client</th><th>Status</th><th className="hidden md:table-cell">Contact</th><th className="hidden lg:table-cell">Location</th>
                <th className="num">Projects</th><th className="num hidden sm:table-cell">Agreements</th>{showMoney && <th className="num hidden md:table-cell">Billed to date</th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.number}</td>
                  <td className="font-mono text-xs">{c.code}</td>
                  <td><Link href={`/clients/${c.id}`} className="font-medium text-brand-fg hover:underline">{c.name}</Link><div className="text-xs text-neutral-500">{c.currency}{c.gstin && ` · GST ${c.gstin}`}</div></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="hidden md:table-cell">{c.contactName ?? "—"}<div className="text-xs text-neutral-500">{c.email}</div></td>
                  <td className="hidden lg:table-cell">{[c.city, c.state, c.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="num">{c.projects.length}</td>
                  <td className="num hidden sm:table-cell">{c._count.agreements}</td>
                  {showMoney && <td className="num hidden md:table-cell">{usd0(c.projects.flatMap((p) => p.months).reduce((s, m) => s + m.revenue, 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
