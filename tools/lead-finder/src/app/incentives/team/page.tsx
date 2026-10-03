import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { can, roleLabel } from "@genclover/auth/access";
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
    prisma.user.findMany({ select: { id: true, name: true, role: true, email: true, active: true }, orderBy: { name: "asc" } }),
    members(),
    prisma.person.findMany({ where: { active: true }, select: { id: true, name: true, code: true, email: true, payModel: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  // Their People record, matched by email, as the suggestion when someone is added.
  const suggestedPerson = (email: string) => people.find((p) => p.email && p.email.toLowerCase() === email.toLowerCase())?.id ?? null;
  // Only the people the owner has added and saved; nobody is listed until then.
  const rows = team
    .map((m) => ({ m, u: users.find((x) => x.id === m.userId) }))
    .filter((x): x is { m: (typeof team)[number]; u: (typeof users)[number] } => !!x.u)
    .map(({ m, u }) => ({
      userId: u.id,
      name: u.name,
      role: `${roleLabel(u.role)}${u.active ? "" : " · login disabled"}`,
      canWork: can(u.role, "leads.edit"),
      saved: true,
      managerUserId: m.managerUserId,
      onIncentive: m.onIncentive,
      personId: m.personId,
      active: m.active,
      isManager: u.role === "SALES_MANAGER",
      canGenerateLeads: m.canGenerateLeads,
      canReassignTeam: m.canReassignTeam,
    }));

  return (
    <>
      <PageHeader title="Sales team" subtitle="Add the people who sell: who manages whom, who is in the lead rotation, what managers may do with leads, who is on incentives and the People record they're paid through." />
      <SettingsForm initial={s} />
      <TeamTable
        rows={rows}
        // A manager is a sales manager or an owner.
        managers={users
          .filter((u) => (u.active && (u.role === "SALES_MANAGER" || u.role === "OWNER")) || team.some((m) => m.managerUserId === u.id))
          .map((u) => ({ id: u.id, name: u.name }))}
        people={people.map((p) => ({ id: p.id, label: `${p.code ?? ""} ${p.name}`.trim() }))}
        // Anyone active whose role can work leads (sales, sales managers, an owner who also sells); not a CFO or accountant.
        others={users
          .filter((u) => u.active && !team.some((m) => m.userId === u.id) && can(u.role, "leads.edit"))
          .map((u) => ({ id: u.id, name: u.name, role: roleLabel(u.role), isManager: u.role === "SALES_MANAGER", personId: suggestedPerson(u.email) }))}
      />
    </>
  );
}
