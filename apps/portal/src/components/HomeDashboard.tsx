import Link from "next/link";
import { can, canAccessPath, type CurrentUser } from "@genclover/auth";
import { leadScope, opportunityScope } from "@genclover/lead-finder/lib/scope";
import { prisma } from "@genclover/db";
import { weekStart } from "@genclover/finance/lib/finance";
import { receivables } from "@genclover/finance/lib/ledger";
import { getParams } from "@genclover/finance/lib/settings";
import { cfoSnapshot } from "@genclover/finance/lib/treasury";
import { inr } from "@genclover/ui/format";

type Kpi = { label: string; value: React.ReactNode; hint?: string; href: string; alert?: boolean; count?: number };
type Area = { title: string; icon: string; href: string; kpis: Kpi[] };

const OPEN_OPPS = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];

/**
 * The figures for the portal home: one area per part of the business the role can see (the owner sees all of
 * them, which makes it the CEO dashboard), and "my work" for everyone. Figures a role can't see are never queried.
 * `count` marks a figure that needs action when it is above zero (it then appears under "Needs attention").
 */
async function homeData(user: CurrentUser) {
  const r = user.role;
  const now = new Date();
  const areas: Area[] = [];

  if (can(r, "leads.view")) {
    // Counts follow the Lead Finder's visibility: a seller's own deals, a manager's team, everything for owners.
    const [ls, os] = await Promise.all([leadScope(user), opportunityScope(user)]);
    const [openOpps, waiting, replied, values, p] = await Promise.all([
      prisma.opportunity.count({ where: { ...os, stage: { in: OPEN_OPPS } } }),
      prisma.opportunity.count({ where: { ...os, stage: "WON", onboardedAt: null } }),
      prisma.lead.count({ where: { ...ls, stage: "REPLIED" } }),
      can(r, "deals.all") ? prisma.opportunity.findMany({ where: { stage: { in: OPEN_OPPS }, value: { not: null } }, select: { value: true, currency: true, probability: true } }) : [],
      getParams(),
    ]);
    const weighted = values.reduce((s, o) => s + ((o.value ?? 0) * (o.currency === "USD" ? p.fxRate : 1) * (o.probability ?? 0)) / 100, 0);
    areas.push({
      title: "Sales",
      icon: "◎",
      href: "/leads",
      kpis: [
        { label: "Open opportunities", value: openOpps, href: "/leads/opportunities" },
        ...(can(r, "deals.all") ? [{ label: "Weighted pipeline", value: inr(weighted), hint: `₹ (US$ at ₹${p.fxRate})`, href: "/leads/opportunities" }] : []),
        { label: "Replies to answer", value: replied, href: "/leads/today", alert: replied > 0, count: replied },
        { label: "Won, not onboarded", value: waiting, href: "/leads/won", alert: waiting > 0, count: waiting },
      ],
    });
  }
  if (can(r, "clients.view")) {
    const [active, onboarding, renewals] = await Promise.all([
      prisma.client.count({ where: { status: "ACTIVE" } }),
      prisma.client.count({ where: { status: "ONBOARDING" } }),
      prisma.agreement.count({ where: { status: { in: ["SIGNED", "ACTIVE"] }, expiresAt: { not: null, lte: new Date(now.getTime() + 60 * 86_400_000) } } }),
    ]);
    areas.push({
      title: "Clients",
      icon: "◉",
      href: "/clients",
      kpis: [
        { label: "Active clients", value: active, href: "/clients?status=ACTIVE" },
        { label: "Being onboarded", value: onboarding, href: "/clients/onboarding" },
        { label: "Agreements to renew", value: renewals, hint: "next 60 days", href: "/agreements?view=renewals", alert: renewals > 0, count: renewals },
      ],
    });
  }
  if (can(r, "projects.view")) {
    const [active, late, submitted, people] = await Promise.all([
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.milestone.count({ where: { status: { not: "DONE" }, dueDate: { not: null, lt: now }, project: { status: "ACTIVE" } } }),
      can(r, "hours.approve") ? prisma.timesheetWeek.count({ where: { status: "SUBMITTED" } }) : 0,
      can(r, "resources.manage") ? prisma.person.findMany({ where: { active: true }, select: { stdHoursPerMonth: true, assignments: { where: { project: { status: { in: ["ACTIVE", "ON_HOLD"] } } }, select: { hoursPerMonth: true } } } }) : [],
    ]);
    const clashes = people.filter((p) => p.assignments.reduce((s, a) => s + a.hoursPerMonth, 0) > p.stdHoursPerMonth).length;
    areas.push({
      title: "Delivery",
      icon: "◧",
      href: "/delivery",
      kpis: [
        { label: "Active projects", value: active, href: "/projects?status=ACTIVE" },
        { label: "Late milestones", value: late, href: "/delivery", alert: late > 0, count: late },
        ...(can(r, "hours.approve") ? [{ label: "Timesheets to approve", value: submitted, href: "/timesheets/approve", alert: submitted > 0, count: submitted }] : []),
        ...(can(r, "resources.manage") ? [{ label: "Resource clashes", value: clashes, href: "/resources", alert: clashes > 0, count: clashes }] : []),
      ],
    });
  }
  if (can(r, "finance.view")) {
    const [snap, open, pending] = await Promise.all([cfoSnapshot(), receivables(), can(r, "finance.approve") ? prisma.approval.count({ where: { status: "PENDING" } }) : 0]);
    const overdue = open.filter((i) => i.aging !== "Not due");
    areas.push({
      title: "Finance",
      icon: "₹",
      href: "/finance",
      kpis: [
        { label: "Cash in the bank", value: inr(snap.bankCash), hint: `available ${inr(snap.availableCash)}`, href: "/cfo" },
        { label: "Receivable", value: inr(open.reduce((s, i) => s + i.balance * i.fxRate, 0)), hint: `${overdue.length} overdue`, href: "/invoices?status=SENT", alert: overdue.length > 0 },
        { label: "Runway", value: snap.survivalRunway == null ? "—" : `${snap.survivalRunway.toFixed(1)} mo`, href: "/cfo" },
        ...(can(r, "finance.approve") ? [{ label: "Approvals waiting", value: pending, href: "/approvals", alert: pending > 0, count: pending }] : []),
      ],
    });
    // Overdue invoices need chasing: listed under "Needs attention" as their own item.
    if (overdue.length) areas[areas.length - 1].kpis.push({ label: "Invoices overdue", value: overdue.length, href: "/invoices?status=SENT", alert: true, count: overdue.length });
  }
  if (can(r, "people.view")) {
    const [employees, contractors, unsigned] = await Promise.all([
      prisma.person.count({ where: { active: true, type: "EMPLOYEE" } }),
      prisma.person.count({ where: { active: true, type: "CONTRACTOR" } }),
      prisma.personDocument.count({ where: { status: { in: ["DRAFT", "SENT"] } } }),
    ]);
    areas.push({
      title: "People",
      icon: "☺",
      href: "/people",
      kpis: [
        { label: "Employees", value: employees, href: "/people?type=EMPLOYEE" },
        { label: "Contractors", value: contractors, href: "/people?type=CONTRACTOR" },
        { label: "Documents not signed", value: unsigned, href: "/people", alert: unsigned > 0, count: unsigned },
      ],
    });
  }
  if (can(r, "compliance.view")) {
    const items = await prisma.complianceItem.findMany({ where: { active: true }, select: { dueDate: true, remindDays: true } });
    const overdue = items.filter((i) => i.dueDate < now).length;
    const due = items.filter((i) => i.dueDate >= now && i.dueDate.getTime() - now.getTime() <= i.remindDays * 86_400_000).length;
    const issues = can(r, "issues.view") ? await prisma.issue.count({ where: { status: { not: "CLOSED" }, level: { gte: 3 } } }) : 0;
    areas.push({
      title: "Governance",
      icon: "§",
      href: "/governance",
      kpis: [
        { label: "Filings overdue", value: overdue, href: "/compliance", alert: overdue > 0, count: overdue },
        { label: "Filings due soon", value: due, href: "/compliance", count: due },
        ...(can(r, "issues.view") ? [{ label: "Issues at CEO / board level", value: issues, href: "/issues", alert: issues > 0, count: issues }] : []),
      ],
    });
  }

  // My work: this week's timesheet, my calls and meetings, my open issues.
  const me = await prisma.person.findFirst({ where: { email: { equals: user.email, mode: "insensitive" } }, select: { id: true } });
  const [week, tasks, myIssues] = await Promise.all([
    me ? prisma.timesheetWeek.findUnique({ where: { personId_weekStart: { personId: me.id, weekStart: weekStart(now) } } }) : null,
    prisma.leadTask.count({ where: { assigneeId: user.id, status: "OPEN" } }),
    prisma.issue.count({ where: { ownerId: user.id, status: { not: "CLOSED" } } }),
  ]);
  const mine: Kpi[] = [
    ...(me ? [{ label: "My timesheet this week", value: week ? `${week.hours} h` : "0 h", hint: week?.status === "APPROVED" ? "approved" : week?.status === "SUBMITTED" ? "submitted" : "not submitted", href: "/timesheets", alert: !week || week.status === "REJECTED" }] : []),
    ...(can(r, "leads.view") ? [{ label: "My calls & meetings", value: tasks, href: "/leads/tasks", count: tasks }] : []),
    ...(can(r, "issues.view") ? [{ label: "Issues I own", value: myIssues, href: "/issues", count: myIssues }] : []),
  ];
  return { areas, mine };
}

