import Link from "next/link";
import { PageHeader, Stat } from "@genclover/ui";
import { can, requireUser, roleLabel } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getParams, parseSnapshot } from "../../lib/settings";
import { MODELS, plannedMonthly, quoteSummary, split } from "../../lib/calc";
import { STATUS_LABEL, currentMonth, date, inr, money, monthLabel, usd0 } from "@genclover/ui/format";
import { monthRange, utcDay, ymd } from "../../lib/finance";
import { receivables } from "../../lib/ledger";
import { cfoSnapshot } from "../../lib/treasury";
import { computeAlerts } from "../../lib/alerts";
import { HBar, RevenueTrend, type TrendRow } from "./DashboardCharts";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const [projects, records, clientCount, fxParams] = await Promise.all([
    prisma.project.findMany({ include: { client: true, resources: true, months: { select: { month: true } } } }),
    prisma.monthlyRecord.findMany({ include: { project: { select: { allocationSnapshot: true, clientId: true, currency: true, client: { select: { name: true } } } } } }),
    prisma.client.count(),
    getParams(),
  ]);
  // This dashboard is in US$: ₹ projects and invoices are converted at the settings rate.
  const usd = (amount: number, currency: string) => (currency === "INR" ? amount / fxParams.fxRate : amount);

  const now = new Date();
  const thisMonth = currentMonth();
  const year = String(now.getFullYear());
  const last12 = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const trend = new Map<string, TrendRow>(last12.map((m) => [m, { label: monthLabel(m), delivery: 0, growth: 0, corporate: 0, profit: 0, total: 0 }]));
  let ytd = 0,
    ytdProfit = 0,
    ytdDelivery = 0,
    monthRev = 0,
    outstanding = 0;
  const byClient = new Map<string, number>();
  for (const r0 of records) {
    const r = { ...r0, revenue: usd(r0.revenue, r0.project.currency) };
    const s = split(r.revenue, parseSnapshot(r.project.allocationSnapshot));
    const row = trend.get(r.month);
    if (row) {
      row.delivery += s.delivery;
      row.growth += s.growth;
      row.corporate += s.corporate - s.profit;
      row.profit += s.profit;
      row.total += r.revenue;
    }
    if (r.month.startsWith(year)) {
      ytd += r.revenue;
      ytdProfit += s.profit;
      ytdDelivery += s.delivery;
    }
    if (r.month === thisMonth) monthRev += r.revenue;
    byClient.set(r.project.client.name, (byClient.get(r.project.client.name) ?? 0) + r.revenue);
  }

  const active = projects.filter((p) => p.status === "ACTIVE");
  const runRate = active.reduce((s, p) => s + usd(plannedMonthly(p, p.resources), p.currency), 0);
  const pipelineStatuses = ["DRAFT", "QUOTED", "NEGOTIATION"];
  const pipeline = projects.filter((p) => pipelineStatuses.includes(p.status)).reduce((s, p) => s + usd(plannedMonthly(p, p.resources), p.currency), 0);
  const byStatus = ["DRAFT", "QUOTED", "NEGOTIATION", "ACTIVE", "ON_HOLD"].map((st) => ({
    label: STATUS_LABEL[st],
    value: Math.round(projects.filter((p) => p.status === st).reduce((s, p) => s + usd(plannedMonthly(p, p.resources), p.currency), 0)),
  }));

  // Alerts
  const belowFloor = projects.filter((p) => !["COMPLETED", "CANCELLED"].includes(p.status) && quoteSummary(p.resources).belowFloor.length > 0);
  const missingMonth = active.filter((p) => !p.months.some((m) => m.month === thisMonth));
  const today = utcDay(ymd(now));
  const { from: mFrom, to: mTo } = monthRange(thisMonth);
  const [open, lateMilestones, spendMonth, payables, draftInvoices] = await Promise.all([
    receivables(),
    prisma.milestone.findMany({
      where: { status: { not: "DONE" }, dueDate: { not: null, lt: today }, project: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
      include: { project: { select: { id: true, code: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.expense.aggregate({ where: { date: { gte: mFrom, lt: mTo } }, _sum: { amountInr: true } }),
    prisma.expense.aggregate({ where: { paidOn: null }, _sum: { amountInr: true } }),
    prisma.invoice.count({ where: { status: "DRAFT" } }),
  ]);
  outstanding = open.reduce((s, i) => s + usd(i.balance, i.currency), 0);
  const overdue = open.filter((i) => i.aging !== "Not due");
  const canSeeFinance = can(user.role, "finance.view");
  const snap = canSeeFinance ? await cfoSnapshot() : null;
  const alerts = snap ? await computeAlerts(snap) : [];
  const critical = alerts.filter((a) => a.level === "critical");
  const warnings = alerts.filter((a) => a.level === "warning");

  return (
    <>
      {denied && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">That page isn&apos;t part of the {roleLabel(user.role)} role.</div>}
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle={`${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · signed in as ${roleLabel(user.role)}`}
        actions={can(user.role, "finance.edit") && <><Link href="/calculator" className="btn-secondary">Quick calculator</Link><Link href="/projects/new" className="btn-primary">+ New project</Link></>}
      />

      {snap && (
        <Link href="/cfo" className={`mb-6 block rounded-xl border px-4 py-3 transition hover:shadow ${critical.length ? "border-red-200 bg-red-50" : warnings.length ? "border-orange-200 bg-orange-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="font-semibold">
              {critical.length ? `🔴 ${critical.length} critical` : warnings.length ? `🟠 ${warnings.length} warning(s)` : "🟢 Financial position healthy"}
              {critical.length > 0 && warnings.length > 0 && ` · 🟠 ${warnings.length} warning(s)`}
            </span>
            <span className="tabular-nums text-neutral-700">
              Cash {inr(snap.bankCash)} · available {inr(snap.availableCash)} · runway {snap.survivalRunway == null ? "—" : `${snap.survivalRunway.toFixed(1)} mo`} → CFO dashboard
            </span>
          </div>
          {critical.slice(0, 3).map((a, i) => <div key={i} className="mt-1 text-xs text-red-800">{a.title} — {a.detail}</div>)}
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6">
        <Stat label="Monthly run-rate (active)" value={usd0(runRate)} hint={`${active.length} active project(s)`} accent />
        <Stat label="Pipeline / month" value={usd0(pipeline)} hint="Draft + Quoted + Negotiation" />
        <Stat label={`Billed ${monthLabel(thisMonth)}`} value={usd0(monthRev)} hint={`${missingMonth.length} active project(s) not recorded yet`} />
        <Stat label="Outstanding invoices" value={<Link href="/invoices" className="hover:underline">{usd0(outstanding)}</Link>} hint={`${overdue.length} overdue · ${draftInvoices} draft(s)`} />
        <Stat label={`Revenue ${year} YTD`} value={usd0(ytd)} />
        <Stat label="Delivery pool YTD" value={usd0(ytdDelivery)} />
        <Stat label="Retained profit YTD" value={usd0(ytdProfit)} />
        <Stat label="Clients / Projects" value={`${clientCount} / ${projects.length}`} />
        {canSeeFinance && (
          <>
            <Stat label={`Spend ${monthLabel(thisMonth)}`} value={<Link href="/expenses" className="hover:underline">{inr(spendMonth._sum.amountInr ?? 0)}</Link>} hint="Expenses booked, ₹" />
            <Stat label="Unpaid bills" value={inr(payables._sum.amountInr ?? 0)} hint="Payables not yet marked paid" />
            <Stat label="Overdue receivables" value={usd0(overdue.reduce((s, i) => s + usd(i.balance, i.currency), 0))} hint={`${open.length} open invoice(s)`} />
            <Stat label="Late milestones" value={lateMilestones.length} hint="Past due, not done" />
          </>
        )}
      </div>

      {(belowFloor.length > 0 || missingMonth.length > 0 || overdue.length > 0 || lateMilestones.length > 0) && (
        <div className="card mb-6 p-5">
          <div className="card-t mb-2">Needs attention</div>
          <ul className="space-y-1 text-sm">
            {belowFloor.map((p) => (
              <li key={`bf${p.id}`}>⚠ <Link href={`/finance/projects/${p.id}?tab=pricing`} className="text-brand-fg hover:underline">{p.code} {p.name}</Link> has rates below the negotiation floor.</li>
            ))}
            {missingMonth.map((p) => (
              <li key={`mm${p.id}`}>◷ <Link href={`/finance/projects/${p.id}?tab=monthly&month=new`} className="text-brand-fg hover:underline">{p.code} {p.name}</Link> — no billing record for {monthLabel(thisMonth)}.</li>
            ))}
            {overdue.map((i) => (
              <li key={`od${i.id}`}>$ <Link href={`/invoices/${i.id}`} className="text-brand-fg hover:underline">{i.number}</Link> ({i.client.name}) is {i.aging} days past due — balance {money(i.balance, i.currency)}.</li>
            ))}
            {lateMilestones.map((m) => (
              <li key={`ms${m.id}`}>◆ <Link href={`/projects/${m.project.id}?tab=milestones`} className="text-brand-fg hover:underline">{m.project.code}: {m.title}</Link> was due {date(m.dueDate)}.</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6"><RevenueTrend data={[...trend.values()]} /></div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <HBar title="Revenue by client (all time)" data={[...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value: Math.round(value) }))} />
        <HBar title="Monthly value by project status" valueLabel="Monthly value" data={byStatus} />
      </div>

      <div className="card overflow-x-auto">
        <div className="card-h"><div className="card-t">Active projects</div><Link href="/projects?status=ACTIVE" className="text-sm text-brand-fg">View all</Link></div>
        <table className="tbl">
          <thead><tr><th>ID</th><th>Project</th><th>Client</th><th>Model</th><th className="num">Hrs / mo</th><th className="num">Monthly</th><th>This month</th></tr></thead>
          <tbody>
            {active.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.code}</td>
                <td><Link href={`/finance/projects/${p.id}`} className="font-medium text-brand-fg hover:underline">{p.name}</Link></td>
                <td>{p.client.name}</td>
                <td className="text-xs">{MODELS[p.engagementModel]}</td>
                <td className="num">{quoteSummary(p.resources).hours}</td>
                <td className="num font-semibold">{usd0(usd(plannedMonthly(p, p.resources), p.currency))}</td>
                <td>{p.months.some((m) => m.month === thisMonth) ? <span className="badge bg-emerald-50 text-emerald-700">Recorded</span> : <span className="text-xs text-amber-700">Not recorded</span>}</td>
              </tr>
            ))}
            {active.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-500">No active projects.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
