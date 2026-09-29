// Runs after `prisma db push` (npm run push). Two things Prisma can't do on MongoDB:
//
// 1. Partial unique index. InvoiceLine.expenseId is optional and must be unique when set (an
//    expense is billed on at most one line). A plain unique index would allow only one null, so
//    this index covers only lines that point at an expense. Its own name keeps `db push` away.
//
// 2. SQL-style nulls. The app stores omitted optional fields as explicit nulls (src/sql-nulls.ts)
//    so `where: { x: null }` behaves like SQL. Documents written before a field existed don't
//    have it yet: backfill null into every optional field that is missing.
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// $type 2 = BSON string (the numeric form; Prisma misreads { $type: "string" } in raw results).
const PARTIAL_UNIQUE = [{ collection: "InvoiceLine", field: "expenseId", name: "InvoiceLine_expenseId_billed_once" }];

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
