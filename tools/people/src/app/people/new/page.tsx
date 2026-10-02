import { PageHeader } from "@genclover/ui";
import { can, requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import PersonForm from "../PersonForm";

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requirePermission("people.edit");
  const type = (await searchParams).type === "CONTRACTOR" ? "CONTRACTOR" : "EMPLOYEE";
  const roles = await prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Add a person" subtitle="They get an ID (GCE-0001 employee, GCT-0001 contractor). Documents, work orders and the onboarding checklist come next." />
      <PersonForm
        roles={roles}
        showPay={can(user.role, "cost.view")}
        canPay={can(user.role, "cost.edit")}
        initial={{
          name: "", email: "", phone: "", title: "", department: "", managerName: "", type, roleId: "", stdHoursPerMonth: "160", startDate: "", endDate: "",
          pan: "", gstin: "", notes: "", active: true, payModel: type === "EMPLOYEE" ? "SALARY" : "HOURLY", costInr: "0", gstRegistered: false, tdsRatePct: "", nextReviewDate: "",
        }}
      />
    </>
  );
}
