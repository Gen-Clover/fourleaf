// Worker jobs for Governance: reminder emails for compliance due dates and agreement renewals. Needs SMTP (.env);
// without it nothing is sent and the pages still show what's due.
import { prisma } from "@genclover/db";
import { emailConfigured, sendSystemEmail } from "@genclover/lead-finder/lib/email";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Owners (and the item's owner) get one reminder per due date, when it enters its reminder window. */
export async function governanceReminders(now = new Date()) {
  if (!emailConfigured()) return { skipped: "email not set up" };
  const owners = await prisma.user.findMany({ where: { role: "OWNER", active: true }, select: { email: true } });
  let compliance = 0,
    renewals = 0;

  const items = await prisma.complianceItem.findMany({ where: { active: true } });
  for (const i of items) {
    const windowStart = new Date(i.dueDate.getTime() - i.remindDays * DAY);
    if (now < windowStart || (i.remindedAt && i.remindedAt >= windowStart)) continue;
    const owner = i.ownerId ? await prisma.user.findUnique({ where: { id: i.ownerId }, select: { email: true } }) : null;
    const to = [...new Set([owner?.email, ...owners.map((o) => o.email)].filter((x): x is string => !!x))];
    if (!to.length) continue;
    const late = i.dueDate < now;
    await sendSystemEmail(
      to.join(","),
      `${late ? "OVERDUE" : "Due"}: ${i.name} (${iso(i.dueDate)})`,
      `${i.name} is ${late ? "overdue" : "due"} on ${iso(i.dueDate)}.\n${i.professional ? `Professional: ${i.professional}\n` : ""}${i.notes ? `${i.notes}\n` : ""}\nMark it filed in the portal (Governance → Compliance calendar) with the acknowledgement and evidence.`,
    );
    await prisma.complianceItem.update({ where: { id: i.id }, data: { remindedAt: now } });
    compliance++;
  }

  const agreements = await prisma.agreement.findMany({ where: { status: { in: ["SIGNED", "ACTIVE"] }, expiresAt: { not: null } }, include: { client: { select: { name: true } } } });
  for (const a of agreements) {
    const windowStart = new Date(a.expiresAt!.getTime() - a.renewalNoticeDays * DAY);
    if (now < windowStart || (a.remindedAt && a.remindedAt >= windowStart)) continue;
    const to = owners.map((o) => o.email);
    if (!to.length) continue;
    await sendSystemEmail(
      to.join(","),
      `Renewal: ${a.code} ${a.title} (${a.client.name}) expires ${iso(a.expiresAt!)}`,
      `${a.code} "${a.title}" with ${a.client.name} expires on ${iso(a.expiresAt!)}.\nRenew it, or mark it expired / terminated in the portal (Clients & Agreements → Agreements).`,
    );
    await prisma.agreement.update({ where: { id: a.id }, data: { remindedAt: now } });
    renewals++;
  }
  return { compliance, renewals };
}
