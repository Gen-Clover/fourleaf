"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertRole } from "@genclover/auth";
import { audit } from "@genclover/db/audit";

export type ActionResult = { ok: boolean; message: string };

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

// ---------- Users ----------

const NewUser = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Valid email required").transform((s) => s.toLowerCase()),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function createUser(_: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertRole("ADMIN");
    const d = NewUser.parse(Object.fromEntries(fd));
    if (await prisma.user.findUnique({ where: { email: d.email } })) throw new Error("A user with this email already exists");
    const u = await prisma.user.create({ data: { name: d.name, email: d.email, role: d.role, passwordHash: await bcrypt.hash(d.password, 10) } });
    await audit(user, "CREATE", "User", u.id, `Created ${d.email} as ${d.role}`);
    revalidatePath("/admin/users");
    return { ok: true, message: `User ${d.email} created.` };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error(e.issues[0].message) : e);
  }
}

export async function updateUser(id: string, patch: { role?: string; active?: boolean; name?: string }): Promise<ActionResult> {
  try {
    const user = await assertRole("ADMIN");
    if (id === user.id && (patch.role && patch.role !== "ADMIN" || patch.active === false)) {
      throw new Error("You cannot demote or deactivate your own account");
    }
    if (patch.role && !["ADMIN", "EDITOR", "VIEWER"].includes(patch.role)) throw new Error("Invalid role");
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (target.role === "ADMIN" && (patch.role && patch.role !== "ADMIN" || patch.active === false)) {
      const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
      if (admins <= 1) throw new Error("At least one active admin is required");
    }
    await prisma.user.update({ where: { id }, data: patch });
    await audit(user, "UPDATE", "User", id, `${target.email}: ${JSON.stringify(patch)}`);
    revalidatePath("/admin/users");
    return { ok: true, message: "User updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPassword(id: string, password: string): Promise<ActionResult> {
  try {
    const user = await assertRole("ADMIN");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    const target = await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await audit(user, "UPDATE", "User", id, `Password reset for ${target.email}`);
    return { ok: true, message: `Password reset for ${target.email}.` };
  } catch (e) {
    return fail(e);
  }
}