const Value = ({ k }: { k: Kpi }) => <span className={`font-semibold tabular-nums ${k.alert ? "text-amber-700" : "text-ink"}`}>{k.value}</span>;

/** Areas as compact cards (label and figure on one line), and what needs action in one list beside them. */
export default async function HomeDashboard({ user }: { user: CurrentUser }) {
  const { areas, mine } = await homeData(user);
  const attention = [
    ...mine.filter((k) => k.alert || (k.count ?? 0) > 0).map((k) => ({ ...k, area: "My work" })),
    ...areas.flatMap((a) => a.kpis.filter((k) => (k.count ?? 0) > 0 || (k.alert && k.count == null && k.label !== "Receivable")).map((k) => ({ ...k, area: a.title }))),
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow">Overview</h2>
          <span className="text-xs text-neutral-500">Click any figure to open it</span>
        </div>
        {areas.length === 0 ? (
          <p className="card p-5 text-sm text-neutral-600">Your work is under My work. Open a tool above to get started.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {areas.map((a) => (
              <div key={a.title} className="card flex flex-col">
                <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft text-xs text-brand-fg">{a.icon}</span>
                    <span className="card-t">{a.title}</span>
                  </span>
                  {canAccessPath(user.role, a.href) && <Link href={a.href} className="text-xs text-neutral-500 hover:text-brand-fg">Open →</Link>}
                </div>
                <ul className="flex-1 divide-y divide-neutral-100">
                  {a.kpis.map((k) => (
                    <li key={k.label}>
                      <Link href={k.href} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm transition-colors hover:bg-neutral-50" title={k.hint}>
                        <span className="min-w-0 truncate text-neutral-600">
                          {k.label}
                          {k.hint && <span className="ml-1.5 text-xs text-neutral-400">{k.hint}</span>}
                        </span>
                        <Value k={k} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="space-y-5">
        <section>
          <h2 className="eyebrow mb-2">Needs attention</h2>
          <div className="card">
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-neutral-600">
                <span className="h-2 w-2 rounded-full bg-emerald-600" /> All clear: nothing is waiting on you.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {attention.map((k) => (
                  <li key={`${k.area}-${k.label}`}>
                    <Link href={k.href} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-neutral-50">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${k.alert ? "bg-amber-500" : "bg-blue-500"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-neutral-800">{k.label}</span>
                        <span className="block text-xs text-neutral-500">{k.area}{k.hint ? ` · ${k.hint}` : ""}</span>
                      </span>
                      <Value k={k} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        {mine.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2">My work</h2>
            <div className="card divide-y divide-neutral-100">
              {mine.map((k) => (
                <Link key={k.label} href={k.href} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm transition-colors hover:bg-neutral-50">
                  <span className="text-neutral-600">
                    {k.label}
                    {k.hint && <span className="ml-1.5 text-xs text-neutral-400">{k.hint}</span>}
                  </span>
                  <Value k={k} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
