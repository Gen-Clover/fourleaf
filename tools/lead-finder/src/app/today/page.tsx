import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { emailConfigured } from "../../lib/email";
import { messageOptions } from "../../lib/leadMessages";
import { isMarket, localTime, MARKETS, MARKET_KEYS, marketOf } from "../../lib/markets";
import { whatsappNumber } from "../../lib/messages";
import type { Reason } from "../../lib/scoring";
import { ENGAGED_STAGES, TASK_TYPES } from "../../lib/services";
import { NO_DEAL } from "../../lib/dealAccess";
import { awaitingOurReply } from "../../lib/outreach";
import { getLfSettings, getLfTexts } from "../../lib/settings";
import { endOfTodayIst as endOfToday, startOfTodayIst as startOfToday } from "../../lib/time";
import { Score, StageBadge } from "../bits";
import MarketToggle from "../MarketToggle";
import TodayCard from "./TodayCard";

type Kind = "REPLY" | "FOLLOW_UP" | "NEW";
const KIND_LABEL: Record<Kind, string> = { REPLY: "Replied: answer them", FOLLOW_UP: "Follow-up due", NEW: "First message" };

/**
 * Today's outreach, one lead at a time: replies to answer first, then follow-ups that are due, then first
 * messages to the best qualified leads (up to the daily target). Sending moves the lead on; the next appears.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ market?: string; id?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const market = isMarket(sp.market) ? sp.market : undefined;
  const s = await getLfSettings();
  const endOfTodayIst = endOfToday();
  const startOfTodayIst = startOfToday();
  const texts = await getLfTexts();
  const scope = { doNotContact: false, branchOfId: null, ...(market ? { market } : {}) };
  // Automatic email follow-ups (Settings) are sent by the worker, so they don't need a person here.
  const autoEmail = s.autoEmailFollowUps > 0 && emailConfigured();

  const [replies, followUps, contactedToday, myTasks] = await Promise.all([
    prisma.lead.findMany({ where: { ...scope, stage: { in: ENGAGED_STAGES }, nextFollowUpAt: { not: null, lte: endOfTodayIst } }, omit: NO_DEAL, orderBy: { nextFollowUpAt: "asc" }, take: 50 }),
    prisma.lead.findMany({
      omit: NO_DEAL,
      where: {
        ...scope,
        stage: "CONTACTED",
        contactCount: { gte: 1, lte: 3 },
        nextFollowUpAt: { not: null, lte: endOfTodayIst },
        ...(autoEmail ? { NOT: { lastChannel: "EMAIL" } } : {}),
      },
      orderBy: { nextFollowUpAt: "asc" },
      take: 100,
    }),
    prisma.lead.count({ where: { firstContactAt: { gte: startOfTodayIst }, ...(market ? { market } : {}) } }),
    // My calls and meetings today, and any I missed.
    prisma.leadTask.findMany({
      where: { status: "OPEN", assigneeId: user.id, dueAt: { lte: endOfTodayIst } },
      orderBy: { dueAt: "asc" },
      take: 20,
      include: { lead: { select: { id: true, name: true, code: true } } },
    }),
  ]);
  const newQuota = Math.max(0, s.dailyNewContacts - contactedToday);
  const fresh = newQuota
    ? await prisma.lead.findMany({
        omit: NO_DEAL,
        where: { ...scope, stage: "QUALIFIED", contactCount: 0, OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lte: new Date() } }] },
        orderBy: [{ bestScore: "desc" }, { reviewCount: "desc" }],
        take: newQuota,
      })
    : [];
  const queue = [
    ...replies.map((l) => ({ lead: l, kind: "REPLY" as Kind })),
    ...followUps.map((l) => ({ lead: l, kind: "FOLLOW_UP" as Kind })),
    ...fresh.map((l) => ({ lead: l, kind: "NEW" as Kind })),
  ];
  const current = queue.find((q) => q.lead.id === sp.id) ?? queue[0];
  const canEdit = can(user.role, "leads.edit");
  const link = (id: string) => `/leads/today?${new URLSearchParams({ ...(market ? { market } : {}), id })}`;

  let card = null;
  if (current) {
    const l = current.lead;
    const m = marketOf(l.market);
    const { stepLabel, options } = messageOptions(l, user.name.split(" ")[0], { bookingLink: texts.bookingLink });
    const replyDueAt = current.kind === "REPLY" && awaitingOurReply(l) && l.lastReplyAt ? new Date(l.lastReplyAt.getTime() + 3_600_000).toISOString() : null;
    const lastReply = current.kind === "REPLY" ? await prisma.leadActivity.findFirst({ where: { leadId: l.id, type: "REPLY" }, orderBy: { at: "desc" } }) : null;
    const reasons: Reason[] = l.reasons ? JSON.parse(l.reasons) : [];
    card = (
      <section className="card min-w-0">
        <div className="card-h">
          <div className="min-w-0">
            <div className="card-t">{current.kind === "FOLLOW_UP" ? `${KIND_LABEL.FOLLOW_UP} · ${stepLabel}` : KIND_LABEL[current.kind]}</div>
          </div>
          <span className="text-xs text-neutral-500">{m.label}{l.market === "US" && ` · their time ${localTime(l.market, l.lng).label}`}</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/leads/${l.id}`} className="text-lg font-semibold text-ink hover:underline">{l.name}</Link>
              <div className="text-sm text-neutral-500">
                <span className="font-mono text-xs">{l.code}</span>
                {l.area && ` · ${l.area}`}
                {l.rating != null && ` · ${l.rating}★ (${l.reviewCount ?? 0})`}
                {(l.contactName ?? l.personName) && ` · ${l.contactName ?? l.personName}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StageBadge stage={l.stage} />
              <Score score={l.bestScore} hot={s.hotScore} warm={s.warmScore} />
            </div>
          </div>
          {current.kind === "REPLY" ? (
            <div className="rounded-lg bg-neutral-50 p-3 text-sm">
              <div className="mb-1 font-medium text-neutral-900">Their reply</div>
              <p className="whitespace-pre-line text-neutral-700">{lastReply?.text ?? "They replied."}</p>
              <p className="mt-2 text-xs text-neutral-500">Sort what they said, then answer with a suggested reply. Calls, meetings, Won and Lost are on the lead page.</p>
            </div>
          ) : (
            <ul className="space-y-0.5 text-sm text-neutral-600">
              {reasons.filter((r) => r.points > 0 && r.service !== "ABILITY").sort((a, b) => b.points - a.points).slice(0, 3).map((r) => <li key={r.text}>• {r.text}</li>)}
            </ul>
          )}
          {canEdit ? (
            <TodayCard
              id={l.id}
              kind={current.kind}
              replyCategory={l.replyCategory}
              replyDueAt={replyDueAt}
              options={options}
              whatsapp={whatsappNumber(l.whatsappNumber, l.intlPhone, l.phone, l.market)}
              email={l.emailBounced ? null : l.email}
              emailFirst={m.emailFirst}
              smtp={emailConfigured()}
            />
          ) : (
            <p className="text-sm text-neutral-500">View-only access: ask an admin for Editor access to send messages.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={`Replies first, then follow-ups due, then up to ${s.dailyNewContacts} first messages a day to your best qualified leads.`}
        actions={<MarketToggle markets={MARKET_KEYS.map((k) => ({ key: k, label: MARKETS[k].label }))} />}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <span className="badge bg-brand-soft text-brand-fg">{replies.length} replies</span>
        {myTasks.length > 0 && <span className="badge bg-amber-50 text-amber-800">{myTasks.length} calls / meetings</span>}
        <span className="badge bg-violet-50 text-violet-700">{followUps.length} follow-ups</span>
        <span className="badge bg-blue-50 text-blue-700">{fresh.length} first messages ({contactedToday} of {s.dailyNewContacts} sent today)</span>
        {autoEmail && <span className="badge bg-neutral-100 text-neutral-600">Email follow-ups are sent automatically</span>}
      </div>
      {myTasks.length > 0 && (
        <section className="card mb-6 min-w-0">
          <div className="card-h">
            <div className="card-t">My calls & meetings today</div>
            <Link href="/leads/tasks" className="text-xs text-brand-fg underline">All tasks →</Link>
          </div>
          <ul className="divide-y divide-neutral-100">
            {myTasks.map((t) => {
              const late = t.dueAt.getTime() < Date.now();
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className={`font-medium ${late ? "text-red-700" : "text-neutral-900"}`}>
                      {t.dueAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                      {t.dueAt < startOfTodayIst && ` · ${date(t.dueAt)}`}
                    </span>
                    {" · "}
                    {TASK_TYPES[t.type] ?? t.type} with{" "}
                    <Link className="text-brand-fg underline" href={`/leads/${t.lead.id}`}>{t.lead.name}</Link>
                    {t.agenda && <span className="text-neutral-500"> · {t.agenda}</span>}
                  </span>
                  {late && <span className="badge bg-red-50 text-red-700">{t.dueAt < startOfTodayIst ? "missed" : "now / late"}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!current ? (
        <div className="card p-10 text-center text-sm text-neutral-500">
          All done for today. <Link className="text-brand-fg underline" href="/leads/list?stage=NEW">Qualify more leads</Link> or{" "}
          <Link className="text-brand-fg underline" href="/leads/find">run a search</Link>.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          {card}
          <aside className="card h-fit min-w-0">
            <div className="card-h"><div className="card-t">Up next</div><span className="text-xs text-neutral-500">{queue.length}</span></div>
            <ol className="divide-y divide-neutral-100">
              {queue.slice(0, 25).map((q) => (
                <li key={q.lead.id}>
                  <Link
                    href={link(q.lead.id)}
                    className={`flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-neutral-50 ${q.lead.id === current.lead.id ? "bg-brand-soft" : ""}`}
                  >
                    <span className="min-w-0 truncate">{q.lead.name}</span>
                    <span className="shrink-0 text-[11px] text-neutral-500">
                      {q.kind === "REPLY" ? "reply" : q.kind === "FOLLOW_UP" ? `f/u ${q.lead.contactCount}${q.lead.nextFollowUpAt ? ` · ${date(q.lead.nextFollowUpAt)}` : ""}` : "new"}
                    </span>
                  </Link>
                </li>
              ))}
              {queue.length > 25 && <li className="px-4 py-2 text-xs text-neutral-500">+{queue.length - 25} more after these</li>}
            </ol>
          </aside>
        </div>
      )}
    </>
  );
}
