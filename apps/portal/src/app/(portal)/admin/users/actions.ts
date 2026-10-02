"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertPermission, can, ROLES } from "@genclover/auth";
import { audit } from "@genclover/db/audit";

export type ActionResult = { ok: boolean; message: string };

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

// ---------- Users ----------

const NewUser = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Valid email required").transform((s) => s.toLowerCase()),
  role: z.enum(ROLES),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function createUser(_: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertPermission("users.manage");
    const d = NewUser.parse(Object.fromEntries(fd));
    if (d.role === "OWNER" && !can(user.role, "admin")) throw new Error("Only an owner can create another owner");
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
    const user = await assertPermission("users.manage");
    // Nobody changes their own role (so an Admin can't make themselves Owner), and only owners touch owner accounts.
    if (id === user.id && ((patch.role && patch.role !== user.role) || patch.active === false)) {
      throw new Error("You cannot change your own role or deactivate your own account");
    }
    if (patch.role && !(ROLES as readonly string[]).includes(patch.role)) throw new Error("Invalid role");
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (!can(user.role, "admin") && (target.role === "OWNER" || patch.role === "OWNER")) throw new Error("Only an owner can give, take away or change an owner account");
    if (target.role === "OWNER" && ((patch.role && patch.role !== "OWNER") || patch.active === false)) {
      const owners = await prisma.user.count({ where: { role: "OWNER", active: true } });
      if (owners <= 1) throw new Error("At least one active owner is required");
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
    const user = await assertPermission("users.manage");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    const owner = await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
    if (owner.role === "OWNER" && !can(user.role, "admin")) throw new Error("Only an owner can reset an owner's password");
    const target = await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await audit(user, "UPDATE", "User", id, `Password reset for ${target.email}`);
    return { ok: true, message: `Password reset for ${target.email}.` };
  } catch (e) {
    return fail(e);
  }
}
