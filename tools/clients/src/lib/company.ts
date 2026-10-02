import { prisma } from "@genclover/db";

/** Gen Clover's own state (Settings → companyState): same state as the client means CGST + SGST, else IGST. */
export async function companyState() {
  return (await prisma.setting.findUnique({ where: { key: "companyState" }, select: { value: true } }))?.value ?? "";
}
