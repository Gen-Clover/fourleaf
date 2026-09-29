// One-off copy of the old SQLite database (financial-control-system/prisma/dev.db) into MongoDB.
//
//   npm run migrate:sqlite -w @genclover/db -- <path-to-dev.db>
//
// - Keeps every id, so links, audit entries and project/invoice URLs stay the same.
// - Converts SQLite storage (ms timestamps, 0/1 booleans) using the Prisma model definitions.
// - Refuses to run if any target collection already has documents (so it can't double-import).
// - Prints source vs target row counts and fails if any differ.
import { DatabaseSync } from "node:sqlite";
import { Prisma, PrismaClient } from "@prisma/client";

const file = process.argv[2];
if (!file) {
  console.error("Usage: migrate-from-sqlite <path-to-dev.db>");
  process.exit(1);
}

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(file, { readOnly: true });

type Row = Record<string, unknown>;
const delegate = (model: string) =>
  (prisma as unknown as Record<string, { count(): Promise<number>; createMany(a: { data: Row[] }): Promise<unknown> }>)[
    model[0].toLowerCase() + model.slice(1)
  ];

function convert(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "DateTime":
      return new Date(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : (value as string | number));
    case "Boolean":
      return value === 1 || value === 1n || value === true || value === "1" || value === "true";
    case "Int":
      return Number(value);
    case "Float":
      return Number(value);
    default:
      return value;
  }
}

async function main() {
  const models = Prisma.dmmf.datamodel.models;

  for (const m of models) {
    const n = await delegate(m.name).count();
    if (n > 0) throw new Error(`Target collection ${m.name} already has ${n} documents. Aborting; nothing was written.`);
  }

  const report: { model: string; source: number; target: number }[] = [];
  for (const m of models) {
    const fields = m.fields.filter((f) => f.kind === "scalar");
    const rows = sqlite.prepare(`SELECT * FROM "${m.name}"`).all() as Row[];
    const data = rows.map((r) => Object.fromEntries(fields.map((f) => [f.name, convert(r[f.name], f.type)])));
    if (data.length) await delegate(m.name).createMany({ data });
    report.push({ model: m.name, source: rows.length, target: await delegate(m.name).count() });
  }

  console.table(report);
  const bad = report.filter((r) => r.source !== r.target);
  if (bad.length) throw new Error(`Row counts differ for: ${bad.map((b) => b.model).join(", ")}`);
  console.log("Migration complete: all row counts match.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
