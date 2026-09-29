import Link from "next/link";
import { Empty, PageHeader } from "@genclover/ui";
import { hasRole, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { usd0 } from "@genclover/ui/format";

export default async function ClientsPage() {
  const user = await requireUser();
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { projects: { select: { status: true, months: { select: { revenue: true } } } } },
  });
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} clients`}
        actions={hasRole(user.role, "EDITOR") && <Link href="/clients/new" className="btn-primary">+ New client</Link>}
      />
      <div className="card overflow-x-auto">
        {clients.length === 0 ? (
          <Empty href={hasRole(user.role, "EDITOR") ? "/clients/new" : undefined} cta="Add your first client">No clients yet.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Client</th><th>Contact</th><th>Email</th><th>Location</th><th className="num">Projects</th><th className="num">Active</th><th className="num">Billed to date</th></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/clients/${c.id}`} className="font-medium text-brand-fg hover:underline">{c.name}</Link></td>
                  <td>{c.contactName ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>{[c.city, c.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="num">{c.projects.length}</td>
                  <td className="num">{c.projects.filter((p) => p.status === "ACTIVE").length}</td>
                  <td className="num">{usd0(c.projects.flatMap((p) => p.months).reduce((s, m) => s + m.revenue, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
