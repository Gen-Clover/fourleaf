"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const opt = z.string().trim().transform((s) => (s === "" ? null : s)).nullable().optional();

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Client / company name is required"),
  contactName: opt,
  email: z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.email("Invalid email").nullable()).optional(),
  phone: opt,
  country: opt,
  city: opt,
  timezone: opt,
  website: opt,
  billingAddress: opt,
  notes: opt,
});

export type FormState = { ok: boolean; message: string } | undefined;

export async function saveClient(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  let clientId = id;
  try {
    const user = await assertRole("EDITOR");
    const data = ClientSchema.parse(Object.fromEntries(fd));
    if (id) {
      await prisma.client.update({ where: { id }, data });
      await audit(user, "UPDATE", "Client", id, `Updated client ${data.name}`);
    } else {
      const c = await prisma.client.create({ data });
      clientId = c.id;
      await audit(user, "CREATE", "Client", c.id, `Created client ${data.name}`);
    }
    revalidatePath("/clients");
  } catch (e) {
    return { ok: false, message: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : String(e) };
  }
  if (!id) redirect(`/clients/${clientId}`);
  return { ok: true, message: "Client saved." };
}

export async function deleteClient(id: string) {
  const user = await assertRole("ADMIN");
  const c = await prisma.client.findUniqueOrThrow({ where: { id }, include: { _count: { select: { projects: true } } } });
  if (c._count.projects > 0) throw new Error("Client has projects — cannot delete");
  await prisma.client.delete({ where: { id } });
  await audit(user, "DELETE", "Client", id, `Deleted client ${c.name}`);
  revalidatePath("/clients");
  redirect("/clients");
}
