import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { MODELS } from "@genclover/finance/lib/calc";
import { monthRange, ymd } from "@genclover/finance/lib/finance";
import { currentMonth, date, KIND_LABEL } from "@genclover/ui/format";
import ProjectInfoForm from "../ProjectInfoForm";
import { CancelRequestButton, MilestoneEditor, RequestForm, TeamEditor } from "./Editors";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "scope", label: "Scope & changes" },
  { key: "milestones", label: "Milestones" },
  { key: "team", label: "Team" },
  { key: "hours", label: "Hours" },
  { key: "issues", label: "Issues" },
];

const SCOPE_TYPES = ["SOW", "RESOURCE", "SUPPORT", "SLA", "CR", "ACCEPTANCE"];

/**
 * A project for delivery: scope documents, milestones, team and hours, issues. No money on this page; finance
 * roles get a link to the Commercials page (quote, agreement, billing, profitability).
 */
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const user = await requireUser();
  const finance = can(user.role, "finance.view");
  const canEdit = can(user.role, "projects.edit");
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true, code: true, name: true, kind: true, status: true, engagementModel: true, startDate: true, endDate: true, description: true, deliveryManager: true, opportunityId: true,
      client: { select: { id: true, code: true, name: true } },
      milestones: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, ownerId: true, dueDate: true, status: true, notes: true, acceptanceRef: true, invoiceId: true } },
      assignments: { select: { personId: true, resourceId: true, hoursPerMonth: true, billable: true, startDate: true, endDate: true, billMode: finance, billValue: finance } },
      resources: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, headcount: true, hoursPerMonth: true } },
      agreements: { orderBy: { createdAt: "asc" }, select: { id: true, code: true, type: true, title: true, status: true, estimatedHours: true, scopeSummary: true, signedAt: true } },
      resourceRequests: { orderBy: { createdAt: "desc" }, select: { id: true, role: true, skills: true, hoursPerMonth: true, startDate: true, endDate: true, status: true, requestedBy: true, decidedBy: true, personId: true, createdAt: true } },
      issues: { orderBy: { createdAt: "desc" }, select: { id: true, code: true, title: true, status: true, priority: true, level: true, ownerName: true } },
    },
  });
  if (!project) notFound();

  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const { from, to } = monthRange(month);
  const [people, monthEntries, allEntries, allocations] = await Promise.all([
    prisma.person.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, stdHoursPerMonth: true } }),
    prisma.timeEntry.findMany({ where: { projectId: id, date: { gte: from, lt: to } }, select: { personId: true, hours: true, billable: true, billedHours: finance } }),
    prisma.timeEntry.groupBy({ by: ["personId"], where: { projectId: id }, _sum: { hours: true } }),
    prisma.assignment.groupBy({ by: ["personId"], where: { project: { status: { in: ["ACTIVE", "ON_HOLD", "DRAFT", "QUOTED", "NEGOTIATION"] } } }, _sum: { hoursPerMonth: true } }),
  ]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const allocated = new Map(allocations.map((a) => [a.personId, a._sum.hoursPerMonth ?? 0]));
  const monthHours = monthEntries.reduce<Record<string, number>>((acc, e) => ((acc[e.personId] = (acc[e.personId] ?? 0) + e.hours), acc), {});
  const totalLogged = allEntries.reduce((s, e) => s + (e._sum.hours ?? 0), 0);
  const estimated = project.agreements.filter((a) => ["SIGNED", "ACTIVE"].includes(a.status) && ["SOW", "CR", "RESOURCE", "SUPPORT"].includes(a.type)).reduce((s, a) => s + (a.estimatedHours ?? 0), 0);
  const late = project.milestones.filter((m) => m.status !== "DONE" && m.dueDate && m.dueDate < new Date()).length;
  const managers = [...new Set((await prisma.project.findMany({ where: { deliveryManager: { not: null } }, select: { deliveryManager: true } })).map((p) => p.deliveryManager!))];

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/projects" className="hover:underline">← Projects</Link>·<span className="font-mono text-xs">{project.code}</span>·
            <Link href={`/clients/${project.client.id}`} className="text-brand-fg hover:underline">{project.client.name}</Link>·<StatusBadge status={project.status} />·
            <span>{KIND_LABEL[project.kind] ?? project.kind}</span>·<span>{MODELS[project.engagementModel] ?? project.engagementModel}</span>
          </span>
        }
        actions={
          <>
            {can(user.role, "issues.edit") && <Link href={`/issues/new?project=${project.id}`} className="btn-secondary">Raise an issue</Link>}
            {finance && <Link href={`/finance/projects/${project.id}`} className="btn-primary">Commercials →</Link>}
          </>
        }
      />
      {!canEdit && <ReadOnlyNote />}
      <div className="mb-5 flex flex-wrap gap-x-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link key={t.key} href={`/projects/${project.id}?tab=${t.key}`} className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-semibold text-brand-fg" : "border-transparent text-neutral-600 hover:text-ink"}`}>
            {t.label}
            {t.key === "issues" && project.issues.filter((i) => i.status !== "CLOSED").length > 0 && <span className="ml-1 badge bg-red-50 text-red-700">{project.issues.filter((i) => i.status !== "CLOSED").length}</span>}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Hours logged (all time)" value={totalLogged} hint={estimated ? `${Math.round((totalLogged / estimated) * 100)}% of ${estimated} estimated in signed scope` : "No estimate in signed scope yet"} accent />
            <Stat label="Milestones" value={`${project.milestones.filter((m) => m.status === "DONE").length} / ${project.milestones.length}`} hint={late ? `${late} late` : "none late"} />
            <Stat label="Team" value={project.assignments.length} hint={`${project.assignments.reduce((s, a) => s + a.hoursPerMonth, 0)} hrs / month planned`} />
            <Stat label="Open issues" value={project.issues.filter((i) => i.status !== "CLOSED").length} hint={`${project.resourceRequests.filter((r) => r.status === "OPEN").length} open resource request(s)`} />
          </div>
          <ProjectInfoForm
            project={{
              id: project.id,
              name: project.name,
              kind: project.kind,
              status: project.status,
              engagementModel: project.engagementModel,
              description: project.description,
              deliveryManager: project.deliveryManager,
              startDate: project.startDate?.toISOString() ?? null,
              endDate: project.endDate?.toISOString() ?? null,
            }}
            client={project.client}
            readOnly={!canEdit && !can(user.role, "finance.edit")}
            canModel={can(user.role, "finance.edit")}
            managers={managers}
          />
        </div>
      )}

      {tab === "scope" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {can(user.role, "agreements.edit") && <Link className="btn-secondary btn-sm" href={`/agreements/new?type=SOW&project=${project.id}`}>+ SOW / scope document</Link>}
            {(can(user.role, "agreements.edit") || canEdit) && <Link className="btn-secondary btn-sm" href={`/agreements/new?type=CR&project=${project.id}`}>+ Change request</Link>}
            {(can(user.role, "agreements.edit") || canEdit) && <Link className="btn-secondary btn-sm" href={`/agreements/new?type=ACCEPTANCE&project=${project.id}`}>+ Acceptance certificate</Link>}
          </div>
          <p className="text-sm text-neutral-600">Work starts only on signed scope. Anything outside it goes through a change request first.</p>
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Document</th><th>Status</th><th className="num">Est. hours</th><th>Signed</th><th className="hidden lg:table-cell">Scope</th></tr></thead>
              <tbody>
                {project.agreements.filter((a) => SCOPE_TYPES.includes(a.type)).map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs"><Link className="text-brand-fg hover:underline" href={`/agreements/${a.id}`}>{a.code}</Link></td>
                    <td>{a.title}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="num">{a.estimatedHours ?? "—"}</td>
                    <td>{date(a.signedAt)}</td>
                    <td className="hidden max-w-96 truncate text-xs text-neutral-600 lg:table-cell">{a.scopeSummary}</td>
                  </tr>
                ))}
                {project.agreements.filter((a) => SCOPE_TYPES.includes(a.type)).length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">No SOW yet. Onboarding or the owner adds the first one.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "milestones" && (
        <MilestoneEditor
          projectId={project.id}
          readOnly={!canEdit}
          people={people}
          today={ymd(new Date())}
          acceptances={project.agreements.filter((a) => a.type === "ACCEPTANCE").map((a) => a.code)}
          initial={project.milestones.map((m) => ({ id: m.id, title: m.title, ownerId: m.ownerId, dueDate: m.dueDate ? ymd(m.dueDate) : null, status: m.status, notes: m.notes, acceptanceRef: m.acceptanceRef, billed: !!m.invoiceId }))}
        />
      )}

      {tab === "team" && (
        <div className="space-y-4">
          <TeamEditor
            projectId={project.id}
            readOnly={!canEdit && !can(user.role, "resources.manage")}
            showBilling={finance}
            people={people.map((p) => ({ id: p.id, name: p.name, capacity: p.stdHoursPerMonth, allocated: allocated.get(p.id) ?? 0 }))}
            resources={project.resources.map((r) => ({ id: r.id, label: r.headcount > 1 ? `${r.label} ×${r.headcount}` : r.label, hours: r.headcount * r.hoursPerMonth }))}
            actuals={monthHours}
            initial={project.assignments.map((a) => ({
              personId: a.personId,
              resourceId: a.resourceId,
              hoursPerMonth: a.hoursPerMonth,
              billable: a.billable,
              startDate: a.startDate ? ymd(a.startDate) : null,
              endDate: a.endDate ? ymd(a.endDate) : null,
              billMode: finance ? a.billMode : "ACTUAL",
              billValue: finance ? a.billValue : 1,
            }))}
          />
          <div className="card">
            <div className="card-h">
              <div className="card-t">Resource requests</div>
              {canEdit && <RequestForm projectId={project.id} />}
            </div>
            <ul className="divide-y divide-neutral-100 text-sm">
              {project.resourceRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                  <span>
                    <b>{r.role}</b>{r.skills && ` (${r.skills})`} · {r.hoursPerMonth} hrs/month{r.startDate && ` from ${date(r.startDate)}`}
                    <div className="text-xs text-neutral-500">asked by {r.requestedBy} · {date(r.createdAt)}{r.status === "FILLED" && ` · filled by ${r.decidedBy} with ${name.get(r.personId ?? "") ?? "someone"}`}</div>
                  </span>
                  <span className="flex items-center gap-2"><StatusBadge status={r.status} />{r.status === "OPEN" && canEdit && <CancelRequestButton id={r.id} />}</span>
                </li>
              ))}
              {project.resourceRequests.length === 0 && <li className="px-5 py-3 text-neutral-500">No requests.</li>}
            </ul>
          </div>
        </div>
      )}

      {tab === "hours" && (
        <div className="card overflow-x-auto">
          <div className="card-h">
            <div className="card-t">Hours · {month}</div>
            <form className="flex gap-2"><input type="hidden" name="tab" value="hours" /><input className="input-sm" type="month" name="month" defaultValue={month} /><button className="btn-secondary btn-sm">Show</button></form>
          </div>
          <table className="tbl">
            <thead><tr><th>Person</th><th className="num">Worked</th><th className="num">Billable worked</th>{finance && <th className="num">Billed to client (finance only)</th>}</tr></thead>
            <tbody>
              {Object.entries(monthHours).map(([pid, h]) => {
                const rows = monthEntries.filter((e) => e.personId === pid);
                const billable = rows.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
                const billed = rows.filter((e) => e.billable).reduce((s, e) => s + ((e as { billedHours?: number | null }).billedHours ?? e.hours), 0);
                return (
                  <tr key={pid}>
                    <td>{name.get(pid) ?? "—"}</td><td className="num">{h}</td><td className="num">{billable}</td>
                    {finance && <td className={`num ${billed !== billable ? "font-semibold text-violet-700" : ""}`}>{billed}</td>}
                  </tr>
                );
              })}
              {Object.keys(monthHours).length === 0 && <tr><td colSpan={4} className="py-6 text-center text-neutral-500">No hours logged in {month}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "issues" && (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Issue</th><th>Priority</th><th>Level</th><th>Owner</th><th>Status</th></tr></thead>
            <tbody>
              {project.issues.map((i) => (
                <tr key={i.id}>
                  <td className="font-mono text-xs"><Link href={`/issues/${i.id}`} className="text-brand-fg hover:underline">{i.code}</Link></td>
                  <td>{i.title}</td><td><StatusBadge status={i.priority} /></td><td>L{i.level}</td><td>{i.ownerName ?? "—"}</td><td><StatusBadge status={i.status} /></td>
                </tr>
              ))}
              {project.issues.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">No issues raised for this project.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
