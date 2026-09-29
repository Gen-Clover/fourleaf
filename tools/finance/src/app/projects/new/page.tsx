import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import NewProjectForm from "./NewProjectForm";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireRole("EDITOR");
  const { client } = await searchParams;
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="New project" subtitle="A project ID is generated automatically. You'll add resources and pricing next." />
      {clients.length === 0 ? (
        <div className="card p-6 text-sm">
          Add a client first. <Link href="/clients/new" className="text-brand-fg underline">Create client →</Link>
        </div>
      ) : (
        <NewProjectForm clients={clients} defaultClient={client} />
      )}
    </>
  );
}
