import Link from "next/link";
import { PageHeader, Stat } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { cfoSnapshot, activePolicyName } from "../../lib/treasury";
import { LEVELS, computeAlerts } from "../../lib/alerts";
import { OBLIGATION_KINDS, date, inr, monthLabel } from "@genclover/ui/format";
import { FlowChart } from "../reports/FinanceCharts";

export default async function CfoPage() {
  await requirePermission("finance.view");
  const [snap, policy] = await Promise.all([cfoSnapshot(), activePolicyName()]);
  const alerts = await computeAlerts(snap);
  const s = snap.settings;
  const runwayTone = snap.survivalRunway == null ? "" : snap.survivalRunway < s.runwayMinMonths ? "text-red-600" : snap.survivalRunway < s.runwayTargetMonths ? "text-orange-600" : "text-emerald-700";

  return (
    <>
      <PageHeader
        title="CFO Dashboard"
        subtitle={<>Real-time position in ₹ · allocation policy <Link href="/admin/policies" className="text-brand-fg underline">{policy}</Link> · commitments over the next {s.horizonDays} days</>}
        actions={<><Link href="/planner" className="btn-secondary">Can we afford a hire?</Link><Link href="/funds" className="btn-primary">Funds</Link></>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="Bank cash" value={inr(snap.bankCash)} hint="Sum of all funds" />
        <Stat label="Committed" value={inr(snap.committed)} hint={`Due by ${date(snap.horizonEnd)}`} />
        <Stat label="Available to spend" value={<span className={snap.availableCash < 0 ? "text-red-600" : ""}>{inr(snap.availableCash)}</span>} hint="Cash − commitments" accent />
        <Stat label="Monthly unavoidable burn" value={inr(snap.burn)} hint={`Payroll ${inr(snap.payrollMonthly)} + essentials ${inr(snap.essentialMonthly)}`} />
        <Stat label="Survival runway" value={<span className={runwayTone}>{snap.survivalRunway == null ? "—" : `${snap.survivalRunway.toFixed(1)} mo`}</span>} hint={`Target ${s.runwayTargetMonths} · minimum ${s.runwayMinMonths}`} />
        <Stat label="Total cash runway" value={snap.cashRunway == null ? "—" : `${snap.cashRunway.toFixed(1)} mo`} hint="Available cash ÷ burn" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="card">
          <div className="card-h"><div className="card-t">Alerts</div><span className="text-xs text-neutral-500">{LEVELS.map((l) => `${l.icon} ${alerts.filter((x) => x.level === l.key).length}`).join("  ")}</span></div>
          <ul className="space-y-2 p-4">
            {alerts.map((x, i) => {
              const lv = LEVELS.find((l) => l.key === x.level)!;
              const body = (
                <>
                  <div className="font-semibold">{lv.icon} {x.title}</div>
                  <div className="text-xs opacity-80">{x.detail}</div>
                </>
              );
              return (
                <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${lv.tone}`}>
                  {x.href ? <Link href={x.href} className="block hover:underline">{body}</Link> : body}
                </li>
              );
            })}
            {alerts.length === 0 && <li className="text-sm text-neutral-500">No alerts.</li>}
          </ul>
        </div>

        <div className="card p-5">
          <div className="card-t mb-3">Available cash</div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between font-semibold"><dt>Bank cash</dt><dd className="tabular-nums">{inr(snap.bankCash)}</dd></div>
            {snap.committedByKind.map(([k, v]) => (
              <div key={k} className="flex justify-between text-neutral-600"><dt>Less {OBLIGATION_KINDS[k]?.toLowerCase() ?? k}</dt><dd className="tabular-nums">−{inr(v)}</dd></div>
            ))}
            <div className={`flex justify-between border-t pt-1.5 text-base font-semibold ${snap.availableCash < 0 ? "text-red-600" : "text-brand-fg"}`}><dt>Available cash</dt><dd className="tabular-nums">{inr(snap.availableCash)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">Then restricted by fund below — money in Survival or Ventures is not free for operations.</p>
        </div>
      </div>

      <div className="card mb-6 overflow-x-auto">
        <div className="card-h"><div className="card-t">Funds — balance, committed, available</div><Link href="/funds" className="text-sm text-brand-fg">Ledger & transfers</Link></div>
        <table className="tbl">
          <thead><tr><th>Fund</th><th className="num">Policy %</th><th className="num">Allocated in</th><th className="num">Spent</th><th className="num">Balance</th><th className="num">Committed</th><th className="num">Available</th><th className="w-40">Committed share</th></tr></thead>
          <tbody>
            {snap.funds.map((f) => (
              <tr key={f.key}>
                <td><Link href={`/funds?fund=${f.key}`} className="font-medium text-brand-fg hover:underline">{f.name}</Link></td>
                <td className="num">{f.percent ? `${f.percent}%` : "—"}</td>
                <td className="num text-neutral-600">{inr(f.allocated + f.other)}</td>
                <td className="num text-neutral-600">{inr(f.spent)}</td>
                <td className={`num font-semibold ${f.balance < 0 ? "text-red-600" : ""}`}>{inr(f.balance)}</td>
                <td className="num">{f.committed ? inr(f.committed) : "—"}</td>
                <td className={`num font-semibold ${f.available < 0 ? "text-red-600" : "text-emerald-700"}`}>{inr(f.available)}</td>
                <td>
                  <div className="h-2 rounded bg-neutral-100">
                    <div className={`h-2 rounded ${f.balance > 0 && f.committed / f.balance >= 0.8 ? "bg-orange-500" : "bg-brand"} ${f.available < 0 ? "bg-red-500" : ""}`} style={{ width: `${f.balance > 0 ? Math.min(100, (f.committed / f.balance) * 100) : f.committed ? 100 : 0}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4}>TOTAL</td><td className="num">{inr(snap.bankCash)}</td><td className="num">{inr(snap.committed)}</td><td className="num">{inr(snap.availableCash)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>

      <div className="mb-6">
        <FlowChart
          title="Cash forecast — next 6 months"
          names={["Expected receipts (incl. weighted pipeline)", "Obligations due", "Projected cash"]}
          data={snap.forecast.map((f) => ({ label: monthLabel(f.month), a: f.receipts + f.pipeline, b: f.payments, c: f.closing }))}
        />
        <p className="mt-2 text-xs text-neutral-500">
          Receipts: open invoices by due date (overdue counted this month), active projects&apos; planned revenue paid the month after it is worked, and pipeline weighted by probability after its expected close. Obligations: payroll, unpaid bills and scheduled commitments.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">Obligations due in the next {s.horizonDays} days</div><Link href="/commitments" className="text-sm text-brand-fg">Manage commitments</Link></div>
        <table className="tbl">
          <thead><tr><th>Due</th><th>Type</th><th>What</th><th>Fund</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {snap.obligations.map((o, i) => (
              <tr key={i}><td className="whitespace-nowrap">{date(o.dueDate)}</td><td className="text-xs">{OBLIGATION_KINDS[o.kind] ?? o.kind}</td><td>{o.name}</td><td className="text-xs">{snap.funds.find((f) => f.key === o.fundKey)?.name ?? o.fundKey}</td><td className="num">{inr(o.amountInr)}</td></tr>
            ))}
            {snap.obligations.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Nothing due. Add people (payroll) and commitments to see obligations.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
