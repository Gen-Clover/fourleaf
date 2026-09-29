"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { assertRole } from "@genclover/auth";
import { audit } from "@genclover/db/audit";

export type ActionResult = { ok: boolean; message: string };

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

// ---------- Rate card ----------

const RoleRow = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Role name is required"),
  family: z.string().trim().min(1, "Family is required"),
  marketMin: z.number().nonnegative(),
  marketMax: z.number().nonnegative(),
  usSalary: z.number().nonnegative(),
  standardRate: z.number().positive("Standard rate must be > 0"),
  floorRate: z.number().nonnegative().nullable(),
  ctcMinL: z.number().nonnegative().nullable(),
  ctcMaxL: z.number().nonnegative().nullable(),
  notes: z.string().nullable().optional(),
  active: z.boolean(),
});

export async function saveRateCard(rows: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("ADMIN");
    const data = z.array(RoleRow).parse(rows);
    const names = data.map((r) => r.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new Error("Role names must be unique");
    for (const r of data) {
      if (r.marketMax < r.marketMin) throw new Error(`${r.name}: market max is below market min`);
      if (r.floorRate != null && r.floorRate > r.standardRate) throw new Error(`${r.name}: floor is above standard rate`);
    }

    const existing = await prisma.roleRate.findMany({ include: { _count: { select: { resources: true } } } });
    const keepIds = new Set(data.filter((r) => r.id).map((r) => r.id));
    let changed = 0;

    await prisma.$transaction(async (tx) => {
      // Temporarily rename to avoid unique-name clashes when rows swap names
      for (const [i, r] of data.entries()) {
        const { id, ...fields } = r;
        const payload = { ...fields, notes: fields.notes ?? null, sortOrder: i };
        if (id) {
          const prev = existing.find((e) => e.id === id);
          if (prev && (prev.standardRate !== r.standardRate || prev.floorRate !== r.floorRate || prev.name !== r.name || prev.active !== r.active || prev.marketMin !== r.marketMin || prev.marketMax !== r.marketMax || prev.usSalary !== r.usSalary || prev.ctcMinL !== r.ctcMinL || prev.ctcMaxL !== r.ctcMaxL || prev.family !== r.family))
            changed++;
          await tx.roleRate.update({ where: { id }, data: { ...payload, name: `__tmp__${id}` } });
        }
      }
      for (const [i, r] of data.entries()) {
        const { id, ...fields } = r;
        const payload = { ...fields, notes: fields.notes ?? null, sortOrder: i };
        if (id) await tx.roleRate.update({ where: { id }, data: payload });
        else {
          await tx.roleRate.create({ data: payload });
          changed++;
        }
      }
      for (const e of existing) {
        if (keepIds.has(e.id)) continue;
        // Roles used in projects are deactivated instead of deleted (history stays intact)
        if (e._count.resources > 0) await tx.roleRate.update({ where: { id: e.id }, data: { active: false, name: e.name } });
        else await tx.roleRate.delete({ where: { id: e.id } });
        changed++;
      }
    });

    await audit(user, "UPDATE", "RateCard", null, `Rate card saved (${data.length} roles, ${changed} changed/added/removed)`);
    revalidatePath("/", "layout");
    return { ok: true, message: `Rate card saved. ${changed} role(s) changed.` };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Formula settings ----------

export async function saveSettings(values: Record<string, string>): Promise<ActionResult> {
  try {
    const user = await assertRole("ADMIN");
    const rows = await prisma.setting.findMany();
    const changes: string[] = [];
    for (const row of rows) {
      if (!(row.key in values)) continue;
      const v = String(values[row.key]).trim();
      if (row.type === "number" && (v === "" || Number.isNaN(Number(v)))) throw new Error(`${row.label} must be a number`);
      if (v !== row.value) {
        await prisma.setting.update({ where: { key: row.key }, data: { value: v } });
        changes.push(`${row.label}: ${row.value} → ${v}`);
      }
    }
    if (changes.length) await audit(user, "UPDATE", "Settings", null, changes.join("; "));
    revalidatePath("/", "layout");
    return { ok: true, message: changes.length ? `Saved ${changes.length} change(s).` : "No changes." };
  } catch (e) {
    return fail(e);
  }
}

const BucketRow = z.object({
  id: z.string().optional(),
  key: z.string().trim().min(1).regex(/^[a-zA-Z0-9_]+$/, "Key: letters, numbers, underscore"),
  name: z.string().trim().min(1),
  percent: z.number().min(0).max(100),
  category: z.enum(["DELIVERY", "GROWTH", "CORPORATE"]),
  isProfit: z.boolean(),
  description: z.string().nullable().optional(),
});

export async function saveBuckets(rows: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("ADMIN");
    const data = z.array(BucketRow).parse(rows);
    const total = data.reduce((s, b) => s + b.percent, 0);
    if (Math.abs(total - 100) > 0.001) throw new Error(`Allocation must total 100% (currently ${total}%)`);
    if (!data.some((b) => b.category === "DELIVERY")) throw new Error("At least one DELIVERY bucket is required");
    const keys = data.map((b) => b.key);
    if (new Set(keys).size !== keys.length) throw new Error("Bucket keys must be unique");

    await prisma.$transaction(async (tx) => {
      await tx.allocationBucket.deleteMany({ where: { key: { notIn: keys } } });
      for (const [i, b] of data.entries()) {
        const { id: _id, ...fields } = b;
        void _id;
        const payload = { ...fields, description: fields.description ?? null, sortOrder: i };
        await tx.allocationBucket.upsert({ where: { key: b.key }, update: payload, create: payload });
      }
    });
    await audit(user, "UPDATE", "Allocation", null, data.map((b) => `${b.name} ${b.percent}%`).join(", "));
    revalidatePath("/", "layout");
    return { ok: true, message: "Allocation model saved. New projects will use it; existing projects keep their snapshot." };
  } catch (e) {
    return fail(e);
  }
}
