"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import * as ids from "@genclover/ids";
import { assertRole } from "@genclover/auth";
import { audit } from "@genclover/db/audit";

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

/** Onboarding also sets the client code. It is locked afterwards (project IDs, Jira and folders use it). */
const NewClientSchema = ClientSchema.extend({
  code: z.string().transform(ids.normalizeClientCode).pipe(z.string().regex(ids.CLIENT_CODE_RE, `Client code: ${ids.CLIENT_CODE_HINT}`)),
});

export type FormState = { ok: boolean; message: string } | undefined;

export async function saveClient(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  let clientId = id;
  try {
    const user = await assertRole("EDITOR");
    if (id) {
      const data = ClientSchema.parse(Object.fromEntries(fd));
      await prisma.client.update({ where: { id }, data });
      await audit(user, "UPDATE", "Client", id, `Updated client ${data.name}`);
    } else {
      const data = NewClientSchema.parse(Object.fromEntries(fd));
      const taken = await prisma.client.findUnique({ where: { code: data.code }, select: { name: true } });
      if (taken) throw new Error(`Client code ${data.code} is already used by ${taken.name}`);
      const number = await ids.nextClientNumber(prisma);
      const c = await prisma.client.create({ data: { ...data, number } });
      clientId = c.id;
      await audit(user, "CREATE", "Client", c.id, `Created client ${number} (${data.code}) ${data.name}`);
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
