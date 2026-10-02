import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, money } from "@genclover/ui/format";
import { AGREEMENT_STATUSES, AGREEMENT_TYPES, daysUntil, LIVE_STATUSES } from "../../lib/agreements";

/** Every agreement, filterable; "Renewals" shows live agreements expiring in the next 60 days (or already expired). */
export default async function AgreementsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; view?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const showMoney = can(user.role, "finance.view");
  const renewals = sp.view === "renewals";
  const soon = new Date(Date.now() + 60 * 86_400_000);
  const q = sp.q?.trim();
  const agreements = await prisma.agreement.findMany({
    where: {
      ...(sp.type && AGREEMENT_TYPES[sp.type] ? { type: sp.type } : {}),
      ...(sp.status && (AGREEMENT_STATUSES as readonly string[]).includes(sp.status) ? { status: sp.status } : {}),
      ...(renewals ? { status: { in: LIVE_STATUSES }, expiresAt: { not: null, lte: soon } } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: renewals ? { expiresAt: "asc" } : { updatedAt: "desc" },
    take: 500,
    omit: { value: !showMoney, currency: !showMoney },
    include: { client: { select: { id: true, name: true } }, project: { select: { id: true, code: true } } },
  });
  const link = (patch: Record<string, string>) => `/agreements?${new URLSearchParams({ ...(sp.type ? { type: sp.type } : {}), ...(sp.status ? { status: sp.status } : {}), ...patch })}`;

  return (
    <>
      <PageHeader
        title="Agreements"
        subtitle="NDAs, MSAs, SOWs, change requests, SLAs and acceptance certificates, with status, versions and renewal dates."
        actions={(can(user.role, "agreements.edit") || can(user.role, "projects.edit")) && <Link href="/agreements/new" className="btn-primary">+ New agreement</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/agreements" className={!renewals && !sp.type && !sp.status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</Link>
        <Link href="/agreements?view=renewals" className={renewals ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Renewals (60 days)</Link>
        <select className="input-sm w-auto" defaultValue={sp.type ?? ""} aria-label="Type" form="flt" name="type">
          <option value="">Any type</option>
          {Object.entries(AGREEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input-sm w-auto" defaultValue={sp.status ?? ""} aria-label="Status" form="flt" name="status">
          <option value="">Any status</option>
          {AGREEMENT_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <form id="flt" className="flex gap-2">
          <input className="input-sm w-48" name="q" placeholder="Search code, title, client…" defaultValue={q} />
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
        {(sp.type || sp.status || q) && <Link href="/agreements" className="text-xs underline">Clear</Link>}
      </div>
      <div className="card overflow-x-auto">
        {agreements.length === 0 ? (
          <Empty>{renewals ? "Nothing expiring in the next 60 days." : "No agreements match."}</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th><th>Type</th><th>Title</th><th>Client</th><th>Status</th><th className="hidden md:table-cell">Signed</th><th>Expires</th>
                {showMoney && <th className="num hidden lg:table-cell">Value</th>}
              </tr>
            </thead>
            <tbody>
              {agreements.map((a) => {
                const left = daysUntil(a.expiresAt);
                return (
                  <tr key={a.id}>
                    <td className="font-mono text-xs whitespace-nowrap"><Link href={`/agreements/${a.id}`} className="text-brand-fg hover:underline">{a.code}</Link></td>
                    <td className="text-xs">{AGREEMENT_TYPES[a.type]?.label ?? a.type}</td>
                    <td className="min-w-48">{a.title}{a.version > 1 && <span className="ml-1 text-xs text-neutral-500">v{a.version}</span>}</td>
                    <td><Link href={`/clients/${a.client.id}`} className="hover:underline">{a.client.name}</Link>{a.project && <div className="font-mono text-xs text-neutral-500">{a.project.code}</div>}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="hidden md:table-cell">{date(a.signedAt)}</td>
                    <td className={left != null && left < 0 ? "font-medium text-red-700" : left != null && left <= a.renewalNoticeDays ? "font-medium text-amber-700" : ""}>
                      {date(a.expiresAt)}
                      {left != null && LIVE_STATUSES.includes(a.status) && <div className="text-xs">{left < 0 ? `expired ${-left} days ago` : `${left} days left`}</div>}
                    </td>
                    {showMoney && <td className="num hidden lg:table-cell">{money(a.value, a.currency)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Owners are emailed before a live agreement expires (the number of days is set on each agreement).
        <Link className="ml-1 underline" href={link({ view: "renewals" })}>See renewals</Link>
      </p>
    </>
  );
}
