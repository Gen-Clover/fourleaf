"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { type Result, fail } from "@/lib/result";

type Alloc = { key: string; percent: number };

/** Make a policy the live allocation: writes its % onto the allocation buckets (funds). Funds it doesn't list go to 0%. */
export async function activatePolicy(id: string): Promise<Result> {
  try {
    const user = await assertRole("ADMIN");
    const policy = await prisma.financialPolicy.findUniqueOrThrow({ where: { id } });
    const allocs = JSON.parse(policy.allocations) as Alloc[];
    const total = allocs.reduce((s, a) => s + a.percent, 0);
    if (Math.abs(total - 100) > 0.001) throw new Error(`Policy totals ${total}% — it must total 100%`);
    const buckets = await prisma.allocationBucket.findMany();
    const missing = allocs.filter((a) => a.percent > 0 && !buckets.some((b) => b.key === a.key));
    if (missing.length) throw new Error(`Policy uses funds that don't exist: ${missing.map((m) => m.key).join(", ")}`);
    await prisma.$transaction([
      ...buckets.map((b) => prisma.allocationBucket.update({ where: { id: b.id }, data: { percent: allocs.find((a) => a.key === b.key)?.percent ?? 0 } })),
      prisma.financialPolicy.updateMany({ data: { active: false } }),
      prisma.financialPolicy.update({ where: { id }, data: { active: true } }),
    ]);
    await audit(user, "UPDATE", "Policy", id, `Activated allocation policy "${policy.name}": ${allocs.map((a) => `${a.key} ${a.percent}%`).join(", ")}`);
    revalidatePath("/", "layout");
    return { ok: true, message: `"${policy.name}" is now the live allocation. New projects and new receipts use it; existing projects keep their snapshot.` };
  } catch (e) {
    return fail(e);
  }
}

const SaveAs = z.object({
  name: z.string().trim().min(1, "Name the policy"),
  stage: z.enum(["STARTUP", "GROWTH", "MATURE", "CUSTOM"]),
  description: z.string().trim().nullable(),
});

/** Save the current allocation buckets as a named policy (creates it, or overwrites one with the same name). */
export async function saveCurrentAsPolicy(input: unknown): Promise<Result> {
  try {
    const user = await assertRole("ADMIN");
    const d = SaveAs.parse(input);
    const buckets = await prisma.allocationBucket.findMany({ orderBy: { sortOrder: "asc" } });
    const allocations = JSON.stringify(buckets.map((b) => ({ key: b.key, percent: b.percent })));
    await prisma.financialPolicy.upsert({ where: { name: d.name }, update: { stage: d.stage, description: d.description, allocations }, create: { ...d, allocations } });
    await audit(user, "UPDATE", "Policy", null, `Saved current allocation as "${d.name}"`);
    revalidatePath("/admin/policies");
    return { ok: true, message: `Saved "${d.name}".` };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePolicy(id: string) {
  const user = await assertRole("ADMIN");
  const p = await prisma.financialPolicy.findUniqueOrThrow({ where: { id } });
  if (p.active) throw new Error("Activate another policy first");
  await prisma.financialPolicy.delete({ where: { id } });
  await audit(user, "DELETE", "Policy", id, `Deleted policy "${p.name}"`);
  revalidatePath("/admin/policies");
}
