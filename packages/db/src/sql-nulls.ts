import { Prisma } from "@prisma/client";

/**
 * SQL-style nulls on MongoDB.
 *
 * On SQL, an optional column you don't set is NULL, so `where: { paidOn: null }` finds it.
 * Prisma on MongoDB instead leaves the field out of the document, and `{ paidOn: null }` then
 * only matches documents where the field is present and null. The portal's logic (unpaid bills,
 * unbilled months, open items…) was written for SQL, so every write here stores omitted optional
 * fields as explicit nulls, including nested creates. Documents then behave exactly like rows.
 */

type Field = Prisma.DMMF.Field;
type Data = Record<string, unknown>;

const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));

const meta = new Map(
  [...models.values()].map((m) => {
    const optional = m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !f.isRequired && !f.isList && !f.isId && !f.hasDefaultValue);
    const relations = new Map(m.fields.filter((f) => f.kind === "object").map((f) => [f.name, f]));
    // Foreign-key scalar → its relation field (checked vs unchecked input must not be mixed).
    const fkToRelation = new Map<string, string>();
    for (const r of relations.values()) for (const fk of r.relationFromFields ?? []) fkToRelation.set(fk, r.name);
    return [m.name, { optional, relations, fkToRelation }];
  }),
);

/** FK fields on `child` that point back to the parent through `relation` (implied by a nested create). */
function backFks(parent: string, relation: Field): Set<string> {
  const child = models.get(relation.type);
  const back = child?.fields.find((f) => f.kind === "object" && f.relationName === relation.relationName && !(f.type === parent && f.name === relation.name));
  return new Set(back?.relationFromFields ?? []);
}

function fillCreate(model: string, data: unknown, skip: Set<string> = new Set()): unknown {
  if (Array.isArray(data)) return data.map((d) => fillCreate(model, d, skip));
  if (!data || typeof data !== "object") return data;
  const m = meta.get(model);
  if (!m) return data;
  const out: Data = { ...(data as Data) };
  for (const f of m.optional) {
    if (f.name in out || skip.has(f.name)) continue;
    const rel = m.fkToRelation.get(f.name);
    if (rel && rel in out) continue;
    out[f.name] = null;
  }
  return walkRelations(model, out);
}

function fillUpdate(model: string, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  return walkRelations(model, { ...(data as Data) });
}

/** Nested writes: fill creates inside relation fields (create, createMany, connectOrCreate, upsert, update). */
function walkRelations(model: string, out: Data): Data {
  const m = meta.get(model)!;
  for (const [name, rel] of m.relations) {
    const op = out[name];
    if (!op || typeof op !== "object") continue;
    const skip = backFks(model, rel);
    const o = { ...(op as Data) };
    if ("create" in o) o.create = fillCreate(rel.type, o.create, skip);
    if (o.createMany && typeof o.createMany === "object") {
      const cm = o.createMany as Data;
      o.createMany = { ...cm, data: fillCreate(rel.type, cm.data, skip) };
    }
    if ("connectOrCreate" in o) {
      const list = Array.isArray(o.connectOrCreate) ? o.connectOrCreate : [o.connectOrCreate];
      const mapped = (list as Data[]).map((c) => ({ ...c, create: fillCreate(rel.type, c.create, skip) }));
      o.connectOrCreate = Array.isArray(o.connectOrCreate) ? mapped : mapped[0];
    }
    if ("upsert" in o) {
      const list = Array.isArray(o.upsert) ? o.upsert : [o.upsert];
      const mapped = (list as Data[]).map((u) => ({ ...u, create: fillCreate(rel.type, u.create, skip), update: fillUpdate(rel.type, u.update) }));
      o.upsert = Array.isArray(o.upsert) ? mapped : mapped[0];
    }
    out[name] = o;
  }
  return out;
}

export const sqlNulls = Prisma.defineExtension({
  name: "sql-nulls",
  query: {
    $allModels: {
      create({ model, args, query }) {
        return query({ ...args, data: fillCreate(model, args.data) } as typeof args);
      },
      createMany({ model, args, query }) {
        return query({ ...args, data: fillCreate(model, args.data) } as typeof args);
      },
      upsert({ model, args, query }) {
        return query({ ...args, create: fillCreate(model, args.create), update: fillUpdate(model, args.update) } as typeof args);
      },
      update({ model, args, query }) {
        return query({ ...args, data: fillUpdate(model, args.data) } as typeof args);
      },
    },
  },
});
