import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
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
