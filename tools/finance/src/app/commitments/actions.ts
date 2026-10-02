"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertPermission } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { utcDay } from "../../lib/finance";
import { type Result, fail, optStr } from "@genclover/ui/result";

const CommitmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(["CONTRACTOR", "TAX", "SUBSCRIPTION", "RENT", "LOAN", "OTHER"]),
  fundKey: z.string().min(1, "Pick the fund that pays it"),
  amountInr: z.coerce.number().positive("Amount must be positive"),
  frequency: z.enum(["ONE_OFF", "MONTHLY", "QUARTERLY", "YEARLY"]),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Next due date required"),
  endDate: optStr,
  notes: optStr,
});

export async function saveCommitment(id: string | null, _: Result, fd: FormData): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const d = CommitmentSchema.parse(Object.fromEntries(fd));
    const data = { ...d, nextDueDate: utcDay(d.nextDueDate), endDate: d.endDate ? utcDay(d.endDate) : null, essential: fd.get("essential") === "on", active: id ? fd.get("active") === "on" : true };
    if (id) await prisma.commitment.update({ where: { id }, data });
    else await prisma.commitment.create({ data });
    await audit(user, id ? "UPDATE" : "CREATE", "Commitment", id, `${d.name}: ₹${d.amountInr} ${d.frequency} from ${d.fundKey}`);
    revalidatePath("/commitments");
    revalidatePath("/cfo");
    return { ok: true, message: id ? "Commitment updated." : "Commitment added." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCommitment(id: string) {
  const user = await assertPermission("finance.edit");
  const c = await prisma.commitment.delete({ where: { id } });
  await audit(user, "DELETE", "Commitment", id, `${c.name} deleted`);
  revalidatePath("/commitments");
  revalidatePath("/cfo");
}
