import { PageHeader } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import NewLeadForm from "./NewLeadForm";

export default async function NewLeadPage() {
  await requireRole("EDITOR");
  const niches = await prisma.leadNiche.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, label: true } });
  return (
    <>
      <PageHeader title="Add a lead" subtitle="Walk-ins, referrals and your own contacts: tracked the same way as leads from Google Maps." />
      <NewLeadForm niches={niches} />
    </>
  );
}
