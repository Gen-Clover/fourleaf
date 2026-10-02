import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { roleLabel } from "@genclover/auth/access";
import { prisma } from "@genclover/db";
import { getSettings, members } from "@genclover/incentives";
import { SettingsForm, TeamTable } from "./TeamForms";

/**
 * The sales team set-up: who manages whom (the manager's share), who is on incentives (a hint for onboarding and the
 * review report; every deal is still decided at onboarding), and the People record each person is paid through.
 */
export default async function SalesTeamPage() {
  await requirePermission("incentives.manage");
  const [users, team, people, s] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true, email: true }, orderBy: { name: "asc" } }),
    members(),
    prisma.person.findMany({ where: { active: true }, select: { id: true, name: true, code: true, email: true, payModel: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  const sales = users.filter((u) => ["SALES", "SALES_MANAGER"].includes(u.role) || team.some((m) => m.userId === u.id));
  const rows = sales.map((u) => {
    const m = team.find((x) => x.userId === u.id);
    const suggested = people.find((p) => p.email && p.email.toLowerCase() === u.email.toLowerCase());
    return {
      userId: u.id,
      name: u.name,
      role: roleLabel(u.role),
      saved: !!m,
      managerUserId: m?.managerUserId ?? null,
      onIncentive: m?.onIncentive ?? true,
      personId: m?.personId ?? suggested?.id ?? null,
      active: m?.active ?? true,
      isManager: u.role === "SALES_MANAGER",
      canGenerateLeads: m?.canGenerateLeads ?? false,
      canReassignTeam: m?.canReassignTeam ?? false,
    };
  });

  return (
    <>
      <PageHeader title="Sales team" subtitle="Who manages whom, who is in the lead rotation, what managers may do with leads, who is on incentives and the People record they're paid through." />
      <SettingsForm initial={s} />
      <TeamTable
        rows={rows}
        managers={users.map((u) => ({ id: u.id, name: u.name }))}
        people={people.map((p) => ({ id: p.id, label: `${p.code ?? ""} ${p.name}`.trim() }))}
        others={users.filter((u) => !sales.some((x) => x.id === u.id)).map((u) => ({ id: u.id, name: `${u.name} (${roleLabel(u.role)})` }))}
      />
    </>
  );
}
