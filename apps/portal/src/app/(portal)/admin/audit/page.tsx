import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { prisma } from "@genclover/db";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; entity?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.entity ? { entity: sp.entity } : {};
  const [logs, total, entities] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const q = (p: number) => `/admin/audit?page=${p}${sp.entity ? `&entity=${sp.entity}` : ""}`;

  return (
    <>
      <PageHeader title="Audit Log" subtitle={`${total} events · every change to rates, formula, users, projects and billing is recorded`} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href="/admin/audit" className={!sp.entity ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</Link>
        {entities.map((e) => (
          <Link key={e.entity} href={`/admin/audit?entity=${e.entity}`} className={sp.entity === e.entity ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
            {e.entity}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="text-xs whitespace-nowrap text-neutral-500">{l.createdAt.toLocaleString()}</td>
                <td className="whitespace-nowrap">{l.userName}</td>
                <td><span className="badge bg-neutral-100 text-neutral-700">{l.action}</span></td>
                <td className="whitespace-nowrap">{l.entity}</td>
                <td className="text-xs text-neutral-700">{l.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm">
        {page > 1 && <Link className="btn-secondary btn-sm" href={q(page - 1)}>← Prev</Link>}
        <span>Page {page} / {pages}</span>
        {page < pages && <Link className="btn-secondary btn-sm" href={q(page + 1)}>Next →</Link>}
      </div>
    </>
  );
}
