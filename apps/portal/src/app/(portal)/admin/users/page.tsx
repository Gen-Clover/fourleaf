import { PageHeader } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { NewUserForm, UsersTable } from "./UsersClient";

export default async function UsersPage() {
  const me = await requireRole("ADMIN");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader
        title="Users & Roles"
        subtitle="Admin: full control incl. rate card, formula and users · Editor: clients, projects, agreements, billing · Viewer: read-only"
      />
      <div className="space-y-6">
        <NewUserForm />
        <UsersTable
          meId={me.id}
          users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
        />
      </div>
    </>
  );
}
