import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, type Role } from "./session";

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

export function hasRole(userRole: string, required: Role) {
  return (RANK[userRole as Role] ?? 0) >= RANK[required];
}

export async function createSession(user: { id: string; name: string; email: string; role: string }) {
  const token = await signSession({ sub: user.id, name: user.name, email: user.email, role: user.role as Role });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Current user, re-validated against the DB so role changes / deactivation apply immediately. */
export async function getCurrentUser() {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects when the role is insufficient. */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (!hasRole(user.role, role)) redirect("/?denied=1");
  return user;
}

/** For server actions: throws when the role is insufficient. */
export async function assertRole(role: Role) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (!hasRole(user.role, role)) throw new Error(`Requires ${role} role`);
  return user;
}
