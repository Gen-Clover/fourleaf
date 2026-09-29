import Link from "next/link";
import { PageHeader, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBuckets } from "@/lib/settings";
import { PASS_THROUGH, getTreasurySettings, payrollPlan } from "@/lib/treasury";
import { monthlyEquivalent, ymd } from "@/lib/finance";
import { COMMITMENT_KINDS, FREQUENCIES, date, inr } from "@/lib/format";
import CommitmentForm from "./CommitmentForm";
import { deleteCommitment } from "./actions";

export default async function CommitmentsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const [commitments, buckets, payroll, bills, s] = await Promise.all([
    prisma.commitment.findMany({ orderBy: [{ active: "desc" }, { nextDueDate: "asc" }] }),
    getBuckets(),
    payrollPlan(),
    prisma.expense.aggregate({ where: { paidOn: null }, _sum: { amountInr: true, gstInr: true }, _count: true }),
    getTreasurySettings(),
  ]);
  const funds = [...buckets.map((b) => ({ key: b.key, name: b.name })), { key: PASS_THROUGH, name: "Client pass-through (clearing)" }];
  const fundName = (k: string) => funds.find((f) => f.key === k)?.name ?? k;
  const editing = sp.edit ? commitments.find((c) => c.id === sp.edit) ?? null : null;
  const active = commitments.filter((c) => c.active);
  const payrollTotal = payroll.reduce((x, p) => x + p.monthlyInr, 0);
  const essential = active.filter((c) => c.essential).reduce((x, c) => x + monthlyEquivalent(c), 0);
  const other = active.filter((c) => !c.essential).reduce((x, c) => x + monthlyEquivalent(c), 0);

  return (
    <>
      <PageHeader title="Commitments" subtitle={`Money already promised but not yet paid. Obligations due in the next ${s.horizonDays} days reduce each fund's available balance.`} actions={<Link href="/cfo" className="btn-secondary">CFO dashboard</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Payroll / month" value={inr(payrollTotal)} hint={<Link href="/people" className="underline">{payroll.length} people — from People</Link>} accent />
        <Stat label="Essential commitments / month" value={inr(essential)} hint="Monthly equivalent" />
        <Stat label="Monthly unavoidable burn" value={inr(payrollTotal + essential)} hint={`Non-essential ${inr(other)} / month`} />
        <Stat label="Unpaid bills" value={inr((bills._sum.amountInr ?? 0) + (bills._sum.gstInr ?? 0))} hint={<Link href="/expenses?month=all&unpaid=1" className="underline">{bills._count} bill(s) in Expenses</Link>} />
      </div>
      <div className="mb-6">
        <CommitmentForm
          key={editing?.id ?? "new"}
          c={editing ? { ...editing, nextDueDate: ymd(editing.nextDueDate), endDate: editing.endDate ? ymd(editing.endDate) : null } : null}
          funds={funds}
          today={ymd(new Date())}
        />
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Commitment</th><th>Type</th><th>Fund</th><th>Frequency</th><th>Next due</th><th>Ends</th><th className="num">Amount</th><th className="num">/ month</th><th>Essential</th><th></th></tr></thead>
          <tbody>
            {payroll.length > 0 && (
              <tr className="bg-neutral-50">
                <td className="font-medium">Payroll ({payroll.length} people)</td><td className="text-xs">Payroll</td><td className="text-xs">{fundName(payroll[0].fundKey)}</td><td>Monthly</td><td>Month end</td><td>—</td>
                <td className="num">{inr(payrollTotal)}</td><td className="num">{inr(payrollTotal)}</td><td>Yes</td><td><Link href="/people" className="text-xs text-brand underline">People</Link></td>
              </tr>
            )}
            {commitments.map((c) => (
              <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                <td className="font-medium">{c.name}{c.notes && <div className="text-xs text-neutral-500">{c.notes}</div>}</td>
                <td className="text-xs">{COMMITMENT_KINDS[c.kind]}</td>
                <td className="text-xs">{fundName(c.fundKey)}</td>
                <td>{FREQUENCIES[c.frequency]}</td>
                <td className="whitespace-nowrap">{date(c.nextDueDate)}</td>
                <td className="whitespace-nowrap">{date(c.endDate)}</td>
                <td className="num">{inr(c.amountInr)}</td>
                <td className="num">{c.frequency === "ONE_OFF" ? "—" : inr(monthlyEquivalent(c))}</td>
                <td>{c.essential ? "Yes" : "No"}</td>
                <td className="space-x-1 whitespace-nowrap">
                  <Link href={`/commitments?edit=${c.id}`} className="btn-secondary btn-sm">Edit</Link>
                  <form action={deleteCommitment.bind(null, c.id)} className="inline"><button className="btn-danger btn-sm">✕</button></form>
                </td>
              </tr>
            ))}
            {commitments.length === 0 && payroll.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-neutral-500">No commitments yet. Add rent, taxes, subscriptions, loans and contractor retainers.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">Recurring commitments roll forward automatically. Record each actual payment in Expenses so it leaves its fund; delete or deactivate one-off commitments once paid.</p>
    </>
  );
}
