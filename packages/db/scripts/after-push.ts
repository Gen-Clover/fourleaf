// Runs after `prisma db push` (npm run push). Three things Prisma can't do on MongoDB (3: see below):
//
// 1. Partial unique indexes. InvoiceLine.expenseId (an expense is billed on at most one line) and
//    Lead.placeId (one lead per Google place) are optional and must be unique when set. A plain
//    unique index would allow only one null, so each index covers only documents that have a
//    value. Their own names keep `db push` away.
//
// 2. SQL-style nulls. The app stores omitted optional fields as explicit nulls (src/sql-nulls.ts)
//    so `where: { x: null }` behaves like SQL. Documents written before a field existed don't
//    have it yet: backfill null into every optional field that is missing.
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// $type 2 = BSON string (the numeric form; Prisma misreads { $type: "string" } in raw results).
const PARTIAL_UNIQUE = [
  { collection: "InvoiceLine", field: "expenseId", name: "InvoiceLine_expenseId_billed_once" },
  // One lead per Google place; leads added by hand have no place ID.
  { collection: "Lead", field: "placeId", name: "Lead_placeId_once" },
  // GCE-0001 / GCT-0001, handed out by packages/ids (people added before IDs get one in its backfill).
  { collection: "Person", field: "code", name: "Person_code_once" },
];

async function main() {
  for (const { collection, field, name } of PARTIAL_UNIQUE) {
    // createIndexes is a no-op when the same index already exists, so this is safe to re-run.
    const res = (await prisma.$runCommandRaw({
      createIndexes: collection,
      indexes: [{ key: { [field]: 1 }, name, unique: true, partialFilterExpression: { [field]: { $type: 2 } } }],
    })) as { numIndexesBefore?: number; numIndexesAfter?: number };
    const created = (res.numIndexesAfter ?? 0) > (res.numIndexesBefore ?? 0);
    console.log(`${collection}.${name}: ${created ? "created" : "already present"} (unique ${field} when set)`);
  }

  let filled = 0;
  for (const m of Prisma.dmmf.datamodel.models) {
    const optional = m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !f.isRequired && !f.isList && !f.isId && !f.hasDefaultValue);
    if (!optional.length) continue;
    const res = (await prisma.$runCommandRaw({
      update: m.dbName ?? m.name,
      updates: optional.map((f) => ({ q: { [f.dbName ?? f.name]: { $exists: false } }, u: { $set: { [f.dbName ?? f.name]: null } }, multi: true })),
    })) as { nModified?: number };
    filled += res.nModified ?? 0;
  }
  console.log(`Optional fields backfilled with null: ${filled} document update(s)`);

  // 2b. Pay model for people added before it existed (must run before the defaults below, which would
  //     otherwise make everyone SALARY): hourly rate → HOURLY; monthly contractor → RETAINER; else SALARY.
  const payModels = (await prisma.$runCommandRaw({
    update: "Person",
    updates: [
      { q: { payModel: { $exists: false }, costBasis: "HOURLY" }, u: { $set: { payModel: "HOURLY" } }, multi: true },
      { q: { payModel: { $exists: false }, type: "CONTRACTOR" }, u: { $set: { payModel: "RETAINER" } }, multi: true },
      { q: { payModel: { $exists: false } }, u: { $set: { payModel: "SALARY" } }, multi: true },
    ],
  })) as { nModified?: number };
  console.log(`People pay model set: ${payModels.nModified ?? 0}`);

  // 3. Defaults. Prisma fills a missing field's default when reading, but a filter such as
  //    `{ contactCount: 0 }` can't match a document that lacks the field. Write plain defaults
  //    (numbers, booleans, strings, empty lists) into documents created before the field existed.
  let defaulted = 0;
  for (const m of Prisma.dmmf.datamodel.models) {
    const withDefault = m.fields.flatMap((f) => {
      if (f.isId || f.kind === "object") return [];
      if (f.isList && f.kind === "scalar") return [{ name: f.dbName ?? f.name, value: [] as unknown }];
      const d = f.default as unknown;
      return f.hasDefaultValue && (typeof d === "number" || typeof d === "boolean" || typeof d === "string") ? [{ name: f.dbName ?? f.name, value: d }] : [];
    });
    if (!withDefault.length) continue;
    const res = (await prisma.$runCommandRaw({
      update: m.dbName ?? m.name,
      updates: withDefault.map((f) => ({ q: { [f.name]: { $exists: false } }, u: { $set: { [f.name]: f.value as Prisma.InputJsonValue } }, multi: true })),
    })) as { nModified?: number };
    defaulted += res.nModified ?? 0;
  }
  console.log(`Fields backfilled with their defaults: ${defaulted} document update(s)`);

  // 4. Stage dates for leads created before stages were timed: the last message (or last update) is the
  //    best guess for when the lead reached its stage, and for when a won lead was won.
  const guess = { $ifNull: ["$lastContactAt", { $ifNull: ["$updatedAt", "$createdAt"] }] };
  const staged = (await prisma.$runCommandRaw({
    update: "Lead",
    updates: [
      { q: { stageChangedAt: null }, u: [{ $set: { stageChangedAt: guess } }], multi: true },
      { q: { stage: "WON", wonAt: null }, u: [{ $set: { wonAt: "$stageChangedAt" } }], multi: true },
    ],
  } as unknown as Prisma.InputJsonObject)) as { nModified?: number };
  console.log(`Lead stage dates backfilled: ${staged.nModified ?? 0} document update(s)`);

  // 5. Roles. Accounts from before the named roles (packages/auth/src/access.ts): ADMIN became Owner,
  //    EDITOR Sales and VIEWER Team member. Review them on Users & Roles afterwards.
  const renamed = await Promise.all(
    Object.entries({ ADMIN: "OWNER", EDITOR: "SALES", VIEWER: "TEAM" }).map(([from, to]) => prisma.user.updateMany({ where: { role: from }, data: { role: to } })),
  );
  console.log(`User roles renamed: ${renamed.reduce((n, r) => n + r.count, 0)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
