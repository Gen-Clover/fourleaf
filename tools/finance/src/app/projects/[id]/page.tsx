import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getBuckets, getParams, getPaySettings, parseSnapshot } from "../../../lib/settings";
import { MODELS, bucketTotal, effectiveRate, floorRate, lineHours, plannedMonthly, premiumRates, quoteSummary, split } from "../../../lib/calc";
import { KIND_LABEL, currentMonth, date, inr, money, monthLabel, pct } from "@genclover/ui/format";
import { fxFor, ymd } from "../../../lib/finance";
import ResourceEditor from "./ResourceEditor";
import { AgreementForm } from "./ProjectForms";
import MonthEditor, { type MonthData } from "./MonthEditor";
import MilestoneBilling from "./MilestoneBilling";
import { deleteMonth, deleteProject, refreshSnapshot } from "../actions";
import { createInvoiceFromMonth } from "../../invoices/actions";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "pricing", label: "Resources & Quote" },
  { key: "agreement", label: "Agreement" },
  { key: "milestones", label: "Milestone billing" },
  { key: "monthly", label: "Monthly billing" },
  { key: "profit", label: "Profitability" },
];

/**
 * A project's commercials (finance only): quote, agreed terms, milestone and monthly billing, profitability.
 * Delivery (scope, milestones, team, hours) is on the project page in Delivery & Resources.
 */
