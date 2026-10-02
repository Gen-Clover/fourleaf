import Link from "next/link";
import { PageHeader, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { complianceStatus } from "../../lib/governance";

/** Governance at a glance: filings due, issues by level, agreements to renew, recent decisions. */
export default async function GovernanceHome() {
  const user = await requireUser();
  const soon = new Date(Date.now() + 60 * 86_400_000);
  const [items, issues, renewals, decisions] = await Promise.all([
    prisma.complianceItem.findMany({ where: { active: true }, orderBy: { dueDate: "asc" } }),
    can(user.role, "issues.view") ? prisma.issue.findMany({ where: { status: { not: "CLOSED" } }, select: { level: true, priority: true } }) : [],
    prisma.agreement.findMany({ where: { status: { in: ["SIGNED", "ACTIVE"] }, expiresAt: { not: null, lte: soon } }, orderBy: { expiresAt: "asc" }, take: 10, select: { id: true, code: true, title: true, expiresAt: true, client: { select: { name: true } } } }),
    prisma.decision.findMany({ orderBy: { date: "desc" }, take: 5 }),
  ]);
  const withState = items.map((i) => ({ ...i, state: complianceStatus(i) }));
  const overdue = withState.filter((i) => i.state === "OVERDUE");
  const due = withState.filter((i) => i.state === "DUE");
  return (
    <>
      <PageHeader title="Governance & Compliance" subtitle="Statutory filings, renewals, issues and decisions — so nothing depends on memory." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/compliance"><Stat label="Overdue filings" value={<span className={overdue.length ? "text-red-600" : ""}>{overdue.length}</span>} hint="past their due date" accent={overdue.length > 0} /></Link>
        <Link href="/compliance"><Stat label="Due soon" value={due.length} hint="within their reminder window" /></Link>
        <Link href="/issues"><Stat label="Open issues" value={issues.length} hint={`${issues.filter((i) => i.level >= 3).length} at CEO / board level`} /></Link>
        <Link href="/agreements?view=renewals"><Stat label="Agreements to renew" value={renewals.length} hint="next 60 days" /></Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0">
          <div className="card-h"><div className="card-t">Filings due</div><Link className="text-xs text-brand-fg" href="/compliance">All →</Link></div>
          <ul className="divide-y divide-neutral-100 text-sm">
            {[...overdue, ...due].slice(0, 10).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 px-5 py-2.5"><span className="min-w-0 truncate">{i.name}</span><span className="flex items-center gap-2 text-xs">{date(i.dueDate)} <StatusBadge status={i.state} /></span></li>
            ))}
            {overdue.length + due.length === 0 && <li className="px-5 py-4 text-neutral-500">Nothing due right now.</li>}
          </ul>
        </section>
        <section className="card min-w-0">
          <div className="card-h"><div className="card-t">Renewals</div></div>
          <ul className="divide-y divide-neutral-100 text-sm">
            {renewals.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                <span className="min-w-0 truncate"><Link className="font-mono text-xs text-brand-fg hover:underline" href={`/agreements/${a.id}`}>{a.code}</Link> {a.client.name}</span>
                <span className="text-xs text-neutral-500">{date(a.expiresAt)}</span>
              </li>
            ))}
            {renewals.length === 0 && <li className="px-5 py-4 text-neutral-500">Nothing to renew in 60 days.</li>}
          </ul>
        </section>
        <section className="card min-w-0">
          <div className="card-h"><div className="card-t">Recent decisions</div><Link className="text-xs text-brand-fg" href="/decisions">All →</Link></div>
          <ul className="divide-y divide-neutral-100 text-sm">
            {decisions.map((d) => (
              <li key={d.id} className="px-5 py-2.5"><div className="truncate">{d.title}</div><div className="text-xs text-neutral-500">{d.code} · {date(d.date)} · {d.decidedBy}</div></li>
            ))}
            {decisions.length === 0 && <li className="px-5 py-4 text-neutral-500">None recorded.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
