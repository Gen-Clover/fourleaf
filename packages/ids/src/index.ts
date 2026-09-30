// Readable IDs that travel between tools. Tables always link by the internal cuid; these codes are
// for people and the outside world (documents, Jira, folders, WhatsApp, email). Once handed out
// they never change and are never reused.
//
//   Lead          GL-2026-09-000001   month first found (IST), counter restarts monthly
//   Client ID     GC-2026-0001        year registered (IST), counter restarts yearly
//   Client code   ABR                 chosen at onboarding, then locked
//   Project       ABR-P01             per client; care plans are projects too
//   Invoice       GCI/26-27/0001      one consecutive series per financial year (GST)
//
// Numbers come from the Sequence table, incremented in the database, never by counting rows.
// Each padded width is a minimum: 9999 is followed by 10000, not an error.
import type { Tx } from "@genclover/db";

/** Any Prisma client: the shared one or a transaction's. */
type Db = Pick<Tx, "sequence">;

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Year and month in India time (IST = UTC+5:30), whatever the server's time zone. */
function ist(d: Date) {
  const t = new Date(d.getTime() + 330 * 60_000);
  return { year: t.getUTCFullYear(), month: pad(t.getUTCMonth() + 1, 2) };
}

/** Take the next number of a named counter (1, 2, 3 …). */
export async function nextNumber(db: Db, key: string): Promise<number> {
  const s = await db.sequence.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return s.value;
}

/** Raise a counter to at least `value` (used when importing records that already have numbers). */
export async function raiseCounter(db: Db, key: string, value: number) {
  const s = await db.sequence.findUnique({ where: { key } });
  if (!s) await db.sequence.create({ data: { key, value } });
  else if (s.value < value) await db.sequence.update({ where: { key }, data: { value } });
}

export const leadCounter = (foundAt: Date) => `lead:${ist(foundAt).year}-${ist(foundAt).month}`;
export async function nextLeadId(db: Db, foundAt = new Date()) {
  const { year, month } = ist(foundAt);
  return `GL-${year}-${month}-${pad(await nextNumber(db, leadCounter(foundAt)), 6)}`;
}

export const CLIENT_NUMBER_RE = /^GC-(\d{4})-(\d{4,})$/;
export const clientCounter = (year: number) => `client:${year}`;
export async function nextClientNumber(db: Db, registeredAt = new Date()) {
  const { year } = ist(registeredAt);
  return `GC-${year}-${pad(await nextNumber(db, clientCounter(year)), 4)}`;
}

/** Client code rules match Jira project keys: 2–10 characters, A–Z and 0–9, starting with a letter. */
export const CLIENT_CODE_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export const CLIENT_CODE_HINT = "2–10 letters or digits, starting with a letter (e.g. ABR)";
export const normalizeClientCode = (s: string) => s.trim().toUpperCase();

/** A first guess at a code from the client's name: "Abrams Books" → "ABR". Never reuses a taken one. */
export function suggestClientCode(name: string, taken: Set<string>) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^[0-9]+/, "");
  const base = (letters.slice(0, 3) || "CLI").padEnd(2, "X");
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

export const PROJECT_CODE_RE = /^([A-Z][A-Z0-9]{1,9})-P(\d{2,})$/;
export const projectCounter = (clientId: string) => `project:${clientId}`;
export async function nextProjectCode(db: Db, client: { id: string; code: string }) {
  return `${client.code}-P${pad(await nextNumber(db, projectCounter(client.id)), 2)}`;
}

export const INVOICE_NUMBER_RE = /^(.+)\/(\d{2}-\d{2})\/(\d{4,})$/;
export const invoiceCounter = (prefix: string, fy: string) => `invoice:${prefix}/${fy}`;
/** `fy` is the short financial year, e.g. "26-27". */
export async function nextInvoiceNumber(db: Db, prefix: string, fy: string) {
  return `${prefix}/${fy}/${pad(await nextNumber(db, invoiceCounter(prefix, fy)), 4)}`;
}
