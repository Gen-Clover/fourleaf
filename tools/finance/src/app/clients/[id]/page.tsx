import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote, StatusBadge } from "@genclover/ui";
import { hasRole, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { MODELS, plannedMonthly } from "../../../lib/calc";
import { date, usd0 } from "@genclover/ui/format";
import ClientForm from "../ClientForm";
import { deleteClient } from "../actions";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const client = await prisma.client.findUnique({
    where: { id },
    include: { projects: { orderBy: { createdAt: "desc" }, include: { resources: true, months: { select: { revenue: true } } } } },
  });
  if (!client) notFound();
  const canEdit = hasRole(user.role, "EDITOR");

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/clients" className="hover:underline">← All clients</Link>·
            <span className="font-mono text-xs">{client.number}</span>·<span className="font-mono text-xs">{client.code}</span>
          </span>
        }
        actions={
          <>
            {canEdit && <Link href={`/projects/new?client=${client.id}`} className="btn-primary">+ New project</Link>}
            {user.role === "ADMIN" && client.projects.length === 0 && (
              <form action={deleteClient.bind(null, client.id)}>
                <button className="btn-danger">Delete client</button>
              </form>
            )}
          </>
        }
      />
      {!canEdit && <ReadOnlyNote />}
      <ClientForm client={client} readOnly={!canEdit} />

      <div className="card mt-6 overflow-x-auto">
        <div className="card-h"><div className="card-t">Projects</div></div>
        <table className="tbl">
          <thead><tr><th>ID</th><th>Project</th><th>Status</th><th>Model</th><th>Start</th><th className="num">Planned / month</th><th className="num">Billed to date</th></tr></thead>
          <tbody>
            {client.projects.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.code}</td>
                <td><Link href={`/projects/${p.id}`} className="font-medium text-brand-fg hover:underline">{p.name}</Link></td>
                <td><StatusBadge status={p.status} /></td>
                <td className="text-xs">{MODELS[p.engagementModel]}</td>
                <td>{date(p.startDate)}</td>
                <td className="num">{usd0(plannedMonthly(p, p.resources))}</td>
                <td className="num">{usd0(p.months.reduce((s, m) => s + m.revenue, 0))}</td>
              </tr>
            ))}
            {client.projects.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-neutral-500">No projects yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
