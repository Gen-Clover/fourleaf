import Link from "next/link";
import { Empty, PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { isService, SERVICE } from "../../lib/services";
import AutoRefresh from "../AutoRefresh";
import { SearchStatus } from "./SearchStatus";
import Schedules from "./Schedules";

export default async function SearchesPage() {
  const user = await requireUser();
  const [searches, schedules] = await Promise.all([
    prisma.leadSearch.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.leadSchedule.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <AutoRefresh active={searches.some((s) => ["QUEUED", "RUNNING"].includes(s.status))} everyMs={5000} />
      <PageHeader
        title="Searches"
        subtitle="Every Google Maps search, newest first."
        actions={can(user.role, "leads.edit") && <Link href="/leads/find" className="btn-primary">+ New search</Link>}
      />
      <Schedules schedules={schedules} canEdit={can(user.role, "leads.edit")} />
      <div className="card overflow-x-auto">
        {searches.length === 0 ? (
          <Empty href={can(user.role, "leads.edit") ? "/leads/find" : undefined} cta="Run your first search">No searches yet.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Search</th><th className="hidden md:table-cell">Selling</th><th>Status</th><th className="num hidden sm:table-cell">Found</th><th className="num">New</th><th className="num hidden md:table-cell">Requests</th><th className="hidden lg:table-cell">Run by</th></tr>
            </thead>
            <tbody>
              {searches.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/leads/searches/${s.id}`} className="font-medium text-brand-fg hover:underline">{s.nicheLabel}</Link>
                    <div className="text-xs text-neutral-500">{s.areaLabel} · {s.depth === "QUICK" ? "quick" : "thorough"}</div>
                  </td>
                  <td className="hidden text-sm md:table-cell">{isService(s.service) ? SERVICE[s.service].label : "All services"}</td>
                  <td><SearchStatus status={s.status} done={s.cellsDone} total={s.cellsTotal} /></td>
                  <td className="num hidden sm:table-cell">{s.found}</td>
                  <td className="num font-semibold">{s.newLeads}</td>
                  <td className="num hidden md:table-cell">{s.requests}</td>
                  <td className="hidden text-sm lg:table-cell">{s.createdBy}<div className="text-xs text-neutral-500">{date(s.createdAt)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
