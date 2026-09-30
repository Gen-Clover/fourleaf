// Runs after every `npm run db:push`. Safe to re-run: it only fills what is missing.
//
// 1. Project.kind on documents from before care plans existed.
// 2. Clients without a Client ID (GC-YYYY-NNNN, by the year they were created) or a client code
//    (a guess from the name, e.g. "Sample Client Inc." → "SAM"; logged so it can be checked).
// 3. Projects whose ID isn't <client code>-Pnn yet (e.g. the old GC-2026-0001) get one; the change
//    is written to the audit log.
// 4. Counters raised to the highest number already in use, so imported records never collide.
// 5. Settings: the old project prefix goes; invoices switch to GCI/… if none has been issued yet.
import { prisma } from "@genclover/db";
import {
  CLIENT_NUMBER_RE,
  INVOICE_NUMBER_RE,
  PROJECT_CODE_RE,
  clientCounter,
  invoiceCounter,
  nextClientNumber,
  nextProjectCode,
  projectCounter,
  raiseCounter,
  suggestClientCode,
} from "../src";

const SYSTEM = "System (ID backfill)";

type RawClient = { _id: string; name: string; number?: string | null; code?: string | null; createdAt?: { $date: string } };

const set = (collection: string, id: string, fields: Record<string, string>) =>
  prisma.$runCommandRaw({ update: collection, updates: [{ q: { _id: id }, u: { $set: fields } }] });

async function main() {
  // 1
  await prisma.$runCommandRaw({ update: "Project", updates: [{ q: { kind: { $exists: false } }, u: { $set: { kind: "PROJECT" } }, multi: true }] });

  // 2 (raw reads: Prisma refuses documents that lack a required field)
  const clients = ((await prisma.client.findRaw({})) as unknown as RawClient[]).sort((a, b) =>
    String(a.createdAt?.$date ?? "").localeCompare(String(b.createdAt?.$date ?? "")),
  );
  for (const c of clients) {
    const m = c.number?.match(CLIENT_NUMBER_RE);
    if (m) await raiseCounter(prisma, clientCounter(Number(m[1])), Number(m[2]));
  }
  const taken = new Set(clients.map((c) => c.code).filter((x): x is string => !!x));
  for (const c of clients) {
    const fields: Record<string, string> = {};
    if (!c.number) fields.number = await nextClientNumber(prisma, c.createdAt ? new Date(c.createdAt.$date) : new Date());
    if (!c.code) {
      fields.code = suggestClientCode(c.name, taken);
      taken.add(fields.code);
    }
    if (Object.keys(fields).length) {
      await set("Client", c._id, fields);
      console.log(`Client "${c.name}": ${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
  }

  // 3 + 4
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, code: true, client: { select: { id: true, code: true } } } });
  const fits = (p: (typeof projects)[number]) => p.code.match(PROJECT_CODE_RE)?.[1] === p.client.code;
  for (const p of projects.filter(fits)) await raiseCounter(prisma, projectCounter(p.client.id), Number(p.code.match(PROJECT_CODE_RE)![2]));
  for (const p of projects.filter((p) => !fits(p))) {
    const code = await nextProjectCode(prisma, p.client);
    await prisma.project.update({ where: { id: p.id }, data: { code }, select: { id: true } });
    await prisma.auditLog.create({ data: { userName: SYSTEM, action: "UPDATE", entity: "Project", entityId: p.id, summary: `Project ID ${p.code} → ${code}` } });
    console.log(`Project ${p.code} → ${code}`);
  }

  for (const { number } of await prisma.invoice.findMany({ select: { number: true } })) {
    const m = number.match(INVOICE_NUMBER_RE);
    if (m) await raiseCounter(prisma, invoiceCounter(m[1], m[2]), Number(m[3]));
  }

  // 5
  await prisma.setting.deleteMany({ where: { key: "projectCodePrefix" } });
  const issued = await prisma.invoice.count({ where: { NOT: { number: { startsWith: "DRAFT-" } } } });
  if (issued === 0) {
    const { count } = await prisma.setting.updateMany({ where: { key: "invoicePrefix", value: "GC" }, data: { value: "GCI" } });
    if (count) console.log("Invoice prefix GC → GCI (no invoice issued yet)");
  }
  await prisma.setting.updateMany({
    where: { key: "invoicePrefix" },
    data: { description: "Invoices are numbered PREFIX/26-27/0001: one consecutive series per financial year (GST). Change it only before a year's first invoice." },
  });

  console.log(`IDs checked: ${clients.length} client(s), ${projects.length} project(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
