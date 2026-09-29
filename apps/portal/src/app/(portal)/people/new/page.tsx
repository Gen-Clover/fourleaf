import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import PersonForm from "../PersonForm";

export default async function NewPersonPage() {
  await requireRole("ADMIN");
  const roles = await prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Add person" subtitle="Employees and contractors who deliver projects." />
      <PersonForm roles={roles} />
    </>
  );
}
