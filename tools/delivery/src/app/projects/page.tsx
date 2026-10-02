import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { MODELS } from "@genclover/finance/lib/calc";
import { KIND_LABEL, PROJECT_KINDS, PROJECT_STATUSES, STATUS_LABEL, date } from "@genclover/ui/format";

/** Every project, for delivery: status, type, team, milestones. Money is on Finance → Projects. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const projects = await prisma.project.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.kind && (PROJECT_KINDS as readonly string[]).includes(sp.kind) ? { kind: sp.kind } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, code: true, name: true, status: true, kind: true, engagementModel: true, startDate: true, endDate: true, deliveryManager: true,
      client: { select: { name: true } },
      _count: { select: { assignments: true, issues: { where: { status: { not: "CLOSED" } } } } },
      milestones: { select: { status: true, dueDate: true } },
    },
  });
  const counts = await prisma.project.groupBy({ by: ["status"], _count: true });
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const link = (patch: Record<string, string>) => `/projects?${new URLSearchParams({ ...(sp.kind ? { kind: sp.kind } : {}), ...(sp.status ? { status: sp.status } : {}), ...patch })}`;
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Client projects, care plans, Gen Clover products and internal work. Each has an ID like ABR-P01."
        actions={can(user.role, "projects.create") && <Link href="/projects/new" className="btn-primary">+ New project</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/projects" className={!sp.status && !sp.kind ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</Link>
        {PROJECT_STATUSES.filter((s) => countOf(s) > 0).map((s) => (
          <Link key={s} href={link({ status: s })} className={sp.status === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{STATUS_LABEL[s]} ({countOf(s)})</Link>
        ))}
        <select className="input-sm w-auto" form="pf" name="kind" defaultValue={sp.kind ?? ""} aria-label="Type">
          <option value="">Any type</option>
          {PROJECT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <form id="pf" className="ml-auto flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input className="input-sm w-56" name="q" placeholder="Search name, ID, client…" defaultValue={q} />
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
      </div>
      <div className="card overflow-x-auto">
        {projects.length === 0 ? (
          <Empty href={can(user.role, "projects.create") ? "/projects/new" : undefined} cta="Set up a project">No projects found.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>ID</th><th>Project</th><th>Client</th><th>Status</th><th className="hidden md:table-cell">Type</th><th className="hidden lg:table-cell">Model</th><th className="num">Team</th><th className="hidden md:table-cell">Milestones</th><th className="num hidden sm:table-cell">Issues</th><th className="hidden lg:table-cell">Manager</th><th className="hidden md:table-cell">Start</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const done = p.milestones.filter((m) => m.status === "DONE").length;
                const late = p.milestones.filter((m) => m.status !== "DONE" && m.dueDate && m.dueDate < now).length;
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-xs whitespace-nowrap">{p.code}</td>
                    <td><Link href={`/projects/${p.id}`} className="font-medium text-brand-fg hover:underline">{p.name}</Link></td>
                    <td className="whitespace-nowrap">{p.client.name}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="hidden text-xs md:table-cell">{KIND_LABEL[p.kind] ?? p.kind}</td>
                    <td className="hidden text-xs lg:table-cell">{MODELS[p.engagementModel] ?? p.engagementModel}</td>
                    <td className="num">{p._count.assignments}</td>
                    <td className="hidden md:table-cell">{done}/{p.milestones.length}{late > 0 && <span className="ml-1 text-xs text-red-600">{late} late</span>}</td>
                    <td className={`num hidden sm:table-cell ${p._count.issues ? "text-red-600" : ""}`}>{p._count.issues}</td>
                    <td className="hidden lg:table-cell">{p.deliveryManager ?? "—"}</td>
                    <td className="hidden whitespace-nowrap md:table-cell">{date(p.startDate)}</td>
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
