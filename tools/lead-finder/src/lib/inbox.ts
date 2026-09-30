// Reading replies from the sending mailbox (IMAP, settings in .env), run by the worker every few minutes.
//   · a reply to one of our emails (or from an address we emailed) → lead marked Replied, sequence stops
//   · "unsubscribe" / "stop" / "remove me" → do not contact
//   · a bounce → the address is flagged so nobody sends to it again
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@genclover/db";
import { inboxConfigured } from "./email";
import { markReplied } from "./outreach";

const STATE_KEY = "lead-finder:imap:lastUid";
const UNSUBSCRIBE = /\b(unsubscribe|stop emailing|remove me|take me off|do not contact|don'?t contact)\b/i;
const BOUNCE_FROM = /mailer-daemon|postmaster/i;
const BOUNCE_SUBJECT = /undeliver|delivery status|returned mail|delivery failure|failure notice|could not be delivered/i;

/** The reply text without the quoted original below it. */
export function replyText(text: string) {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^>/.test(line) || /^On .+wrote:$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line)) break;
    lines.push(line);
  }
  return lines.join("\n").trim().slice(0, 1500);
}

export type InboxMessage = { from: string; subject: string; text: string; inReplyTo: string | null; references: string[]; raw: string };

/** What one incoming message means for us (kept separate from IMAP so it can be tested). */
export async function handleMessage(m: InboxMessage) {
  const system = { id: null, name: "Inbox" };
  if (BOUNCE_FROM.test(m.from) || BOUNCE_SUBJECT.test(m.subject)) {
    const ids = [...m.raw.matchAll(/<[^<>\s]+@[^<>\s]+>/g)].map((x) => x[0]);
    const sent = await prisma.emailMessage.findFirst({ where: { messageId: { in: ids } } });
    if (!sent) return "ignored";
    await prisma.emailMessage.update({ where: { id: sent.id }, data: { status: "BOUNCED" } });
    await prisma.lead.update({ where: { id: sent.leadId }, data: { emailBounced: true } });
    await prisma.leadActivity.create({ data: { leadId: sent.leadId, type: "SYSTEM", text: `Email to ${sent.to} bounced`, byName: system.name } });
    return "bounce";
  }
  const threadIds = [m.inReplyTo, ...m.references].filter((x): x is string => !!x);
  const sent =
    (threadIds.length ? await prisma.emailMessage.findFirst({ where: { messageId: { in: threadIds } }, orderBy: { sentAt: "desc" } }) : null) ??
    (await prisma.emailMessage.findFirst({ where: { to: m.from.toLowerCase() }, orderBy: { sentAt: "desc" } }));
  if (!sent) return "ignored";
  const text = replyText(m.text);
  await prisma.emailMessage.updateMany({ where: { leadId: sent.leadId, status: "SENT" }, data: { status: "REPLIED", repliedAt: new Date() } });
  if (UNSUBSCRIBE.test(text.slice(0, 400)) || /^unsubscribe/i.test(m.subject)) {
    await prisma.lead.update({ where: { id: sent.leadId }, data: { doNotContact: true, nextFollowUpAt: null } });
    await prisma.leadActivity.create({ data: { leadId: sent.leadId, type: "SYSTEM", text: `Asked not to be contacted (email reply): "${text.slice(0, 200)}"`, byName: system.name } });
    return "unsubscribe";
  }
  await markReplied(sent.leadId, { text: `Email reply: ${m.subject}\n\n${text}`, by: system });
  return "reply";
}

/** Fetch new messages since the last check and handle each. Returns counts by outcome. */
export async function checkInbox() {
  if (!inboxConfigured()) return { skipped: "inbox not configured" };
  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? process.env.SMTP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user: process.env.IMAP_USER ?? process.env.SMTP_USER!, pass: process.env.IMAP_PASS ?? process.env.SMTP_PASS! },
    logger: false,
  });
  const counts: Record<string, number> = {};
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const state = await prisma.systemState.findUnique({ where: { key: STATE_KEY } });
    const lastUid = Number(state?.value ?? 0);
    // First run: only the last 7 days, not the whole mailbox history.
    const range = lastUid ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - 7 * 86_400_000) };
    let maxUid = lastUid;
    for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
      if (msg.uid <= lastUid || !msg.source) continue;
      maxUid = Math.max(maxUid, msg.uid);
      const parsed = await simpleParser(msg.source);
      const refs = parsed.references;
      const outcome = await handleMessage({
        from: parsed.from?.value[0]?.address ?? "",
        subject: parsed.subject ?? "",
        text: parsed.text ?? "",
        inReplyTo: parsed.inReplyTo ?? null,
        references: Array.isArray(refs) ? refs : refs ? [refs] : [],
        raw: msg.source.toString("utf8").slice(0, 200_000),
      });
      counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    if (maxUid > lastUid) await prisma.systemState.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value: String(maxUid) }, update: { value: String(maxUid) } });
  } finally {
    lock.release();
    await client.logout();
  }
  return counts;
}
