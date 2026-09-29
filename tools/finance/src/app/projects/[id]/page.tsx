import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote, Stat, StatusBadge } from "@genclover/ui";
import { hasRole, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getBuckets, getParams, parseSnapshot } from "../../../lib/settings";
import { MODELS, bucketTotal, effectiveRate, floorRate, lineHours, plannedMonthly, premiumRates, quoteSummary, split } from "../../../lib/calc";
import { currentMonth, date, inr, monthLabel, pct, usd, usd0 } from "@genclover/ui/format";
import { monthRange, ymd } from "../../../lib/finance";
import ResourceEditor from "./ResourceEditor";
import { AgreementForm, ProjectInfoForm } from "./ProjectForms";
import MonthEditor, { type MonthData } from "./MonthEditor";
import { MilestoneEditor, TeamEditor } from "./DeliveryEditors";
import { deleteMonth, deleteProject, refreshSnapshot } from "../actions";
import { createInvoiceFromMonth } from "../../invoices/actions";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "pricing", label: "Resources & Quote" },
  { key: "agreement", label: "Agreement" },
  { key: "milestones", label: "Milestones" },
  { key: "team", label: "Team & Cost" },
  { key: "monthly", label: "Monthly Billing" },
];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const user = await requireUser();
  const canEdit = hasRole(user.role, "EDITOR");
  const isAdmin = user.role === "ADMIN";

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: { select: { name: true } },
      resources: { orderBy: { sortOrder: "asc" } },
      months: { orderBy: { month: "desc" }, include: { lines: true, invoice: { select: { id: true, number: true, status: true, fxRate: true } } } },
      milestones: { orderBy: { sortOrder: "asc" } },
      assignments: { include: { person: { select: { name: true } } } },
    },
  });
  if (!project) notFound();

  const [p, currentBuckets, clients, roles, people] = await Promise.all([
    getParams(),
    getBuckets(),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    tab === "milestones" || tab === "team" ? prisma.person.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const cost = tab === "team" ? await projectCost(project.id, currentMonth()) : null;
  const buckets = parseSnapshot(project.allocationSnapshot);
  const snapshotDiffers = JSON.stringify(buckets) !== JSON.stringify(currentBuckets);
  const q = quoteSummary(project.resources);
  const planned = plannedMonthly(project, project.resources);
  const billed = project.months.reduce((s, m) => s + m.revenue, 0);
  const paid = project.months.filter((m) => m.status === "PAID").reduce((s, m) => s + m.revenue, 0);
  const outstanding = project.months.filter((m) => m.status === "INVOICED").reduce((s, m) => s + m.revenue, 0);
  const billedSplit = split(billed, buckets);

  const projectDto = {
    id: project.id,
    name: project.name,
    clientId: project.clientId,
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

  // Monthly editor state
  let monthEditor: { initial: MonthData; isNew: boolean; invoice: { id: string; number: string; status: string } | null } | null = null;
  if (tab === "monthly" && sp.month) {
    const existing = project.months.find((m) => m.month === sp.month);
    if (existing) {
      monthEditor = {
        isNew: false,
        invoice: existing.invoice,
        initial: {
          month: existing.month,
          adjustment: existing.adjustment,
          notes: existing.notes ?? "",
          lines: existing.lines.map((l) => ({ resourceId: l.resourceId, label: l.label, hours: l.hours, rate: l.rate })),
        },
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
        initial: {
          month: next,
          adjustment: 0,
          notes: "",
          lines: project.resources.map((r) => ({ resourceId: r.id, label: r.headcount > 1 ? `${r.label} ×${r.headcount}` : r.label, hours: lineHours(r), rate: effectiveRate(r) })),
        },
      };
    }
  }

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{project.code}</span>·
            <Link href={`/clients/${project.clientId}`} className="text-brand-fg hover:underline">{project.client.name}</Link>·
            <StatusBadge status={project.status} />·<span>{MODELS[project.engagementModel]}</span>
          </span>
        }
        actions={
          <>
            <Link href={`/projects/${project.id}/quote`} className="btn-secondary" target="_blank">Client quote (print)</Link>
            {isAdmin && (
              <form action={deleteProject.bind(null, project.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />
      {!canEdit && <ReadOnlyNote />}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-neutral-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/projects/${project.id}?tab=${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-semibold text-brand-fg" : "border-transparent text-neutral-600 hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Planned hrs / month" value={q.hours} hint={`${project.resources.length} resource lines`} />
            <Stat label="Standard value / mo" value={usd0(q.standard)} hint={`Floor ${usd0(q.floor)}`} />
            <Stat label="Agreed / mo" value={usd0(planned)} hint={q.standard ? `${pct(1 - planned / q.standard, 1)} below standard` : undefined} accent />
            <Stat label="Billed to date" value={usd0(billed)} hint={`${project.months.length} month(s)`} />
            <Stat label="Outstanding" value={usd0(outstanding)} hint={`Paid ${usd0(paid)}`} />
          </div>
          <ProjectInfoForm project={projectDto} clients={clients} readOnly={!canEdit} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-5">
              <div className="card-t mb-3">Allocation — agreed monthly</div>
              <SplitList amount={planned} buckets={buckets} />
            </div>
            <div className="card p-5">
              <div className="card-t mb-3">Allocation — billed to date</div>
              <SplitList amount={billed} buckets={buckets} />
              <p className="mt-3 text-xs text-neutral-500">
                Delivery {usd0(billedSplit.delivery)} · Growth {usd0(billedSplit.growth)} · Corporate {usd0(billedSplit.corporate)} (profit {usd0(billedSplit.profit)})
              </p>
            </div>
          </div>
          <div className="card p-5 text-sm text-neutral-600">
            <div className="card-t mb-2">Record</div>
            Created {date(project.createdAt)} by {project.createdBy?.name ?? "—"} · Agreed {date(project.agreedAt)} · Allocation snapshot{" "}
            {buckets.map((b) => `${b.percent}`).join("/")} ({bucketTotal(buckets)}%)
            {snapshotDiffers && (
              <span className="ml-2 text-amber-700">
                — differs from the current model.
                {isAdmin && (
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
          initial={project.resources.map((r) => ({
            id: r.id,
            roleId: r.roleId,
            label: r.label,
            headcount: r.headcount,
            hoursPerMonth: r.hoursPerMonth,
            tier: r.tier,
            quotedRate: r.quotedRate,
            agreedRate: r.agreedRate,
            standardRate: r.standardRate,
            floorRate: r.floorRate,
          }))}
        />
      )}

      {tab === "agreement" && <AgreementForm project={projectDto} resources={project.resources} buckets={buckets} readOnly={!canEdit} />}

      {tab === "milestones" && (
        <MilestoneEditor
          projectId={project.id}
          readOnly={!canEdit}
          people={people}
          today={ymd(new Date())}
          initial={project.milestones.map((m) => ({ id: m.id, title: m.title, ownerId: m.ownerId, dueDate: m.dueDate ? ymd(m.dueDate) : null, status: m.status, notes: m.notes }))}
        />
      )}

      {tab === "team" && cost && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Revenue billed" value={inr(cost.revenueInr)} hint={usd0(billed)} accent />
            <Stat label="People cost" value={inr(cost.laborInr)} hint={`${cost.hours} hrs logged (${cost.billableHours} billable)`} />
            <Stat label="Direct expenses" value={inr(cost.directInr)} hint={`Pass-through net ${inr(cost.ptNetInr)}`} />
            <Stat label="Project margin" value={<span className={cost.margin < 0 ? "text-red-600" : ""}>{inr(cost.margin)}</span>} hint={cost.revenueInr ? `${pct(cost.margin / cost.revenueInr, 1)} of revenue` : undefined} />
            <Stat
              label="People cost ÷ revenue"
              value={<span className={cost.revenueInr && cost.laborInr / cost.revenueInr > split(100, buckets).delivery / 100 ? "text-red-600" : ""}>{cost.revenueInr ? pct(cost.laborInr / cost.revenueInr) : "—"}</span>}
              hint={`Delivery budget ${split(100, buckets).delivery}%`}
            />
          </div>
          <TeamEditor
            projectId={project.id}
            readOnly={!canEdit}
            people={people}
            resources={project.resources.map((r) => ({ id: r.id, label: r.label, hours: lineHours(r) }))}
            actuals={cost.monthHoursByPerson}
            initial={project.assignments.map((a) => ({ personId: a.personId, resourceId: a.resourceId, hoursPerMonth: a.hoursPerMonth, billable: a.billable }))}
          />
          {isAdmin && cost.byPerson.length > 0 && (
            <div className="card overflow-x-auto">
              <div className="card-h"><div className="card-t">Cost by person (all time)</div></div>
              <table className="tbl">
                <thead><tr><th>Person</th><th className="num">Hours</th><th className="num">Billable</th><th className="num">Cost</th></tr></thead>
                <tbody>{cost.byPerson.map((x) => <tr key={x.name}><td>{x.name}</td><td className="num">{x.hours}</td><td className="num">{x.billable}</td><td className="num">{inr(x.cost)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-neutral-500">Revenue at invoice booking FX (₹{p.fxRate}/$ for months not yet invoiced). People cost = timesheet hours × ₹/hr snapshotted when logged.</p>
        </div>
      )}

      {tab === "monthly" && (
        <div className="space-y-6">
          {monthEditor ? (
            <MonthEditor
              key={sp.month}
              projectId={project.id}
              agreement={project}
              buckets={buckets}
              initial={monthEditor.initial}
              isNew={monthEditor.isNew}
              readOnly={!canEdit}
              invoice={monthEditor.invoice}
            />
          ) : (
            canEdit && (
              <div className="flex justify-end">
                <Link href={`/projects/${project.id}?tab=monthly&month=new`} className="btn-primary">+ Add month</Link>
              </div>
            )
          )}
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Month</th><th>Status</th><th>Invoice</th><th className="num">Hours</th><th className="num">Revenue</th>
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
                      <td className="num font-semibold">{usd(m.revenue)}</td>
                      {s.lines.map((l) => <td key={l.key} className="num text-neutral-600">{usd0(l.amount)}</td>)}
                      <td className="space-x-1 whitespace-nowrap">
                        <Link href={`/projects/${project.id}?tab=monthly&month=${m.month}`} className="btn-secondary btn-sm">{canEdit && !m.invoice ? "Edit" : "View"}</Link>
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
                {project.months.length === 0 && (
                  <tr><td colSpan={6 + buckets.length} className="py-8 text-center text-neutral-500">No monthly records yet.</td></tr>
                )}
              </tbody>
              {project.months.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3}>TOTAL</td>
                    <td className="num">{project.months.reduce((s, m) => s + m.hours, 0)}</td>
                    <td className="num">{usd(billed)}</td>
                    {billedSplit.lines.map((l) => <td key={l.key} className="num">{usd0(l.amount)}</td>)}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/** All-time project cost from timesheets and tagged expenses; revenue at invoice FX. */
async function projectCost(projectId: string, month: string) {
  const { from, to } = monthRange(month);
  const [p, months, entries, expenses, ptLines] = await Promise.all([
    getParams(),
    prisma.monthlyRecord.findMany({ where: { projectId }, include: { invoice: { select: { fxRate: true, status: true } } } }),
    prisma.timeEntry.findMany({ where: { projectId }, include: { person: { select: { name: true } } } }),
    prisma.expense.findMany({ where: { projectId } }),
    prisma.invoiceLine.findMany({ where: { kind: "PASS_THROUGH", invoice: { projectId, status: { in: ["SENT", "PARTIAL", "PAID"] } } }, include: { invoice: { select: { fxRate: true } } } }),
  ]);
  const revenueInr = months.reduce((s, m) => s + m.revenue * (m.invoice && m.invoice.status !== "VOID" ? m.invoice.fxRate : p.fxRate), 0);
  const laborInr = entries.reduce((s, e) => s + e.hours * e.costRateInr, 0);
  const directInr = expenses.filter((e) => !e.passThrough).reduce((s, e) => s + e.amountInr, 0);
  const ptNetInr = ptLines.reduce((s, l) => s + l.amount * l.invoice.fxRate, 0) - expenses.filter((e) => e.passThrough).reduce((s, e) => s + e.amountInr, 0);
  const people = new Map<string, { name: string; hours: number; billable: number; cost: number }>();
  const monthHoursByPerson: Record<string, number> = {};
  for (const e of entries) {
    const x = people.get(e.personId) ?? { name: e.person.name, hours: 0, billable: 0, cost: 0 };
    x.hours += e.hours;
    if (e.billable) x.billable += e.hours;
    x.cost += e.hours * e.costRateInr;
    people.set(e.personId, x);
    if (e.date >= from && e.date < to) monthHoursByPerson[e.personId] = (monthHoursByPerson[e.personId] ?? 0) + e.hours;
  }
  return {
    revenueInr,
    laborInr,
    directInr,
    ptNetInr,
    margin: revenueInr + ptNetInr - laborInr - directInr,
    hours: entries.reduce((s, e) => s + e.hours, 0),
    billableHours: entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0),
    byPerson: [...people.values()].sort((a, b) => b.cost - a.cost),
    monthHoursByPerson,
  };
}

function SplitList({ amount, buckets }: { amount: number; buckets: ReturnType<typeof parseSnapshot> }) {
  const s = split(amount, buckets);
  return (
    <dl className="space-y-1.5 text-sm">
      {s.lines.map((l) => (
        <div key={l.key} className="flex items-center gap-3">
          <dt className="w-56 text-neutral-600">{l.name} ({l.percent}%)</dt>
          <div className="h-2 flex-1 rounded bg-neutral-100">
            <div className={`h-2 rounded ${l.category === "DELIVERY" ? "bg-brand" : l.category === "GROWTH" ? "bg-amber-500" : "bg-neutral-500"}`} style={{ width: `${l.percent}%` }} />
          </div>
          <dd className="w-24 text-right tabular-nums">{usd(l.amount)}</dd>
        </div>
      ))}
    </dl>
  );
}
