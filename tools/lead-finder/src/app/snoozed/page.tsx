import Link from "next/link";
import { Empty, PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { REPLY_CATEGORIES, STAGE_LABEL } from "../../lib/services";
import { WakeButton } from "../tasks/TaskActions";

/** Leads that said "not now": out of every queue until their date, then back in Today automatically. */
export default async function SnoozedPage() {
  const user = await requireUser();
  const leads = await prisma.lead.findMany({
    where: { stage: "SNOOZED" },
    orderBy: { snoozeUntil: "asc" },
    take: 500,
    select: { id: true, name: true, code: true, area: true, snoozeUntil: true, snoozedFromStage: true, replyCategory: true, ownerName: true, stageChangedAt: true },
  });
  const canEdit = can(user.role, "leads.edit");
  const soon = Date.now() + 7 * 86_400_000;
  return (
    <>
      <PageHeader title="Snoozed" subtitle="They said “not now”. Each comes back into Today on its date, or wake one early." />
      <div className="card overflow-x-auto">
        {leads.length === 0 ? (
          <Empty>No snoozed leads. Use “Not now (snooze)” on a lead, or sort a reply as “Not now”.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Back on</th>
                <th>Lead</th>
                <th className="hidden md:table-cell">Was</th>
                <th className="hidden sm:table-cell">Snoozed</th>
                <th className="hidden lg:table-cell">Owner</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td className={l.snoozeUntil && l.snoozeUntil.getTime() < soon ? "font-semibold text-amber-800" : ""}>{date(l.snoozeUntil)}</td>
                  <td>
                    <Link href={`/leads/${l.id}`} className="font-medium text-brand-fg hover:underline">{l.name}</Link>
                    <div className="text-xs text-neutral-500"><span className="font-mono">{l.code}</span>{l.area && ` · ${l.area}`}</div>
                  </td>
                  <td className="hidden text-sm md:table-cell">
                    {STAGE_LABEL[l.snoozedFromStage ?? ""] ?? "—"}
                    {l.replyCategory && <div className="text-xs text-neutral-500">{REPLY_CATEGORIES[l.replyCategory]?.label}</div>}
                  </td>
                  <td className="hidden text-sm sm:table-cell">{date(l.stageChangedAt)}</td>
                  <td className="hidden text-sm lg:table-cell">{l.ownerName ?? "—"}</td>
                  {canEdit && <td className="text-right"><WakeButton id={l.id} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
