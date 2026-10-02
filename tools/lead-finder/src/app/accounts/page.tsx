import Link from "next/link";
import { Empty, PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma, type Prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { B2B_SERVICES, INDUSTRIES, OPEN_OPP_STAGES, serviceLabel } from "../../lib/b2b";
import { NO_DEAL } from "../../lib/dealAccess";
import { SOURCES } from "../../lib/services";
import { StageBadge } from "../bits";

/** Company accounts (B2B): typed in, from LinkedIn, or imported. Local businesses from Google Maps are under Leads. */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ industry?: string; service?: string; owner?: string; q?: string; source?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.LeadWhereInput = {
    kind: "B2B",
    ...(sp.industry ? { industry: sp.industry } : {}),
    ...(sp.service && B2B_SERVICES[sp.service] ? { services: { has: sp.service } } : {}),
    ...(sp.owner === "me" ? { ownerId: user.id } : sp.owner === "none" ? { ownerId: null } : {}),
    ...(sp.source && SOURCES[sp.source] ? { source: sp.source } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }, { website: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [accounts, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      omit: NO_DEAL,
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: { _count: { select: { contacts: true } }, opportunities: { where: { stage: { in: OPEN_OPP_STAGES } }, select: { id: true } } },
    }),
    prisma.lead.count({ where }),
  ]);
  const canEdit = can(user.role, "leads.edit");
  const sel = (name: string, value: string | undefined, options: [string, string][]) => (
    <select name={name} defaultValue={value ?? ""} className="input-sm w-auto" aria-label={name}>
      {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
  return (
    <>
      <PageHeader
        title="Company accounts"
        subtitle="B2B accounts: any industry, any service. Each can have several contacts and several opportunities."
        actions={
          canEdit && (
            <>
              <Link href="/leads/import" className="btn-secondary">Import CSV / LinkedIn</Link>
              <Link href="/leads/new?kind=B2B" className="btn-primary">+ Add company</Link>
            </>
          )
        }
      />
      <form className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <input className="input-sm w-56" name="q" placeholder="Company, contact, website, GL- ID…" defaultValue={q} />
        {sel("industry", sp.industry, [["", "Any industry"], ...INDUSTRIES.map((i) => [i, i] as [string, string])])}
        {sel("service", sp.service, [["", "Any service"], ...Object.entries(B2B_SERVICES)])}
        {sel("source", sp.source, [["", "Any source"], ...Object.entries(SOURCES).filter(([k]) => k !== "MAPS")])}
        {sel("owner", sp.owner, [["", "Anyone"], ["me", "Mine"], ["none", "Unassigned"]])}
        <button className="btn-secondary btn-sm">Filter</button>
        {(q || sp.industry || sp.service || sp.owner || sp.source) && <Link href="/leads/accounts" className="text-xs underline">Clear</Link>}
        <span className="ml-auto text-xs text-neutral-500">{total} account{total === 1 ? "" : "s"}</span>
      </form>
      <div className="card overflow-x-auto">
        {accounts.length === 0 ? (
          <Empty href={canEdit ? "/leads/new?kind=B2B" : undefined} cta="Add a company">No company accounts match.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Account</th><th className="hidden md:table-cell">Industry</th><th className="hidden lg:table-cell">Services</th><th className="num">Contacts</th>
                <th className="num">Open deals</th><th>Stage</th><th className="hidden md:table-cell">Owner</th><th className="hidden lg:table-cell">Last contact</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/leads/${a.id}`} className="font-medium text-brand-fg hover:underline">{a.name}</Link>
                    <div className="text-xs text-neutral-500"><span className="font-mono">{a.code}</span>{a.area && ` · ${a.area}`} · {SOURCES[a.source] ?? a.source}</div>
                  </td>
                  <td className="hidden text-sm md:table-cell">{a.industry ?? "—"}{a.companySize && <div className="text-xs text-neutral-500">{a.companySize} staff</div>}</td>
                  <td className="hidden max-w-64 text-xs lg:table-cell">{a.services.map(serviceLabel).join(", ") || "—"}</td>
                  <td className="num">{a._count.contacts}</td>
                  <td className="num">{a.opportunities.length}</td>
                  <td><StageBadge stage={a.stage} /></td>
                  <td className="hidden text-sm md:table-cell">{a.ownerName ?? "—"}</td>
                  <td className="hidden text-sm lg:table-cell">{date(a.lastContactAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
