import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import NewAccountForm from "./NewAccountForm";
import NewLeadForm from "./NewLeadForm";

/** Add a lead by hand: a local business (walk-in, referral) or a company account (B2B, LinkedIn, events). */
export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requirePermission("leads.edit");
  const b2b = (await searchParams).kind === "B2B";
  const niches = b2b ? [] : await prisma.leadNiche.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, label: true } });
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={on ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{label}</Link>
  );
  return (
    <>
      <PageHeader
        title={b2b ? "Add a company account" : "Add a lead"}
        subtitle={b2b ? "Companies that may need software work: from LinkedIn, referrals, events or your network." : "Walk-ins, referrals and your own contacts: tracked the same way as leads from Google Maps."}
        actions={<Link href="/leads/import" className="btn-secondary">Import a list…</Link>}
      />
      <div className="mb-4 flex gap-2">
        {tab("/leads/new", "Local business", !b2b)}
        {tab("/leads/new?kind=B2B", "Company (B2B)", b2b)}
      </div>
      {b2b ? <NewAccountForm /> : <NewLeadForm niches={niches} />}
    </>
  );
}
