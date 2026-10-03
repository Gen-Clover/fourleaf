import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@genclover/auth";
import { audit } from "@genclover/db/audit";

/**
 * A dead session: the cookie is still valid but its account was deleted or disabled. Pages send the browser here
 * (requireUser) to drop the cookie, otherwise the login page and the pages redirect to each other forever. A live
 * session is left alone, so a link here can't sign anyone out.
 */
export async function GET(req: Request) {
  if (await getCurrentUser()) return NextResponse.redirect(new URL("/", req.url));
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (user) await audit(user, "LOGOUT", "User", user.id, `${user.email} signed out`);
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
