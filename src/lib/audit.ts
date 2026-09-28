import "server-only";
import { prisma } from "./db";

export async function audit(
  user: { id: string; name: string },
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
) {
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action, entity, entityId, summary } });
}
