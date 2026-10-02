import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Stat } from "@genclover/ui";
import { can, canAccessPath, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, inr, money } from "@genclover/ui/format";
import { detail, visibleUserIds } from "@genclover/incentives";
import { BUCKET_LABEL, bucketOf, STAGE_LABEL, STATUS, statusLabel } from "@genclover/incentives/rules";
import { SOURCES } from "../../../lib/services";
import { ApprovePanel, InvoiceLinks, OwnerPanel } from "./IncentiveControls";

const FIELD_LABEL: Record<string, string> = {
  created: "Recorded",
  status: "Status",
  seller: "Seller",
  manager: "Manager",
  sellerRatePct: "Seller %",
  managerRatePct: "Manager %",
  services: "Services",
  qualifying: "Qualifying service",
  baseAmount: "Base",
  currency: "Currency",
  clientId: "Client",
  projectId: "Project",
  newClient: "New-client check",
  invoice: "Invoice counted",
};

/** One deal's incentive: who earns, on what, the client's payments, the money and every change. */
export default async function IncentivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await detail(id).catch(() => null);
  if (!data) notFound();
  const { d, services, client, opp, lead, invoices, clientInvoices } = data;
  const manage = can(user.role, "incentives.manage");
  const approver = can(user.role, "incentives.approve") || manage;
  if (!approver) {
    const mine = await visibleUserIds(user.id);
    if (![d.sellerUserId, d.managerUserId].some((x) => x && mine.includes(x))) notFound();
  }
  const users = approver ? await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const projects = manage && d.clientId ? await prisma.project.findMany({ where: { clientId: d.clientId }, select: { id: true, code: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  const now = new Date();
  const counted = d.entries.filter((e) => e.role === "SELLER" && e.type !== "ADJUSTMENT").reduce((s, e) => s + e.basisAmount, 0);
  const visibleEntries = approver ? d.entries : d.entries.filter((e) => !e.paidOn && (e.userId === user.id || d.managerUserId === user.id));
  const show = (field: string, v: string | null) => {
    if (v == null) return "—";
    if ((field === "seller" || field === "manager") && names.has(v)) return names.get(v)!;
    if (field === "status") return statusLabel(v);
    return v;
  };

  return (
    <>
      <PageHeader
        title={`${client?.name ?? lead?.name ?? "Deal"} · ${d.code}`}
        subtitle={<>{statusLabel(d.status)}: {STATUS[d.status as keyof typeof STATUS]?.hint}</>}
        actions={<Link href="/leads/incentives" className="btn-secondary">← Incentives</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Seller" value={d.sellerName ?? "—"} hint={`${d.sellerRatePct}%${d.leadOwnerAtWon && d.leadOwnerAtWonId !== d.sellerUserId ? ` · lead owner at Won: ${d.leadOwnerAtWon}` : ""}`} />
        <Stat label="Manager" value={d.managerUserId && d.managerUserId !== d.sellerUserId ? (d.managerName ?? "—") : "—"} hint={d.managerUserId && d.managerUserId !== d.sellerUserId ? `${d.managerRatePct}%` : "No manager share"} />
        <Stat label="Qualifying service" value={d.qualifyingLabel ?? "—"} hint={d.baseAmount != null ? `${money(d.baseAmount, d.currency)}${d.qualifyingKind === "MONTHLY" ? " first month" : ""}${d.autoSelected ? " · highest value" : " · picked"}` : "No price yet"} />
        <Stat label="Client has paid" value={d.baseAmount ? `${Math.min(100, Math.round((counted / d.baseAmount) * 100))}%` : "—"} hint={d.baseAmount ? `${money(counted, d.currency)} of ${money(d.baseAmount, d.currency)}` : undefined} />
      </div>

      <section className="card mb-6 p-5 text-sm">
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          <div><span className="text-neutral-500">Won:</span> {date(d.wonAt)} · {d.wonSummary}{d.wonValue != null && <> · value then {money(d.wonValue, d.wonCurrency ?? d.currency)}</>}</div>
          <div><span className="text-neutral-500">Lead:</span> {lead ? <Link className="underline" href={`/leads/${lead.id}`}>{lead.code} {lead.name}</Link> : "—"}{d.leadSource && ` · ${SOURCES[d.leadSource] ?? d.leadSource}`}</div>
          <div><span className="text-neutral-500">Deal:</span> {opp ? <Link className="underline" href={`/leads/opportunities/${opp.id}`}>{opp.code}</Link> : "—"}{opp?.onboardedAt && ` · onboarded ${date(opp.onboardedAt)}`}</div>
          <div>
            <span className="text-neutral-500">Client:</span>{" "}
            {client ? (canAccessPath(user.role, `/clients/${client.id}`) ? <Link className="underline" href={`/clients/${client.id}`}>{client.number} · {client.name}</Link> : `${client.number} · ${client.name}`) : "not onboarded yet"}
            {client && approver && <span className="text-xs text-neutral-500"> · {[client.gstin && `GSTIN ${client.gstin}`, client.cin && `CIN ${client.cin}`, client.ein && `EIN ${client.ein}`].filter(Boolean).join(" · ") || "no registration numbers"}</span>}
          </div>
          <div><span className="text-neutral-500">New client:</span> {d.newClient == null ? "checked at onboarding" : d.newClient ? "yes" : <span className="text-red-600">no</span>}{d.duplicateNote && <span className="text-xs text-neutral-500"> · {d.duplicateNote}</span>}</div>
          <div><span className="text-neutral-500">Decision:</span> {d.decidedByName ? `${d.decidedByName}, ${date(d.decidedAt)}` : d.proposedByName ? `proposed by ${d.proposedByName}, ${date(d.proposedAt)}` : "not yet"}{d.decisionNote && ` · “${d.decisionNote}”`}</div>
        </div>
        <table className="tbl mt-4">
          <thead><tr><th>Service sold</th><th>Billing</th><th className="num">Agreed price</th><th /></tr></thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td><td className="text-xs">{s.kind === "MONTHLY" ? "Monthly" : "One-time"}</td>
                <td className="num">{s.value != null ? money(s.value, d.currency) : "—"}</td>
                <td className="text-xs text-emerald-700">{s.key === d.qualifyingKey ? "qualifies" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {approver && ["DRAFT", "PENDING_APPROVAL"].includes(d.status) && (
        <ApprovePanel id={d.id} services={services} picked={d.autoSelected ? null : d.qualifyingKey} currency={d.currency} proposedEligible={d.proposedEligible} hasSeller={!!d.sellerUserId} />
      )}

      <section className="card mb-6 overflow-x-auto">
        <div className="card-h"><div className="card-t">Invoices counted</div><span className="text-xs text-neutral-500">Receipts on these earn the incentive, up to the base</span></div>
        <InvoiceLinks id={d.id} manage={manage} linked={invoices.map((i) => ({ ...i, issueDate: date(i.issueDate), total: money(i.total, i.currency) }))} others={clientInvoices.map((i) => ({ ...i, issueDate: date(i.issueDate), total: money(i.total, i.currency) }))} />
      </section>

      <section className="card mb-6 overflow-x-auto">
        <div className="card-h"><div className="card-t">Money</div><span className="text-xs text-neutral-500">{approver ? "Every line, paid ones included" : "Not yet paid (paid lines leave this list)"}</span></div>
        {visibleEntries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Nothing earned yet: money appears when the client pays a counted invoice.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>For</th><th className="hidden md:table-cell">On</th><th className="num">Amount</th><th>Where it is</th></tr></thead>
            <tbody>
              {visibleEntries.map((e) => {
                const b = bucketOf(e, now);
                return (
                  <tr key={e.id}>
                    <td className="text-sm">{date(e.date)}</td>
                    <td className="text-sm">{e.userName}<div className="text-xs text-neutral-500">{e.role === "SELLER" ? "Seller" : "Manager"}{e.ratePct ? ` ${e.ratePct}%` : ""} · {e.type === "ACCRUAL" ? "earned" : e.type === "REVERSAL" ? "reversal" : "adjustment"}</div></td>
                    <td className="hidden text-xs md:table-cell">{e.invoiceNumber ? `${e.invoiceNumber}: ${inr(e.basisInr)} counted` : e.note}</td>
                    <td className={`num ${e.amountInr < 0 ? "text-red-600" : ""}`}>{inr(e.amountInr, 2)}</td>
                    <td className="text-sm">{BUCKET_LABEL[b]}{b === "HOLDING" && <div className="text-xs text-neutral-500">until {date(e.availableOn)}</div>}{e.paidOn && <div className="text-xs text-neutral-500">{date(e.paidOn)}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {manage && (
        <OwnerPanel
          id={d.id}
          users={users}
          projects={projects.map((p) => ({ id: p.id, label: `${p.code} ${p.name}` }))}
          current={{
            sellerUserId: d.sellerUserId,
            managerUserId: d.managerUserId,
            sellerRatePct: d.sellerRatePct,
            managerRatePct: d.managerRatePct,
            status: d.status,
            projectId: d.projectId,
            currency: d.currency,
            services,
            picked: d.autoSelected ? null : d.qualifyingKey,
          }}
        />
      )}

      <section className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">What changed</div><span className="text-xs text-neutral-500">From Won to now, every step</span></div>
        <table className="tbl">
          <thead><tr><th>When</th><th>Step</th><th>Who</th><th>What</th><th className="hidden md:table-cell">Why</th></tr></thead>
          <tbody>
            {d.changes.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap text-sm">{date(c.at)}</td>
                <td className="text-xs">{STAGE_LABEL[c.stage] ?? c.stage}</td>
                <td className="text-sm">{c.byName}</td>
                <td className="text-sm">
                  <span className="font-medium">{FIELD_LABEL[c.field] ?? c.field}</span>
                  {c.field === "created" ? <div className="text-xs text-neutral-500">{c.toValue}</div> : <div className="text-xs text-neutral-500">{show(c.field, c.fromValue)} → {show(c.field, c.toValue)}</div>}
                </td>
                <td className="hidden text-xs md:table-cell">{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
