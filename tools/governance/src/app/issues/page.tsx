import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { ISSUE_CATEGORIES } from "../../lib/governance";

/** Issues and escalations. People issues are visible to owners and HR only. */
export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ view?: string; category?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const open = sp.view !== "closed";
  const seePeople = can(user.role, "admin") || can(user.role, "people.edit");
  const issues = await prisma.issue.findMany({
    where: {
      status: open ? { not: "CLOSED" } : "CLOSED",
      ...(sp.category && ISSUE_CATEGORIES[sp.category] ? { category: sp.category } : {}),
      ...(seePeople ? {} : { category: { not: "PEOPLE" } }),
    },
    orderBy: open ? [{ level: "desc" }, { createdAt: "asc" }] : { closedAt: "desc" },
    take: 300,
    include: { project: { select: { id: true, code: true } } },
  });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Issues & escalations"
        subtitle="Level 1 operational → 2 functional → 3 CEO → 4 board / adviser. Each issue records its impact, options, decision and lessons."
        actions={can(user.role, "issues.edit") && <Link href="/issues/new" className="btn-primary">+ Raise an issue</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/issues" className={open ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Open</Link>
        <Link href="/issues?view=closed" className={!open ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Closed</Link>
        {Object.entries(ISSUE_CATEGORIES).filter(([k]) => seePeople || k !== "PEOPLE").map(([k, v]) => (
          <Link key={k} href={`/issues?${open ? "" : "view=closed&"}category=${k}`} className={sp.category === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{v.label}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        {issues.length === 0 ? (
          <Empty>{open ? "No open issues." : "No closed issues yet."}</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>ID</th><th>Issue</th><th>Type</th><th>Priority</th><th>Level</th><th className="hidden md:table-cell">Owner</th><th className="hidden md:table-cell">By</th><th>Status</th></tr></thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id}>
                  <td className="font-mono text-xs whitespace-nowrap"><Link className="text-brand-fg hover:underline" href={`/issues/${i.id}`}>{i.code}</Link></td>
                  <td>{i.title}{i.project && <div className="font-mono text-xs text-neutral-500">{i.project.code}</div>}</td>
                  <td className="text-xs">{ISSUE_CATEGORIES[i.category]?.label}</td>
                  <td><StatusBadge status={i.priority} /></td>
                  <td>L{i.level}</td>
                  <td className="hidden md:table-cell">{i.ownerName ?? "—"}</td>
                  <td className={`hidden md:table-cell ${i.dueDate && i.dueDate < now && open ? "font-medium text-red-700" : ""}`}>{date(i.dueDate)}</td>
                  <td><StatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
