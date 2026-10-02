import "server-only";
import { can } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { AGREEMENT_TYPES } from "../../lib/agreements";

/** Choices for the agreement form: clients, their projects, and SOWs / MSAs to hang documents under. */
export async function agreementFormData(role: string) {
  const [clients, projects, parents] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, currency: true } }),
    prisma.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, clientId: true } }),
    prisma.agreement.findMany({ where: { type: { in: ["MSA", "SOW", "RESOURCE", "SUPPORT"] } }, select: { id: true, code: true, title: true, clientId: true, type: true } }),
  ]);
  // Delivery managers (projects.edit without agreements.edit) raise change requests and acceptance only.
  const allowedTypes = can(role, "agreements.edit") ? Object.keys(AGREEMENT_TYPES) : ["CR", "ACCEPTANCE"];
  return {
    clients: clients.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}`, currency: c.currency })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.code} ${p.name}`, clientId: p.clientId })),
    parents: parents.map((p) => ({ id: p.id, label: `${p.code} ${p.title}`, clientId: p.clientId, type: p.type })),
    allowedTypes,
    showMoney: can(role, "finance.view"),
  };
}

export const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
