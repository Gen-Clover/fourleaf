import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (user) await audit(user, "LOGOUT", "User", user.id, `${user.email} signed out`);
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
