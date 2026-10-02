import Link from "next/link";
import { Empty, PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { TASK_TYPES } from "../../lib/services";
import { googleCalendarLink, icsFile } from "../../lib/tasks";
import { endOfTodayIst } from "../../lib/time";
import { TaskActions } from "./TaskActions";

const time = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

/**
 * Calls, meetings and visits to do: missed ones first, then today, then upcoming. "Mine" by default;
 * "Everyone" shows the whole team's (for whoever plans the day).
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const everyone = sp.who === "all";
  const tasks = await prisma.leadTask.findMany({
    where: { status: "OPEN", ...(everyone ? {} : { assigneeId: user.id }) },
    orderBy: { dueAt: "asc" },
    take: 300,
    include: { lead: { select: { id: true, name: true, code: true, phone: true, intlPhone: true, address: true, stage: true } } },
  });
  const now = Date.now();
  const endToday = endOfTodayIst().getTime();
  const groups: [string, typeof tasks][] = [
    ["Missed", tasks.filter((t) => t.dueAt.getTime() < now - t.durationMin * 60_000)],
    ["Today", tasks.filter((t) => t.dueAt.getTime() >= now - t.durationMin * 60_000 && t.dueAt.getTime() <= endToday)],
    ["Upcoming", tasks.filter((t) => t.dueAt.getTime() > endToday)],
  ];
  const canEdit = can(user.role, "leads.edit");
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`badge ${on ? "bg-brand-soft text-brand-fg" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>{label}</Link>
  );

  return (
    <>
      <PageHeader
        title="Calls & meetings"
        subtitle="Scheduled from a lead's page. The person assigned is emailed when it's booked and 30 minutes before (if email is set up)."
      />
      <div className="mb-4 flex gap-2 text-sm">
        {tab("/leads/tasks", "Mine", !everyone)}
        {tab("/leads/tasks?who=all", "Everyone", everyone)}
      </div>
      {tasks.length === 0 ? (
        <div className="card">
          <Empty>Nothing scheduled. Book a call or meeting from a lead&apos;s page (Calls &amp; meetings card).</Empty>
        </div>
      ) : (
        <div className="space-y-6">
          {groups
            .filter(([, list]) => list.length)
            .map(([label, list]) => (
              <section key={label} className="card min-w-0">
                <div className="card-h">
                  <div className={`card-t ${label === "Missed" ? "text-red-700" : ""}`}>{label}</div>
                  <span className="text-xs text-neutral-500">{list.length}</span>
                </div>
                <ul className="divide-y divide-neutral-100">
                  {list.map((t) => (
                    <li key={t.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[9rem_1fr_16rem]">
                      <div className="font-medium text-neutral-900">
                        {label === "Today" ? time(t.dueAt) : `${date(t.dueAt)} · ${time(t.dueAt)}`}
                        <div className="text-xs font-normal text-neutral-500">{TASK_TYPES[t.type] ?? t.type} · {t.durationMin} min</div>
                      </div>
                      <div className="min-w-0">
                        <Link className="font-medium text-brand-fg hover:underline" href={`/leads/${t.lead.id}`}>{t.lead.name}</Link>
                        <span className="ml-2 font-mono text-xs text-neutral-500">{t.lead.code}</span>
                        <div className="text-xs text-neutral-500">
                          {everyone && `${t.assigneeName ?? "Unassigned"} · `}
                          {t.lead.intlPhone ?? t.lead.phone ?? "no phone"}
                          {t.link && (
                            <>
                              {" · "}
                              <a className="text-brand-fg underline" href={t.link} target="_blank" rel="noreferrer">join link</a>
                            </>
                          )}
                        </div>
                        {t.agenda && <div className="mt-0.5 text-neutral-600">{t.agenda}</div>}
                      </div>
                      {canEdit ? <TaskActions id={t.id} googleLink={googleCalendarLink(t, t.lead)} ics={icsFile(t, t.lead)} /> : <div />}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
