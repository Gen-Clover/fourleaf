import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote, StatusBadge } from "@genclover/ui";
import { can, canAccessPath, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, KIND_LABEL, money } from "@genclover/ui/format";
import { AGREEMENT_TYPES, daysUntil, parseChecklist } from "../../../lib/agreements";
import { deleteClient } from "../../actions";
import { companyState } from "../../../lib/company";
import ClientForm from "../ClientForm";
import { Checklist, Contacts } from "./ClientParts";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "details", label: "Details & billing" },
  { key: "agreements", label: "Agreements" },
  { key: "projects", label: "Projects" },
];

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const user = await requireUser();
  const showMoney = can(user.role, "finance.view");
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      agreements: { orderBy: { createdAt: "asc" }, include: { project: { select: { code: true } } }, omit: { value: !showMoney, currency: !showMoney } },
      projects: { orderBy: { createdAt: "desc" }, select: { id: true, code: true, name: true, kind: true, status: true, startDate: true, deliveryManager: true } },
      opportunities: { orderBy: { createdAt: "desc" }, omit: { value: !can(user.role, "deals.all"), currency: !can(user.role, "deals.all") } },
      leads: { select: { id: true, code: true, name: true } },
      invoices: { select: { status: true } },
    },
  });
  if (!client) notFound();
  const canEdit = can(user.role, "clients.edit");
  const canAgreements = can(user.role, "agreements.edit");
  const openProject = (pid: string) => canAccessPath(user.role, `/projects/${pid}`);
  const inv = { sent: client.invoices.filter((i) => ["SENT", "PARTIAL"].includes(i.status)).length, paid: client.invoices.filter((i) => i.status === "PAID").length, draft: client.invoices.filter((i) => i.status === "DRAFT").length };

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/clients" className="hover:underline">← Clients</Link>·<span className="font-mono text-xs">{client.number}</span>·
            <span className="font-mono text-xs">{client.code}</span>·<StatusBadge status={client.status} />·<span>{client.currency}</span>
          </span>
        }
        actions={
          <>
            {canAgreements && <Link href={`/agreements/new?client=${client.id}`} className="btn-secondary">+ Agreement</Link>}
            {can(user.role, "projects.create") && <Link href={`/projects/new?client=${client.id}`} className="btn-primary">+ Project</Link>}
            {can(user.role, "admin") && client.projects.length === 0 && client.invoices.length === 0 && (
              <form action={deleteClient.bind(null, client.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />
      {!canEdit && <ReadOnlyNote />}
      <div className="mb-5 flex flex-wrap gap-x-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link key={t.key} href={`/clients/${client.id}?tab=${t.key}`} className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-semibold text-brand-fg" : "border-transparent text-neutral-600 hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="min-w-0 space-y-6">
            <Contacts clientId={client.id} contacts={client.contacts} canEdit={canEdit} />
            <div className="card">
              <div className="card-h"><div className="card-t">Deals</div></div>
              <ul className="divide-y divide-neutral-100 text-sm">
                {client.opportunities.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-neutral-500">{o.code}</span> {o.title}
                    </span>
                    <span className="flex items-center gap-2">
                      {o.value != null && <span className="text-xs text-neutral-600">{money(o.value, o.currency)}</span>}
                      <StatusBadge status={o.stage} />
                    </span>
                  </li>
                ))}
                {client.opportunities.length === 0 && <li className="px-5 py-4 text-neutral-500">No deals recorded.</li>}
                {client.leads.map((l) => (
                  <li key={l.id} className="px-5 py-2 text-xs text-neutral-500">
                    Found as lead{" "}
                    {canAccessPath(user.role, `/leads/${l.id}`) ? <Link className="text-brand-fg underline" href={`/leads/${l.id}`}>{l.code}</Link> : l.code} ({l.name})
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5 text-sm">
              <div className="card-t mb-2">Billing</div>
              <p className="text-neutral-600">
                Invoices: {inv.draft} draft · {inv.sent} sent, awaiting payment · {inv.paid} paid.
                {!showMoney && " Amounts are with Finance."}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {client.currency === "INR" ? `GST invoice (${client.state ? `place of supply ${client.state}` : "add the state for place of supply"})` : "Export of services invoice (US$)"}
                {client.gstin ? ` · GSTIN ${client.gstin}` : client.currency === "INR" ? " · no GSTIN (B2C)" : ""}
              </p>
            </div>
          </div>
          <Checklist clientId={client.id} done={parseChecklist(client.checklist)} status={client.status} canEdit={canEdit} />
        </div>
      )}

      {tab === "details" && <ClientForm client={client} readOnly={!canEdit} companyState={await companyState()} />}

      {tab === "agreements" && (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>ID</th><th>Type</th><th>Title</th><th>Status</th><th className="hidden md:table-cell">Signed</th><th className="hidden md:table-cell">Expires</th>{showMoney && <th className="num">Value</th>}</tr>
            </thead>
            <tbody>
              {client.agreements.map((a) => {
                const left = daysUntil(a.expiresAt);
                return (
                  <tr key={a.id}>
                    <td className="font-mono text-xs"><Link href={`/agreements/${a.id}`} className="text-brand-fg hover:underline">{a.code}</Link></td>
                    <td className="text-xs">{AGREEMENT_TYPES[a.type]?.label ?? a.type}</td>
                    <td>{a.title}{a.project && <div className="text-xs text-neutral-500">{a.project.code}</div>}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="hidden md:table-cell">{date(a.signedAt)}</td>
                    <td className={`hidden md:table-cell ${left != null && left < 30 ? "font-medium text-amber-700" : ""}`}>{date(a.expiresAt)}</td>
                    {showMoney && <td className="num">{money(a.value, a.currency)}</td>}
                  </tr>
                );
              })}
              {client.agreements.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-500">No agreements yet. Start with the NDA or MSA.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "projects" && (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Project</th><th>Type</th><th>Status</th><th className="hidden md:table-cell">Delivery manager</th><th>Start</th></tr></thead>
            <tbody>
              {client.projects.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td>{openProject(p.id) ? <Link href={`/projects/${p.id}`} className="font-medium text-brand-fg hover:underline">{p.name}</Link> : p.name}</td>
                  <td className="text-xs">{KIND_LABEL[p.kind] ?? p.kind}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="hidden md:table-cell">{p.deliveryManager ?? "—"}</td>
                  <td>{date(p.startDate)}</td>
                </tr>
              ))}
              {client.projects.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
