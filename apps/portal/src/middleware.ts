import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath } from "@genclover/auth/access";
import { SESSION_COOKIE, verifySession } from "@genclover/auth/session";

// Must match PATH_HEADER in @genclover/auth (server.ts can't be imported here: it is server-only).
const PATH_HEADER = "x-gc-path";

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";

  if (!session && !isLogin) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session && isLogin) return NextResponse.redirect(new URL("/", req.url));
  // Pages and APIs outside the role's access (packages/auth/src/access.ts). Pages check again with the
  // role from the database, which is newer than the one in the cookie after a role change.
  if (session && !canAccessPath(session.role, pathname)) {
    if (pathname.startsWith("/api/")) return new NextResponse("Forbidden", { status: 403 });
    return NextResponse.redirect(new URL("/?denied=1", req.url));
  }
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Node.js runtime: reads the repo-root .env (loaded in next.config.ts) like the rest of the server.
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