export default async function ProjectCommercialsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const user = await requireUser();
  const canEdit = can(user.role, "finance.edit");

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: { select: { name: true } },
      resources: { orderBy: { sortOrder: "asc" } },
      months: { orderBy: { month: "desc" }, include: { lines: true, invoice: { select: { id: true, number: true, status: true, fxRate: true } } } },
      milestones: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, status: true, dueDate: true, acceptanceRef: true, billingAmount: true, invoiceId: true } },
      agreements: { where: { type: { in: ["SOW", "RESOURCE", "SUPPORT", "CR"] }, status: { in: ["SIGNED", "ACTIVE"] } }, select: { code: true, type: true, value: true, currency: true } },
    },
  });
  if (!project) notFound();
  const cur = project.currency;
  const m$ = (n: number, digits = 0) => money(n, cur, digits);

  const [p, currentBuckets, roles, pay, milestoneInvoices] = await Promise.all([
    getParams(),
    getBuckets(),
    tab === "pricing" ? prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }) : [],
    getPaySettings(),
    prisma.invoice.findMany({ where: { id: { in: project.milestones.map((m) => m.invoiceId).filter((x): x is string => !!x) } }, select: { id: true, number: true, status: true } }),
  ]);
  const fx = fxFor(cur, p.fxRate);
  const cost = tab === "profit" || tab === "overview" ? await projectCost(project.id, fx, pay.overheadPerHourInr) : null;
  const buckets = parseSnapshot(project.allocationSnapshot);
  const snapshotDiffers = JSON.stringify(buckets) !== JSON.stringify(currentBuckets);
  const q = quoteSummary(project.resources);
  const planned = plannedMonthly(project, project.resources);
  const monthBilled = project.months.reduce((s, m) => s + m.revenue, 0);
  const milestoneBilled = project.milestones.filter((m) => m.invoiceId && milestoneInvoices.find((i) => i.id === m.invoiceId)?.status !== "VOID").reduce((s, m) => s + (m.billingAmount ?? 0), 0);
  const billed = monthBilled + milestoneBilled;
  const paid = project.months.filter((m) => m.status === "PAID").reduce((s, m) => s + m.revenue, 0);
  const outstanding = project.months.filter((m) => m.status === "INVOICED").reduce((s, m) => s + m.revenue, 0);
  const billedSplit = split(billed, buckets);
  const contractValue = project.agreements.reduce((s, a) => s + (a.value ?? 0), 0) || null;

  const projectDto = {
    id: project.id,
    name: project.name,
    clientId: project.clientId,
    kind: project.kind,
    status: project.status,
    engagementModel: project.engagementModel,
    startDate: project.startDate?.toISOString() ?? null,
    endDate: project.endDate?.toISOString() ?? null,
    description: project.description,
    probability: project.probability,
    expectedCloseDate: project.expectedCloseDate?.toISOString() ?? null,
    agreedAt: project.agreedAt?.toISOString() ?? null,
    agreedMonthly: project.agreedMonthly,
    agreedBlendedRate: project.agreedBlendedRate,
    agreedRetainerHrs: project.agreedRetainerHrs,
    agreedExtraRate: project.agreedExtraRate,
    agreementNotes: project.agreementNotes,
  };

  let monthEditor: { initial: MonthData; isNew: boolean; invoice: { id: string; number: string; status: string } | null } | null = null;
  if (tab === "monthly" && sp.month) {
    const existing = project.months.find((m) => m.month === sp.month);
    if (existing) {
      monthEditor = {
        isNew: false,
        invoice: existing.invoice,
        initial: { month: existing.month, adjustment: existing.adjustment, notes: existing.notes ?? "", lines: existing.lines.map((l) => ({ resourceId: l.resourceId, label: l.label, hours: l.hours, rate: l.rate })) },
      };
    } else if (sp.month === "new" && canEdit) {
      const last = project.months[0]?.month;
      let next = currentMonth();
      if (last) {
        const [y, mo] = last.split("-").map(Number);
        const dt = new Date(y, mo, 1);
        next = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      }
      monthEditor = {
        isNew: true,
        invoice: null,
        initial: { month: next, adjustment: 0, notes: "", lines: project.resources.map((r) => ({ resourceId: r.id, label: r.headcount > 1 ? `${r.label} ×${r.headcount}` : r.label, hours: lineHours(r), rate: effectiveRate(r) })) },
      };
    }
  }

  return (
    <>
      <PageHeader
        title={`${project.name} · commercials`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/finance/projects" className="hover:underline">← Projects</Link>·<span className="font-mono text-xs">{project.code}</span>·
            <Link href={`/clients/${project.clientId}`} className="text-brand-fg hover:underline">{project.client.name}</Link>·
            <StatusBadge status={project.status} />·<span>{MODELS[project.engagementModel] ?? project.engagementModel}</span>·<span>{cur}</span>
            {project.kind !== "PROJECT" && <>·<span>{KIND_LABEL[project.kind]}</span></>}
          </span>
        }
        actions={
          <>
            <Link href={`/projects/${project.id}`} className="btn-secondary">Delivery view →</Link>
            <Link href={`/projects/${project.id}/quote`} className="btn-secondary" target="_blank">Client quote (print)</Link>
            {can(user.role, "admin") && (
              <form action={deleteProject.bind(null, project.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />
      {!canEdit && <ReadOnlyNote />}

      <div className="mb-5 flex flex-wrap gap-x-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link key={t.key} href={`/finance/projects/${project.id}?tab=${t.key}`} className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-semibold text-brand-fg" : "border-transparent text-neutral-600 hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Planned hrs / month" value={q.hours} hint={`${project.resources.length} resource lines`} />
            {project.engagementModel === "FIXED_PRICE" ? (
              <Stat label="Contract value (signed SOW / CR)" value={contractValue != null ? m$(contractValue) : "—"} hint={project.agreements.map((a) => a.code).join(", ") || "No signed SOW with a value"} />
            ) : (
              <Stat label="Agreed / mo" value={m$(planned)} hint={q.standard ? `Standard ${m$(q.standard)} · floor ${m$(q.floor)}` : undefined} />
            )}
            <Stat label="Billed to date" value={m$(billed)} hint={`${project.months.length} month(s) · ${m$(milestoneBilled)} by milestones`} accent />
            <Stat label="Outstanding (months)" value={m$(outstanding)} hint={`Paid ${m$(paid)}`} />
            {cost && <Stat label="Margin after overhead" value={<span className={cost.marginAfterOverhead < 0 ? "text-red-600" : ""}>{inr(cost.marginAfterOverhead)}</span>} hint={cost.revenueInr ? `${pct(cost.marginAfterOverhead / cost.revenueInr, 1)} of revenue` : "no revenue yet"} />}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-5">
              <div className="card-t mb-3">Allocation — agreed monthly</div>
              <SplitList amount={planned} buckets={buckets} currency={cur} />
            </div>
            <div className="card p-5">
              <div className="card-t mb-3">Allocation — billed to date</div>
              <SplitList amount={billed} buckets={buckets} currency={cur} />
              <p className="mt-3 text-xs text-neutral-500">
                Delivery {m$(billedSplit.delivery)} · Growth {m$(billedSplit.growth)} · Corporate {m$(billedSplit.corporate)} (profit {m$(billedSplit.profit)})
              </p>
            </div>
          </div>
          <div className="card p-5 text-sm text-neutral-600">
            <div className="card-t mb-2">Record</div>
            Created {date(project.createdAt)} by {project.createdBy?.name ?? "—"} · Agreed {date(project.agreedAt)} · Allocation snapshot {buckets.map((b) => `${b.percent}`).join("/")} ({bucketTotal(buckets)}%)
            {snapshotDiffers && (
              <span className="ml-2 text-amber-700">
                — differs from the current model.
                {can(user.role, "finance.settings") && (
                  <form action={refreshSnapshot.bind(null, project.id)} className="ml-2 inline">
                    <button className="underline">Apply current model</button>
                  </form>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <ResourceEditor
          projectId={project.id}
          readOnly={!canEdit}
          buckets={buckets}
          packages={{ blendedRate: p.blendedRate, retainerAmount: p.retainerAmount, retainerHours: p.retainerHours, additionalHourRate: p.additionalHourRate }}
          roles={roles.map((r) => ({ id: r.id, name: r.name, family: r.family, standardRate: r.standardRate, floor: floorRate(r, p), premium: premiumRates(r.standardRate, p).min }))}
          initial={project.resources.map((r) => ({ id: r.id, roleId: r.roleId, label: r.label, headcount: r.headcount, hoursPerMonth: r.hoursPerMonth, tier: r.tier, quotedRate: r.quotedRate, agreedRate: r.agreedRate, standardRate: r.standardRate, floorRate: r.floorRate }))}
        />
      )}

      {tab === "agreement" && <AgreementForm project={projectDto} resources={project.resources} buckets={buckets} readOnly={!canEdit} />}

      {tab === "milestones" && (
        <MilestoneBilling
          projectId={project.id}
          currency={cur}
          canEdit={canEdit}
          contractValue={contractValue}
          rows={project.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            dueDate: m.dueDate ? ymd(m.dueDate) : null,
            acceptanceRef: m.acceptanceRef,
            billingAmount: m.billingAmount,
            invoice: milestoneInvoices.find((i) => i.id === m.invoiceId) ?? null,
          }))}
        />
      )}

      {tab === "monthly" && (
        <div className="space-y-6">
          {monthEditor ? (
            <MonthEditor key={sp.month} projectId={project.id} agreement={project} buckets={buckets} initial={monthEditor.initial} isNew={monthEditor.isNew} readOnly={!canEdit} invoice={monthEditor.invoice} />
          ) : (
            canEdit && (
              <div className="flex justify-end">
                <Link href={`/finance/projects/${project.id}?tab=monthly&month=new`} className="btn-primary">+ Add month</Link>
              </div>
            )
          )}
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Month</th><th>Status</th><th>Invoice</th><th className="num">Hours billed</th><th className="num">Revenue</th>
                  {buckets.map((b) => <th key={b.key} className="num" title={b.name}>{b.name.split(" ")[0]}</th>)}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {project.months.map((m) => {
                  const s = split(m.revenue, buckets);
                  return (
                    <tr key={m.id}>
                      <td className="font-medium whitespace-nowrap">{monthLabel(m.month)}</td>
                      <td><StatusBadge status={m.status} /></td>
                      <td>{m.invoice ? <Link href={`/invoices/${m.invoice.id}`} className="font-mono text-xs text-brand-fg hover:underline">{m.invoice.number}</Link> : "—"}</td>
                      <td className="num">{m.hours}</td>
                      <td className="num font-semibold">{m$(m.revenue, 2)}</td>
                      {s.lines.map((l) => <td key={l.key} className="num text-neutral-600">{m$(l.amount)}</td>)}
                      <td className="space-x-1 whitespace-nowrap">
                        <Link href={`/finance/projects/${project.id}?tab=monthly&month=${m.month}`} className="btn-secondary btn-sm">{canEdit && !m.invoice ? "Edit" : "View"}</Link>
                        {canEdit && !m.invoice && (
                          <form action={createInvoiceFromMonth.bind(null, project.id, m.month)} className="inline"><button className="btn-primary btn-sm">Create invoice</button></form>
                        )}
                        {canEdit && !m.invoice && (
                          <form action={deleteMonth.bind(null, project.id, m.month)} className="inline"><button className="btn-danger btn-sm">Delete</button></form>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {project.months.length === 0 && <tr><td colSpan={6 + buckets.length} className="py-8 text-center text-neutral-500">No monthly records yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500">&quot;Fill from timesheets&quot; in the month editor uses approved billed hours: each person&apos;s billing basis (set on the Team tab of the delivery page) is already applied.</p>
        </div>
      )}

      {tab === "profit" && cost && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <Stat label="Revenue billed" value={inr(cost.revenueInr)} hint={m$(billed)} accent />
            <Stat label="People cost" value={inr(cost.laborInr)} hint={`${cost.hours} hrs worked (${cost.billableHours} billable)`} />
            <Stat label="Hours billed" value={cost.billedHours} hint={cost.billedHours !== cost.billableHours ? `vs ${cost.billableHours} billable hours worked` : "same as worked"} />
            <Stat label="Direct expenses" value={inr(cost.directInr)} hint={`Pass-through net ${inr(cost.ptNetInr)}`} />
            <Stat label="Overhead" value={inr(cost.overheadInr)} hint={pay.overheadPerHourInr ? `₹${pay.overheadPerHourInr}/hr × ${cost.hours} hrs` : "Set in Settings → Pay & approvals"} />
            <Stat label="Margin after overhead" value={<span className={cost.marginAfterOverhead < 0 ? "text-red-600" : ""}>{inr(cost.marginAfterOverhead)}</span>} hint={cost.revenueInr ? `${pct(cost.marginAfterOverhead / cost.revenueInr, 1)} · before overhead ${inr(cost.margin)}` : undefined} />
          </div>
          <div className="card overflow-x-auto">
            <div className="card-h"><div className="card-t">By person (all time)</div></div>
            <table className="tbl">
              <thead><tr><th>Person</th><th className="num">Hours worked</th><th className="num">Billable</th><th className="num">Billed to client</th><th className="num">Cost</th></tr></thead>
              <tbody>{cost.byPerson.map((x) => <tr key={x.name}><td>{x.name}</td><td className="num">{x.hours}</td><td className="num">{x.billable}</td><td className={`num ${x.billed !== x.billable ? "font-semibold text-violet-700" : ""}`}>{x.billed}</td><td className="num">{inr(x.cost)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500">Revenue in ₹ at each invoice&apos;s booking rate (₹{fx}/{cur === "INR" ? "₹" : "$"} for months not yet invoiced). People cost = hours worked × the ₹/hr saved when they were logged. Only owners, the CFO and the accountant see this page.</p>
        </div>
      )}
    </>
  );
}

/** All-time project revenue, cost and margin in ₹: timesheets (worked and billed hours), expenses, overhead. */
async function projectCost(projectId: string, fx: number, overheadPerHour: number) {
  const [months, entries, expenses, ptLines, msLines] = await Promise.all([
    prisma.monthlyRecord.findMany({ where: { projectId }, include: { invoice: { select: { fxRate: true, status: true } } } }),
    prisma.timeEntry.findMany({ where: { projectId }, include: { person: { select: { name: true } } } }),
    prisma.expense.findMany({ where: { projectId } }),
    prisma.invoiceLine.findMany({ where: { kind: "PASS_THROUGH", invoice: { projectId, status: { in: ["SENT", "PARTIAL", "PAID"] } } }, include: { invoice: { select: { fxRate: true } } } }),
    prisma.invoiceLine.findMany({ where: { kind: "MILESTONE", invoice: { projectId, status: { in: ["SENT", "PARTIAL", "PAID"] } } }, include: { invoice: { select: { fxRate: true } } } }),
  ]);
  const revenueInr =
    months.reduce((s, m) => s + m.revenue * (m.invoice && m.invoice.status !== "VOID" ? m.invoice.fxRate : fx), 0) + msLines.reduce((s, l) => s + l.amount * l.invoice.fxRate, 0);
  const laborInr = entries.reduce((s, e) => s + e.hours * e.costRateInr, 0);
  const directInr = expenses.filter((e) => !e.passThrough).reduce((s, e) => s + e.amountInr, 0);
  const ptNetInr = ptLines.reduce((s, l) => s + l.amount * l.invoice.fxRate, 0) - expenses.filter((e) => e.passThrough).reduce((s, e) => s + e.amountInr, 0);
  const people = new Map<string, { name: string; hours: number; billable: number; billed: number; cost: number }>();
  for (const e of entries) {
    const x = people.get(e.personId) ?? { name: e.person.name, hours: 0, billable: 0, billed: 0, cost: 0 };
    x.hours += e.hours;
    if (e.billable) {
      x.billable += e.hours;
      x.billed += e.billedHours ?? e.hours;
    }
    x.cost += e.hours * e.costRateInr;
    people.set(e.personId, x);
  }
  const hours = entries.reduce((s, e) => s + e.hours, 0);
  const overheadInr = hours * overheadPerHour;
  const margin = revenueInr + ptNetInr - laborInr - directInr;
  return {
    revenueInr,
    laborInr,
    directInr,
    ptNetInr,
    overheadInr,
    margin,
    marginAfterOverhead: margin - overheadInr,
    hours,
    billableHours: entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0),
    billedHours: entries.filter((e) => e.billable).reduce((s, e) => s + (e.billedHours ?? e.hours), 0),
    byPerson: [...people.values()].sort((a, b) => b.cost - a.cost),
  };
}

function SplitList({ amount, buckets, currency }: { amount: number; buckets: ReturnType<typeof parseSnapshot>; currency: string }) {
  const s = split(amount, buckets);
  return (
    <dl className="space-y-1.5 text-sm">
      {s.lines.map((l) => (
        <div key={l.key} className="flex items-center gap-3">
          <dt className="w-32 shrink-0 truncate text-neutral-600 sm:w-36 xl:w-56" title={`${l.name} (${l.percent}%)`}>{l.name} ({l.percent}%)</dt>
          <div className="h-2 min-w-8 flex-1 rounded bg-neutral-100">
            <div className={`h-2 rounded ${l.category === "DELIVERY" ? "bg-brand" : l.category === "GROWTH" ? "bg-amber-500" : "bg-neutral-500"}`} style={{ width: `${l.percent}%` }} />
          </div>
          <dd className="w-20 shrink-0 text-right tabular-nums sm:w-24">{money(l.amount, currency)}</dd>
        </div>
      ))}
    </dl>
  );
}
