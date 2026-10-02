import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getBuckets } from "../../../lib/settings";
import { STAGES } from "@genclover/ui/format";
import { ActivateButton, ReapplyButton, SaveAsPolicy } from "./PolicyControls";
import { deletePolicy } from "./actions";

export default async function PoliciesPage() {
  await requirePermission("finance.settings");
  const [policies, buckets] = await Promise.all([prisma.financialPolicy.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }), getBuckets()]);
  const parsed = policies.map((p) => ({ ...p, allocs: JSON.parse(p.allocations) as { key: string; percent: number }[] }));
  const current = Object.fromEntries(buckets.map((b) => [b.key, b.percent]));
  const matchesCurrent = (allocs: { key: string; percent: number }[]) => buckets.every((b) => (allocs.find((a) => a.key === b.key)?.percent ?? 0) === b.percent);

  return (
    <>
      <PageHeader
        title="Financial Policies"
        subtitle="When $100 arrives, where should it go? One policy is live at a time; change it as Gen Clover moves from startup to growth to mature."
        actions={<Link href="/admin/formula?tab=allocation" className="btn-secondary">Edit percentages</Link>}
      />
      <div className="card mb-6 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Policy</th><th>Stage</th>
              {buckets.map((b) => <th key={b.key} className="num" title={b.name}>{b.name.split(/[ /&]/)[0]}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-brand-soft">
              <td className="font-semibold">Live allocation now</td><td></td>
              {buckets.map((b) => <td key={b.key} className="num font-semibold">{b.percent}%</td>)}
              <td></td>
            </tr>
            {parsed.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="font-medium">{p.name} {p.active && <span className="badge ml-1 bg-emerald-50 text-emerald-700">Active</span>}{p.active && !matchesCurrent(p.allocs) && <span className="badge ml-1 bg-amber-50 text-amber-700">edited since</span>}</div>
                  {p.description && <div className="text-xs text-neutral-500">{p.description}</div>}
                </td>
                <td className="text-xs">{STAGES[p.stage]}</td>
                {buckets.map((b) => {
                  const v = p.allocs.find((a) => a.key === b.key)?.percent ?? 0;
                  return <td key={b.key} className={`num ${v !== current[b.key] ? "font-semibold text-brand-fg" : "text-neutral-600"}`}>{v}%</td>;
                })}
                <td className="whitespace-nowrap">
                  {!p.active && <ActivateButton id={p.id} name={p.name} />}
                  {!p.active && <form action={deletePolicy.bind(null, p.id)} className="mt-1"><button className="text-xs text-red-600 underline">Delete</button></form>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SaveAsPolicy />
      <div className="card mt-6 p-5 text-sm text-neutral-600">
        <div className="card-t mb-2">What changes when you activate a policy</div>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Receipts</b> recorded from then on are split into funds with the new percentages.</li>
          <li><b>New projects</b> take a snapshot of the new split.</li>
          <li><b>Existing projects and past receipts</b> keep the split they had, until you apply the live one to them with the button below (it re-splits receipts already recorded; transfers and spends stay as they are).</li>
          <li><b>Rate card coverage</b> uses the Delivery %: a lower Delivery % lowers the cost-coverage check on every role, so review rates too.</li>
        </ul>
        <div className="mt-3">
          <ReapplyButton policy={policies.find((p) => p.active)?.name ?? "the live allocation"} />
        </div>
      </div>
    </>
  );
}
