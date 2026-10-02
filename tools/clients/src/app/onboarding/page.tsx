import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { ONBOARDING_CHECKLIST, parseChecklist } from "../../lib/agreements";
import { companyState } from "../../lib/company";
import OnboardForm from "./OnboardForm";

const countryOf = (market: string | null | undefined) => (market === "US" ? "USA" : "India");

/**
 * Step 1: won deals waiting to become clients (from opportunities, and won leads from before opportunities).
 * Step 2: clients still onboarding, with their checklist progress. No amounts on this page.
 */
export default async function OnboardingPage() {
  await requirePermission("clients.edit");
  const ourState = await companyState();
  const [opportunities, oldWonLeads, clients, onboarding] = await Promise.all([
    prisma.opportunity.findMany({
      where: { stage: "WON", onboardedAt: null },
      orderBy: { wonAt: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        services: true,
        wonAt: true,
        ownerName: true,
        clientId: true,
        lead: { select: { id: true, code: true, name: true, contactName: true, personName: true, email: true, phone: true, website: true, market: true, industry: true } },
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.lead.findMany({
      where: { stage: "WON", clientId: null, opportunities: { none: {} } },
      orderBy: { wonAt: "asc" },
      select: { id: true, code: true, name: true, contactName: true, personName: true, email: true, phone: true, website: true, market: true, industry: true, wonAt: true, wonPackage: true, wonCarePlan: true, ownerName: true },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, number: true } }),
    prisma.client.findMany({ where: { status: "ONBOARDING" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, number: true, code: true, checklist: true, createdAt: true } }),
  ]);
  const clientOptions = clients.map((c) => ({ id: c.id, label: `${c.code} · ${c.name} (${c.number})` }));
  const takenCodes = clients.map((c) => c.code);
  const waiting = opportunities.length + oldWonLeads.length;

  return (
    <>
      <PageHeader title="Onboarding" subtitle="Won deals become clients here: a Client ID and code, then agreements, the project and the checklist." />

      <section className="card mb-6">
        <div className="card-h"><div className="card-t">1. Won deals to onboard</div><span className="text-xs text-neutral-500">{waiting}</span></div>
        {waiting === 0 ? (
          <Empty>Nothing waiting. Deals marked Won in the Lead Finder appear here.</Empty>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {opportunities.map((o) => (
              <li key={o.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900">
                      {o.lead?.name ?? o.client?.name ?? "Deal"} · {o.title}
                    </div>
                    <div className="text-xs text-neutral-500">
                      <span className="font-mono">{o.code}</span>
                      {o.lead && <> · lead <Link className="underline" href={`/leads/${o.lead.id}`}>{o.lead.code}</Link></>}
                      {o.services.length > 0 && ` · ${o.services.join(", ")}`} · won {date(o.wonAt)}
                      {o.ownerName && ` by ${o.ownerName}`}
                      {o.client && ` · existing client ${o.client.name}`}
                    </div>
                  </div>
                </div>
                <OnboardForm
                  companyState={ourState}
                  deal={{
                    opportunityId: o.id,
                    name: o.client?.name ?? o.lead?.name ?? o.title,
                    contactName: o.lead?.contactName ?? o.lead?.personName ?? null,
                    email: o.lead?.email ?? null,
                    phone: o.lead?.phone ?? null,
                    website: o.lead?.website ?? null,
                    country: countryOf(o.lead?.market),
                    industry: o.lead?.industry ?? null,
                  }}
                  clients={clientOptions}
                  takenCodes={takenCodes}
                />
              </li>
            ))}
            {oldWonLeads.map((l) => (
              <li key={l.id} className="px-5 py-4">
                <div className="font-medium text-neutral-900">
                  {l.name} · {l.wonPackage ?? "Won"}
                  {l.wonCarePlan && l.wonCarePlan !== "None" && ` + ${l.wonCarePlan}`}
                </div>
                <div className="text-xs text-neutral-500">
                  lead <Link className="underline" href={`/leads/${l.id}`}>{l.code}</Link> · won {date(l.wonAt)}
                  {l.ownerName && ` by ${l.ownerName}`}
                </div>
                <OnboardForm
                  companyState={ourState}
                  deal={{ leadId: l.id, name: l.name, contactName: l.contactName ?? l.personName, email: l.email, phone: l.phone, website: l.website, country: countryOf(l.market), industry: l.industry }}
                  clients={clientOptions}
                  takenCodes={takenCodes}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-h"><div className="card-t">2. Clients being onboarded</div><span className="text-xs text-neutral-500">{onboarding.length}</span></div>
        <table className="tbl">
          <thead><tr><th>Client</th><th>Checklist</th><th className="hidden sm:table-cell">Since</th><th /></tr></thead>
          <tbody>
            {onboarding.map((c) => {
              const done = parseChecklist(c.checklist);
              const n = ONBOARDING_CHECKLIST.filter((i) => done[i.key]).length;
              return (
                <tr key={c.id}>
                  <td><Link href={`/clients/${c.id}`} className="font-medium text-brand-fg hover:underline">{c.name}</Link><div className="font-mono text-xs text-neutral-500">{c.number} · {c.code}</div></td>
                  <td>{n} of {ONBOARDING_CHECKLIST.length}</td>
                  <td className="hidden sm:table-cell">{date(c.createdAt)}</td>
                  <td className="text-right"><StatusBadge status="ONBOARDING" /></td>
                </tr>
              );
            })}
            {onboarding.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-neutral-500">No clients in onboarding.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
