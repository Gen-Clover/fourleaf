// Calls, meetings and visits with leads. For now they live in the portal: the person assigned sees them
// on Today and on Tasks, gets an email when assigned and 30 minutes before (if email is set up), and can
// add them to their own calendar with one click (Google Calendar link, or an .ics file for Outlook/Apple).
// Two-way calendar sync (Google / Microsoft) can replace the one-click add later.
import { prisma } from "@genclover/db";
import { sendSystemEmail } from "./email";
import { TASK_TYPES } from "./services";

type TaskLike = { id: string; type: string; dueAt: Date; durationMin: number; link: string | null; agenda: string | null };
type LeadLike = { name: string; code: string; phone: string | null; intlPhone: string | null; address: string | null };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const title = (t: TaskLike, l: LeadLike) => `${TASK_TYPES[t.type] ?? t.type}: ${l.name}`;
function details(t: TaskLike, l: LeadLike, portalUrl?: string) {
  return [
    t.agenda,
    l.intlPhone ?? l.phone ? `Phone: ${l.intlPhone ?? l.phone}` : null,
    t.link ? `Link: ${t.link}` : null,
    `Lead: ${l.code}${portalUrl ? ` (${portalUrl})` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** "Add to Google Calendar" link (no sign-in to the portal's Google account needed). */
export function googleCalendarLink(t: TaskLike, l: LeadLike) {
  const end = new Date(t.dueAt.getTime() + t.durationMin * 60_000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: title(t, l), dates: `${stamp(t.dueAt)}/${stamp(end)}`, details: details(t, l) });
  if (t.type === "VISIT" && l.address) q.set("location", l.address);
  else if (t.link) q.set("location", t.link);
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** An .ics calendar file (Outlook, Apple Calendar, Google). */
export function icsFile(t: TaskLike, l: LeadLike) {
  const end = new Date(t.dueAt.getTime() + t.durationMin * 60_000);
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gen Clover//Lead Finder//EN",
    "BEGIN:VEVENT",
    `UID:${t.id}@genclover-portal`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(t.dueAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title(t, l))}`,
    `DESCRIPTION:${esc(details(t, l))}`,
    t.type === "VISIT" && l.address ? `LOCATION:${esc(l.address)}` : t.link ? `LOCATION:${esc(t.link)}` : null,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

const when = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

/** Email the assignee that a task is theirs (with a calendar file). Quietly skipped if email isn't set up. */
export async function notifyAssigned(taskId: string) {
  const t = await prisma.leadTask.findUniqueOrThrow({ where: { id: taskId }, include: { lead: true } });
  if (!t.assigneeId) return false;
  const user = await prisma.user.findUnique({ where: { id: t.assigneeId }, select: { email: true } });
  if (!user?.email) return false;
  return sendSystemEmail(
    user.email,
    `New: ${title(t, t.lead)} · ${when(t.dueAt)}`,
    `You've been assigned a ${(TASK_TYPES[t.type] ?? t.type).toLowerCase()} with ${t.lead.name} on ${when(t.dueAt)}.\n\n${details(t, t.lead)}\n\nAdd to Google Calendar: ${googleCalendarLink(t, t.lead)}`,
    { filename: "invite.ics", content: icsFile(t, t.lead) },
  ).catch(() => false);
}

/** Every minute (worker): email assignees 30 minutes before their calls and meetings. */
export async function sendDueReminders(now = new Date()) {
  const soon = await prisma.leadTask.findMany({
    where: { status: "OPEN", remindedAt: null, assigneeId: { not: null }, dueAt: { gt: now, lte: new Date(now.getTime() + 30 * 60_000) } },
    include: { lead: true },
  });
  let sent = 0;
  for (const t of soon) {
    const user = await prisma.user.findUnique({ where: { id: t.assigneeId! }, select: { email: true } });
    const ok = user?.email ? await sendSystemEmail(user.email, `In 30 min: ${title(t, t.lead)}`, `${when(t.dueAt)}\n\n${details(t, t.lead)}`).catch(() => false) : false;
    // Marked either way, so an address without email isn't retried every minute.
    await prisma.leadTask.update({ where: { id: t.id }, data: { remindedAt: now } });
    if (ok) sent++;
  }
  return sent;
}
