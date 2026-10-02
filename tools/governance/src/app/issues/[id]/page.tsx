import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { ISSUE_CATEGORIES, LEVELS } from "../../../lib/governance";
import IssueForm from "../IssueForm";
import { issueFormData } from "../data";
import IssueControls from "./IssueControls";

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const issue = await prisma.issue.findUnique({ where: { id }, include: { notes: { orderBy: { at: "desc" } }, project: { select: { id: true, code: true, name: true } } } });
  if (!issue) notFound();
  // People issues stay with owners and HR.
  if (issue.category === "PEOPLE" && !can(user.role, "admin") && !can(user.role, "people.edit")) notFound();
  const canEdit = can(user.role, "issues.edit");
  const data = canEdit ? await issueFormData() : null;
  const lv = LEVELS[issue.level];

  return (
    <>
      <PageHeader
        title={`${issue.code} · ${issue.title}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/issues" className="hover:underline">← Issues</Link>·<StatusBadge status={issue.status} />·<StatusBadge status={issue.priority} />·<span>{ISSUE_CATEGORIES[issue.category]?.label}</span>
            {issue.project && <>·<Link className="font-mono text-xs hover:underline" href={`/projects/${issue.project.id}?tab=issues`}>{issue.project.code}</Link></>}
            · raised by {issue.raisedBy} {date(issue.createdAt)}
          </span>
        }
      />
      <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm">
        <b>{lv?.label}</b> — decided by: {lv?.who}. {ISSUE_CATEGORIES[issue.category]?.owner}.
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          {issue.decision && (
            <div className="card border-violet-200 p-4 text-sm">
              <div className="card-t mb-1">Decision</div>
              <p className="whitespace-pre-line">{issue.decision}</p>
              <p className="mt-1 text-xs text-neutral-500">{issue.decidedBy} · {date(issue.decidedAt)}</p>
            </div>
          )}
          {issue.lessons && (
            <div className="card p-4 text-sm">
              <div className="card-t mb-1">Lessons learned</div>
              <p className="whitespace-pre-line">{issue.lessons}</p>
            </div>
          )}
          {data ? (
            <IssueForm
              {...data}
              initial={{
                id: issue.id,
                title: issue.title,
                category: issue.category,
                priority: issue.priority,
                projectId: issue.projectId ?? "",
                description: issue.description ?? "",
                impact: issue.impact ?? "",
                options: issue.options ?? "",
                ownerId: issue.ownerId ?? "",
                dueDate: issue.dueDate ? issue.dueDate.toISOString().slice(0, 10) : "",
              }}
            />
          ) : (
            <div className="card space-y-2 p-5 text-sm">
              <p className="whitespace-pre-line">{issue.description}</p>
              {issue.impact && <p><b>Impact:</b> {issue.impact}</p>}
              {issue.options && <p><b>Options:</b> {issue.options}</p>}
            </div>
          )}
        </div>
        <aside className="space-y-4">
          {canEdit && <IssueControls id={issue.id} status={issue.status} level={issue.level} canDecide={issue.level < 3 || can(user.role, "admin")} />}
          <div className="card">
            <div className="card-h"><div className="card-t">Log</div></div>
            <ul className="divide-y divide-neutral-100 text-sm">
              {issue.notes.map((n) => (
                <li key={n.id} className="px-4 py-2.5">
                  <p className="whitespace-pre-line">{n.text}</p>
                  <p className="text-xs text-neutral-500">{n.byName} · {date(n.at)}</p>
                </li>
              ))}
              {issue.notes.length === 0 && <li className="px-4 py-3 text-neutral-500">No notes yet.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
