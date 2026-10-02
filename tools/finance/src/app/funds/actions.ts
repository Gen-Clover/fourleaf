"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertPermission } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { utcDay } from "../../lib/finance";
import { type Result, fail } from "@genclover/ui/result";

const Movement = z.object({
  type: z.enum(["OPENING", "TRANSFER", "ADJUSTMENT"]),
  fromKey: z.string().optional(),
  toKey: z.string().min(1, "Pick a fund"),
  amountInr: z.number().refine((n) => n !== 0, "Amount can't be zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date required"),
  note: z.string().trim().min(1, "Add a note — why is money moving?"),
});

/** Opening balance, transfer between funds (e.g. emergency withdrawal from Survival), or a manual adjustment. Admin only. */
export async function fundMovement(input: unknown): Promise<Result> {
  try {
    const user = await assertPermission("finance.edit");
    const d = Movement.parse(input);
    const date = utcDay(d.date);
    const base = { date, note: d.note, createdBy: user.name };
    if (d.type === "TRANSFER") {
      if (!d.fromKey || d.fromKey === d.toKey) throw new Error("Pick two different funds");
      if (d.amountInr < 0) throw new Error("Transfer amount must be positive");
      const transferId = crypto.randomUUID();
      await prisma.fundEntry.createMany({
        data: [
          { ...base, type: "TRANSFER", transferId, fundKey: d.fromKey, amountInr: -d.amountInr },
          { ...base, type: "TRANSFER", transferId, fundKey: d.toKey, amountInr: d.amountInr },
        ],
      });
      await audit(user, "CREATE", "Fund", null, `Transfer ₹${d.amountInr} ${d.fromKey} → ${d.toKey}: ${d.note}`);
    } else {
      await prisma.fundEntry.create({ data: { ...base, type: d.type, fundKey: d.toKey, amountInr: d.amountInr } });
      await audit(user, "CREATE", "Fund", null, `${d.type} ₹${d.amountInr} to ${d.toKey}: ${d.note}`);
    }
    revalidatePath("/funds");
    revalidatePath("/cfo");
    return { ok: true, message: "Recorded." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFundEntry(id: string) {
  const user = await assertPermission("finance.edit");
  const e = await prisma.fundEntry.findUniqueOrThrow({ where: { id } });
  if (e.type === "ALLOCATION") throw new Error("Allocations come from payments — delete the payment instead");
  await prisma.fundEntry.deleteMany({ where: e.transferId ? { transferId: e.transferId } : { id } });
  await audit(user, "DELETE", "Fund", null, `${e.type} ₹${e.amountInr} (${e.fundKey}) removed: ${e.note ?? ""}`);
  revalidatePath("/funds");
  revalidatePath("/cfo");
}
