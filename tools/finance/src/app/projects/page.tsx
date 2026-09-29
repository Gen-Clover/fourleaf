import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { hasRole, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { MODELS, plannedMonthly, quoteSummary } from "../../lib/calc";
import { PROJECT_STATUSES, STATUS_LABEL, date, pct, usd0 } from "@genclover/ui/format";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const projects = await prisma.project.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { code: { contains: sp.q, mode: "insensitive" } }, { client: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { client: true, resources: true, months: { select: { revenue: true } } },
  });
  const counts = await prisma.project.groupBy({ by: ["status"], _count: true });
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Every project gets an ID, client, resource plan, quote, agreed deal and monthly billing."
        actions={hasRole(user.role, "EDITOR") && <Link href="/projects/new" className="btn-primary">+ New project</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/projects" className={!sp.status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</Link>
        {PROJECT_STATUSES.map((s) => (
          <Link key={s} href={`/projects?status=${s}`} className={sp.status === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
            {STATUS_LABEL[s]} ({countOf(s)})
          </Link>
        ))}
        <form className="ml-auto">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input className="input-sm w-56" name="q" placeholder="Search name, ID, client…" defaultValue={sp.q} />
        </form>
      </div>
      <div className="card overflow-x-auto">
        {projects.length === 0 ? (
          <Empty href={hasRole(user.role, "EDITOR") ? "/projects/new" : undefined} cta="Create a project">No projects found.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Project ID</th><th>Project</th><th>Client</th><th>Status</th><th>Model</th>
                <th className="num">Hrs / mo</th><th className="num">Standard / mo</th><th className="num">Agreed / mo</th><th className="num">Discount</th><th className="num">Billed</th><th>Start</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const q = quoteSummary(p.resources);
                const planned = plannedMonthly(p, p.resources);
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-xs whitespace-nowrap">{p.code}</td>
                    <td><Link href={`/projects/${p.id}`} className="font-medium text-brand-fg hover:underline">{p.name}</Link></td>
                    <td className="whitespace-nowrap">{p.client.name}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-xs whitespace-nowrap">{MODELS[p.engagementModel]}</td>
                    <td className="num">{q.hours}</td>
                    <td className="num">{usd0(q.standard)}</td>
                    <td className="num font-semibold">{usd0(planned)}</td>
                    <td className="num">{q.standard ? pct(1 - planned / q.standard, 1) : "—"}</td>
                    <td className="num">{usd0(p.months.reduce((s, m) => s + m.revenue, 0))}</td>
                    <td className="whitespace-nowrap">{date(p.startDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
