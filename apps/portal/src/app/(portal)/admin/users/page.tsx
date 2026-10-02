import { PageHeader } from "@genclover/ui";
import { PERMISSIONS, permissionsOf, requirePermission, ROLE_INFO, ROLES, type Permission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { NewUserForm, UsersTable } from "./UsersClient";

/** The permission groups shown in the "What each role can do" table. */
const GROUPS: [string, Permission[]][] = [
  ["Lead Finder", ["leads.view", "leads.edit", "leads.won", "leads.settings"]],
  ["Money in leads", ["deals.own", "deals.all"]],
  ["Prices", ["prices.view"]],
  ["Clients & projects", ["clients.view", "clients.edit", "projects.view", "projects.edit"]],
  ["Hours", ["hours.own", "hours.all"]],
  ["Finance", ["finance.view", "finance.edit", "finance.settings"]],
  ["Costs & salaries", ["cost.view", "cost.edit"]],
  ["Portal", ["admin"]],
];

export default async function UsersPage() {
  const me = await requirePermission("admin");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const roles = ROLES.map((r) => ({ key: r, ...ROLE_INFO[r] }));
  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Each person gets one role. The role decides which tools, pages and figures they see." />
      <div className="space-y-6">
        <NewUserForm roles={roles} />
        <UsersTable meId={me.id} roles={roles} users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))} />

        <section className="card overflow-x-auto">
          <div className="card-h"><div className="card-t">What each role can do</div></div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((r) => <th key={r.key} className="text-center" title={r.description}>{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(([group, perms]) =>
                perms.map((p, i) => (
                  <tr key={p}>
                    <td>
                      {i === 0 && <div className="text-[11px] font-medium text-neutral-500 uppercase">{group}</div>}
                      {PERMISSIONS[p]}
                    </td>
                    {roles.map((r) => <td key={r.key} className="text-center">{permissionsOf(r.key).includes(p) ? "✓" : <span className="text-neutral-300">—</span>}</td>)}
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-neutral-500">
            Money in three layers: <b>prices</b> (what clients pay) are seen by whoever quotes them; <b>costs</b> (salaries, cost rates, the allocation split) and{" "}
            <b>company totals</b> (revenue, pipeline value, margins, cash) by owners and the CFO only.
          </p>
        </section>
      </div>
    </>
  );
}
