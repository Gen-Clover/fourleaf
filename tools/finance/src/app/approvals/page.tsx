import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date, inr } from "@genclover/ui/format";
import { APPROVAL_TYPES } from "../../lib/approvals";
import DecideButtons from "./DecideButtons";

/** Everything waiting for a decision from you: money approvals, timesheets, resource requests. */
export default async function ApprovalsPage() {
  const user = await requireUser();
  const money = can(user.role, "finance.approve");
  const [pending, decided, weeks, requests] = await Promise.all([
    money ? prisma.approval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }) : [],
    money ? prisma.approval.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 15 }) : [],
    can(user.role, "hours.approve") ? prisma.timesheetWeek.count({ where: { status: "SUBMITTED" } }) : 0,
    can(user.role, "resources.manage") ? prisma.resourceRequest.count({ where: { status: "OPEN" } }) : 0,
  ]);
  return (
    <>
      <PageHeader title="Approvals" subtitle="A second person signs off pay runs, large expense payments and prices below the floor. The requester can't approve their own." />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {money && <div className="card p-4"><div className="text-xs text-neutral-500 uppercase">Money approvals</div><div className="text-2xl font-semibold">{pending.length}</div></div>}
        {can(user.role, "hours.approve") && (
          <Link href="/timesheets/approve" className="card p-4 hover:border-brand"><div className="text-xs text-neutral-500 uppercase">Timesheets submitted</div><div className="text-2xl font-semibold">{weeks}</div><div className="text-xs text-brand-fg">Approve →</div></Link>
        )}
        {can(user.role, "resources.manage") && (
          <Link href="/resources" className="card p-4 hover:border-brand"><div className="text-xs text-neutral-500 uppercase">Resource requests</div><div className="text-2xl font-semibold">{requests}</div><div className="text-xs text-brand-fg">Fill →</div></Link>
        )}
      </div>
      {money && (
        <>
          <section className="card mb-6">
            <div className="card-h"><div className="card-t">Waiting for you</div></div>
            {pending.length === 0 ? (
              <Empty>Nothing to approve.</Empty>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {pending.map((a) => (
                  <li key={a.id} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[1fr_auto]">
                    <div>
                      <span className="badge mr-2 bg-neutral-100 text-neutral-700">{APPROVAL_TYPES[a.type] ?? a.type}</span>
                      {a.link ? <Link className="font-medium text-brand-fg hover:underline" href={a.link}>{a.summary}</Link> : <span className="font-medium">{a.summary}</span>}
                      <div className="text-xs text-neutral-500">asked by {a.requestedByName} · {date(a.createdAt)}{a.amountInr != null && ` · ${inr(a.amountInr)}`}</div>
                    </div>
                    <DecideButtons id={a.id} own={a.requestedById === user.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <div className="card-h"><div className="card-t">Recently decided</div></div>
            <table className="tbl">
              <tbody>
                {decided.map((a) => (
                  <tr key={a.id}>
                    <td className="text-xs">{APPROVAL_TYPES[a.type] ?? a.type}</td>
                    <td>{a.link ? <Link className="hover:underline" href={a.link}>{a.summary}</Link> : a.summary}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="text-xs text-neutral-500">{a.decidedByName} · {date(a.decidedAt)}{a.note && ` · ${a.note}`}</td>
                  </tr>
                ))}
                {decided.length === 0 && <tr><td className="py-4 text-center text-neutral-500">None yet.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
