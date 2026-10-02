import "server-only";
import { prisma } from "@genclover/db";

export async function issueFormData() {
  const [projects, users] = await Promise.all([
    prisma.project.findMany({ where: { status: { notIn: ["CANCELLED"] } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { projects: projects.map((p) => ({ id: p.id, label: `${p.code} ${p.name}` })), users };
}
