import { PageHeader } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import ClientForm from "../ClientForm";

export default async function NewClientPage() {
  await requireRole("EDITOR");
  return (
    <>
      <PageHeader title="New client" />
      <ClientForm />
    </>
  );
}
