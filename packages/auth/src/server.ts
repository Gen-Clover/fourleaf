import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@genclover/db";
import { canAccessPath, normalizeRole, type Permission, can } from "./access";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./session";

export { can, canAny, canAccessPath, normalizeRole, permissionsOf, roleLabel, ROLE_INFO, ROLES, PERMISSIONS, type Permission, type Role } from "./access";

/** Set by the middleware on every request, so pages can check the path they are serving. */
export const PATH_HEADER = "x-gc-path";

export async function createSession(user: { id: string; name: string; email: string; role: string }) {
  const token = await signSession({ sub: user.id, name: user.name, email: user.email, role: normalizeRole(user.role) });
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

/**
 * Current user, re-validated against the DB so role changes / deactivation apply immediately.
 * Cached per request: the layout and the page share one lookup instead of querying twice.
 */
export const getCurrentUser = cache(async () => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, name: true, email: true, role: true, active: true } });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: normalizeRole(user.role) };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * The signed-in user, for pages. Also checks the page's path against the access table with the role from
 * the database (the middleware checks it too, but with the role in the login cookie, which can be older).
 */
export async function requireUser() {
  const user = await getCurrentUser();
  // A cookie for an account that no longer exists (or is disabled): clear it first, or /login (which trusts any
  // valid cookie) and this page would redirect to each other forever.
  if (!user) redirect((await cookies()).get(SESSION_COOKIE) ? "/logout" : "/login");
  const path = (await headers()).get(PATH_HEADER);
  if (path && !canAccessPath(user.role, path)) redirect("/?denied=1");
  return user;
}

/** For pages: redirects when the user lacks the permission. */
export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/?denied=1");
  return user;
}

/** For server actions and APIs: throws when the user lacks every one of the permissions. */
export async function assertPermission(...permissions: Permission[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (!permissions.some((p) => can(user.role, p))) throw new Error("Your role doesn't allow this");
  return user;
}
