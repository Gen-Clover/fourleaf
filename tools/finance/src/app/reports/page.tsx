import Link from "next/link";
import { PageHeader, Stat } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { ledger, receivables } from "../../lib/ledger";
import { AGING, fyLabel, fyMonths, fyStartYear } from "../../lib/finance";
import { date, inr, monthLabel, pct, usd, usd0 } from "@genclover/ui/format";
import { FlowChart } from "./FinanceCharts";

const TABS = [
  { key: "pnl", label: "P&L vs plan" },
  { key: "cash", label: "Cash flow" },
  { key: "receivables", label: "Receivables" },
  { key: "projects", label: "Project profitability" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; fy?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "pnl";
  const current = fyStartYear(new Date());
  const fy = Number(sp.fy) || current;
  const months = fyMonths(fy);
  const L = await ledger(months[0], months[months.length - 1]);
  const T = L.totals;
  const link = (patch: { tab?: string; fy?: number }) => `/reports?tab=${patch.tab ?? tab}&fy=${patch.fy ?? fy}`;

  return (
    <>
      <PageHeader
        title="Finance reports"
        subtitle={`${fyLabel(fy)} (April–March) · books in ₹ · unbilled months at ₹${L.fx}/$`}
        actions={
          <div className="flex flex-wrap gap-2">
            {[current - 2, current - 1, current].map((y) => (
              <Link key={y} href={link({ fy: y })} className={y === fy ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{fyLabel(y)}</Link>
            ))}
            <Link href={`/api/export?kind=pnl&fy=${fy}`} className="btn-secondary btn-sm">⇩ P&L CSV</Link>
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Service revenue" value={inr(T.revenueInr)} hint={usd0(T.revenueUsd)} accent />
        <Stat label="Spend" value={inr(T.spendTotal)} hint={T.revenueInr ? `${pct(T.spendTotal / T.revenueInr)} of revenue` : undefined} />
        <Stat label="Net profit" value={<span className={T.net < 0 ? "text-red-600" : ""}>{inr(T.net)}</span>} hint={T.revenueInr ? `${pct(T.net / T.revenueInr, 1)} margin` : undefined} />
        <Stat label="Realised FX" value={inr(T.fxGainInr)} hint="Gain (+) / loss (−) on receipts" />
        <Stat label="Net cash" value={inr(T.cashIn - T.cashOut)} hint={`In ${inr(T.cashIn)} · out ${inr(T.cashOut)}`} />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-neutral-200">
        {TABS.map((t) => (
          <Link key={t.key} href={link({ tab: t.key })} className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-semibold text-brand-fg" : "border-transparent text-neutral-600 hover:text-ink"}`}>{t.label}</Link>
        ))}
      </div>

      {tab === "pnl" && (
        <div className="space-y-6">
          <FlowChart title="Monthly revenue, spend and net profit" names={["Revenue (incl. pass-through)", "Spend (incl. pass-through)", "Net profit"]} data={L.months.map((m) => ({ label: monthLabel(m.month), a: m.revenueInr + m.ptRecoveredInr, b: m.spendTotal + m.ptCostInr, c: m.net }))} />
          <div className="card overflow-x-auto">
            <div className="card-h"><div className="card-t">Budget vs actual — 65 / 10 / 25 model</div><span className="text-xs text-neutral-500">Budget = revenue × each project&apos;s allocation snapshot</span></div>
            <table className="tbl">
              <thead><tr><th>Bucket</th><th className="num">Plan %</th><th className="num">Budget</th><th className="num">Actual</th><th className="num">Actual %</th><th className="num">Variance</th><th>Use</th></tr></thead>
              <tbody>
                {L.variance.map((v) => {
                  const use = v.budget ? v.actual / v.budget : 0;
                  return (
                    <tr key={v.key}>
                      <td className="font-medium">{v.name}{v.isProfit && <span className="ml-1 text-xs text-neutral-500">(net profit)</span>}</td>
                      <td className="num">{v.percent}%</td>
                      <td className="num">{inr(v.budget)}</td>
                      <td className="num font-semibold">{inr(v.actual)}</td>
                      <td className="num">{pct(v.actualPct, 1)}</td>
                      <td className={`num font-semibold ${v.variance >= 0 ? "text-emerald-700" : "text-red-600"}`}>{v.variance >= 0 ? "+" : ""}{inr(v.variance)}</td>
                      <td className="w-40">
                        <div className="h-2 rounded bg-neutral-100"><div className={`h-2 rounded ${v.isProfit ? (use >= 1 ? "bg-emerald-600" : "bg-amber-500") : use > 1 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${Math.min(100, Math.max(0, use * 100))}%` }} /></div>
                      </td>
                    </tr>
                  );
                })}
                {L.unmappedSpend > 0 && <tr><td className="text-amber-700">Unmapped categories</td><td></td><td></td><td className="num">{inr(L.unmappedSpend)}</td><td colSpan={3} className="text-xs text-amber-700">Map these categories to a bucket</td></tr>}
              </tbody>
            </table>
            <p className="px-5 py-3 text-xs text-neutral-500">Variance: positive = under budget (spend) or above plan (profit). Bank charges on receipts are counted in Corporate Ops. Pass-through costs and recoveries sit outside the model.</p>
          </div>
          <div className="card overflow-x-auto">
            <div className="card-h"><div className="card-t">Monthly P&L (₹)</div></div>
            <table className="tbl [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr><th>Month</th><th className="num">Revenue $</th><th className="num">Revenue ₹</th>{L.buckets.filter((b) => !b.isProfit).map((b) => <th key={b.key} className="num" title={b.name}>{b.name.split(" ")[0]}</th>)}<th className="num">Pass-through net</th><th className="num">FX</th><th className="num">Net profit</th></tr>
              </thead>
              <tbody>
                {L.months.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="num">{usd0(m.revenueUsd)}</td>
                    <td className="num">{inr(m.revenueInr)}</td>
                    {L.buckets.filter((b) => !b.isProfit).map((b) => <td key={b.key} className="num text-neutral-600">{inr(m.spend[b.key] ?? 0)}</td>)}
                    <td className="num">{inr(m.ptRecoveredInr - m.ptCostInr)}</td>
                    <td className="num">{inr(m.fxGainInr)}</td>
                    <td className={`num font-semibold ${m.net < 0 ? "text-red-600" : ""}`}>{inr(m.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL</td><td className="num">{usd0(T.revenueUsd)}</td><td className="num">{inr(T.revenueInr)}</td>
                  {L.buckets.filter((b) => !b.isProfit).map((b) => <td key={b.key} className="num">{inr(L.variance.find((v) => v.key === b.key)?.actual ?? 0)}</td>)}
                  <td className="num">{inr(T.ptRecoveredInr - T.ptCostInr)}</td><td className="num">{inr(T.fxGainInr)}</td><td className="num">{inr(T.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {tab === "cash" && <CashTab L={L} />}
      {tab === "receivables" && <ReceivablesTab />}

      {tab === "projects" && (
        <div className="card overflow-x-auto">
          <div className="card-h"><div className="card-t">Project profitability — {fyLabel(fy)}</div></div>
          <table className="tbl">
            <thead>
              <tr><th>Project</th><th>Client</th><th className="num">Revenue</th><th className="num">Hrs billed / logged</th><th className="num">People cost</th><th className="num">Direct exp.</th><th className="num">Pass-through net</th><th className="num">Margin</th><th className="num">Margin %</th><th className="num">People cost ÷ revenue</th></tr>
            </thead>
            <tbody>
              {L.projects.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/projects/${x.id}?tab=team`} className="text-brand-fg hover:underline"><span className="font-mono text-xs">{x.code}</span> {x.name}</Link></td>
                  <td>{x.client}</td>
                  <td className="num">{inr(x.revenueInr)}<div className="text-xs text-neutral-500">{usd0(x.revenueUsd)}</div></td>
                  <td className="num">{x.hoursBilled} / {x.hoursLogged}</td>
                  <td className="num">{inr(x.laborInr)}</td>
                  <td className="num">{inr(x.directInr)}</td>
                  <td className="num">{inr(x.ptNetInr)}</td>
                  <td className={`num font-semibold ${x.margin < 0 ? "text-red-600" : ""}`}>{inr(x.margin)}</td>
                  <td className="num">{pct(x.marginPct, 1)}</td>
                  <td className={`num ${x.deliveryRatio != null && x.deliveryRatio > x.deliveryPct / 100 ? "font-semibold text-red-600" : ""}`}>{pct(x.deliveryRatio)} <span className="text-xs text-neutral-500">/ {x.deliveryPct}%</span></td>
                </tr>
              ))}
              {L.projects.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-neutral-500">No revenue or cost recorded in this year.</td></tr>}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-neutral-500">People cost = timesheet hours × each person&apos;s ₹/hr at the time. It should stay within the project&apos;s Delivery share (red when above). Company margin after Growth and Corporate buckets is on the P&L tab.</p>
        </div>
      )}

      <div className="mt-6 card p-5">
        <div className="card-t mb-2">Exports for the CA (CSV, {fyLabel(fy)})</div>
        <div className="flex flex-wrap gap-2">
          {[["invoices", "Invoices (sales register)"], ["payments", "Payments / FIRC"], ["expenses", "Expenses (purchase register)"], ["timesheets", "Timesheets"], ["pnl", "Monthly P&L"]].map(([k, l]) => (
            <Link key={k} href={`/api/export?kind=${k}&fy=${fy}`} className="btn-secondary btn-sm">⇩ {l}</Link>
          ))}
        </div>
      </div>
    </>
  );
}

function CashTab({ L }: { L: Awaited<ReturnType<typeof ledger>> }) {
  let running = 0;
  const rows = L.months.map((m) => ({ ...m, cumulative: (running += m.cashNet) }));
  return (
    <div className="space-y-6">
      <FlowChart title="Cash in vs out, with cumulative net" names={["Receipts (₹ credited)", "Payments (incl. GST)", "Cumulative net"]} data={rows.map((r) => ({ label: monthLabel(r.month), a: r.cashIn, b: r.cashOut, c: r.cumulative }))} />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Month</th><th className="num">Receipts</th><th className="num">Payments</th><th className="num">Net</th><th className="num">Cumulative</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}><td>{monthLabel(r.month)}</td><td className="num">{inr(r.cashIn)}</td><td className="num">{inr(r.cashOut)}</td><td className={`num ${r.cashNet < 0 ? "text-red-600" : ""}`}>{inr(r.cashNet)}</td><td className="num font-semibold">{inr(r.cumulative)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-neutral-500">Cash basis: receipts on the date credited, expenses on their paid date (unpaid bills are excluded until marked paid).</p>
      </div>
    </div>
  );
}

async function ReceivablesTab() {
  const open = await receivables();
  const byClient = new Map<string, { name: string; buckets: Record<string, number>; total: number }>();
  for (const i of open) {
    const c = byClient.get(i.client.id) ?? { name: i.client.name, buckets: {}, total: 0 };
    c.buckets[i.aging] = (c.buckets[i.aging] ?? 0) + i.balance;
    c.total += i.balance;
    byClient.set(i.client.id, c);
  }
  const col = (a: string) => open.filter((i) => i.aging === a).reduce((s, i) => s + i.balance, 0);
  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">Aging by client (US$, days past due)</div></div>
        <table className="tbl">
          <thead><tr><th>Client</th>{AGING.map((a) => <th key={a} className="num">{a}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>
            {[...byClient.values()].sort((a, b) => b.total - a.total).map((c) => (
              <tr key={c.name}><td>{c.name}</td>{AGING.map((a) => <td key={a} className={`num ${a !== "Not due" && c.buckets[a] ? "text-red-600" : ""}`}>{c.buckets[a] ? usd(c.buckets[a]) : "—"}</td>)}<td className="num font-semibold">{usd(c.total)}</td></tr>
            ))}
            {open.length === 0 && <tr><td colSpan={AGING.length + 2} className="py-8 text-center text-neutral-500">Nothing outstanding.</td></tr>}
          </tbody>
          {open.length > 0 && <tfoot><tr><td>TOTAL</td>{AGING.map((a) => <td key={a} className="num">{usd(col(a))}</td>)}<td className="num">{usd(open.reduce((s, i) => s + i.balance, 0))}</td></tr></tfoot>}
        </table>
      </div>
      <div className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">Open invoices</div></div>
        <table className="tbl">
          <thead><tr><th>Invoice</th><th>Client</th><th>Project</th><th>Due</th><th>Aging</th><th className="num">Total</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {open.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/invoices/${i.id}`} className="font-mono text-xs text-brand-fg hover:underline">{i.number}</Link></td>
                <td>{i.client.name}</td><td className="font-mono text-xs">{i.project?.code ?? "—"}</td>
                <td>{date(i.dueDate)}</td><td>{i.aging}</td><td className="num">{usd(i.total)}</td><td className="num font-semibold">{usd(i.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
