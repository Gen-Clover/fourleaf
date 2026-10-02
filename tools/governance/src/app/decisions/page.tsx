import { Empty, PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { DECISION_TYPES } from "../../lib/governance";
import DecisionForm from "./DecisionForm";

/** Board resolutions and major decisions: what, who, when, and where the minutes are. */
export default async function DecisionsPage() {
  const user = await requireUser();
  const decisions = await prisma.decision.findMany({ orderBy: { date: "desc" }, take: 300 });
  return (
    <>
      <PageHeader title="Decision register" subtitle="Board resolutions, CEO and management decisions, with the reference to the minutes. Owners record them." />
      {can(user.role, "admin") && <DecisionForm me={user.name} />}
      <div className="card overflow-x-auto">
        {decisions.length === 0 ? (
          <Empty>No decisions recorded yet.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Decision</th><th>By</th><th>Reference</th></tr></thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono text-xs">{d.code}</td>
                  <td className="whitespace-nowrap">{date(d.date)}</td>
                  <td className="text-xs">{DECISION_TYPES[d.type]}</td>
                  <td><div className="font-medium">{d.title}</div><div className="whitespace-pre-line text-xs text-neutral-600">{d.decision}</div></td>
                  <td>{d.decidedBy}</td>
                  <td className="text-xs">{d.reference && /^https?:/.test(d.reference) ? <a className="text-brand-fg underline" href={d.reference} target="_blank" rel="noreferrer">minutes</a> : d.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
