// Sending outreach email over SMTP (settings in .env). Every email carries the sender's business address
// and a way to opt out (required by US CAN-SPAM; good practice everywhere): replying "unsubscribe" puts the
// lead on the do-not-contact list (lib/inbox.ts). Follow-ups thread under the first email.
import { randomBytes } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@genclover/db";
import { recordOutreach } from "./outreach";
import { getLfSettings } from "./settings";

export const emailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
export const inboxConfigured = () => emailConfigured() && !!(process.env.IMAP_HOST ?? process.env.SMTP_HOST);

let transport: Transporter | null = null;
function transporter() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

const fromAddress = () => process.env.EMAIL_FROM!.match(/<([^>]+)>/)?.[1] ?? process.env.EMAIL_FROM!;

/** Emails sent since midnight IST. */
export async function sentToday() {
  const IST = 330 * 60_000;
  const local = new Date(Date.now() + IST);
  const midnight = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - IST);
  return prisma.emailMessage.count({ where: { sentAt: { gte: midnight } } });
}

async function footer() {
  const row = await prisma.setting.findUnique({ where: { key: "companyAddress" } });
  const name = (await prisma.setting.findUnique({ where: { key: "companyName" } }))?.value ?? "Gen Clover";
  const address = row?.value?.replace(/\s*\n\s*/g, ", ").trim();
  return `\n\n--\n${name}${address ? ` · ${address}` : ""}\nIf you'd rather not hear from us, reply "unsubscribe" and we won't email you again.`;
}

export type SendInput = { subject: string; text: string; service?: string | null; by: { id: string | null; name: string }; auto?: boolean };

/** Send one email to the lead and record it (timeline, follow-up dates). Throws with a readable reason. */
export async function sendLeadEmail(leadId: string, input: SendInput) {
  if (!emailConfigured()) throw new Error("Email isn't set up: add SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM to .env");
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.doNotContact) throw new Error("This business is on the do-not-contact list");
  if (!lead.email) throw new Error("No email address for this lead");
  if (lead.emailBounced) throw new Error("Emails to this address bounced; add another address first");
  const s = await getLfSettings();
  if ((await sentToday()) >= s.emailDailyLimit) throw new Error(`Daily email limit reached (${s.emailDailyLimit}); change it in Settings`);

  const previous = await prisma.emailMessage.findFirst({ where: { leadId, to: lead.email.toLowerCase() }, orderBy: { sentAt: "desc" } });
  const domain = fromAddress().split("@")[1] ?? "genclover.com";
  const messageId = `<${Date.now().toString(36)}.${randomBytes(6).toString("hex")}@${domain}>`;
  const body = input.text + (await footer());
  await transporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: lead.email,
    subject: input.subject,
    text: body,
    messageId,
    inReplyTo: previous?.messageId,
    references: previous ? [previous.messageId] : undefined,
    headers: { "List-Unsubscribe": `<mailto:${fromAddress()}?subject=unsubscribe>` },
  });
  await prisma.emailMessage.create({
    data: { leadId, messageId, to: lead.email.toLowerCase(), subject: input.subject, body, step: lead.contactCount, service: input.service ?? null, auto: !!input.auto },
  });
  await recordOutreach(leadId, { channel: "EMAIL", text: `${input.auto ? "Sent automatically: " : ""}${input.subject}\n\n${input.text}`, service: input.service, by: input.by });
}
