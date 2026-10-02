import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { companyState } from "../../../lib/company";
import ClientForm from "../ClientForm";

/** A client without a won deal (e.g. a referral signed directly). Won deals come in through Onboarding. */
export default async function NewClientPage() {
  await requirePermission("clients.edit");
  const [codes, ourState] = await Promise.all([prisma.client.findMany({ select: { code: true } }), companyState()]);
  return (
    <>
      <PageHeader title="New client" subtitle="For a client signed directly. Won deals from the Lead Finder come in through the Onboarding queue." />
      <ClientForm takenCodes={codes.map((c) => c.code)} companyState={ourState} />
    </>
  );
}
