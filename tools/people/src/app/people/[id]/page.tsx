import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Stat, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { inr, monthLabel, pct } from "@genclover/ui/format";
import { hourlyCost, OFFBOARDING_ITEMS, ONBOARDING_ITEMS, PAY_MODELS, parseList } from "../../../lib/pay";
import { deletePerson } from "../../actions";
import PersonForm from "../PersonForm";
import { Checklist, Documents, WorkOrders } from "./Parts";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "documents", label: "Documents" },
  { key: "work", label: "Projects & work orders" },
  { key: "checklists", label: "Onboarding & exit" },
];
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "profile";
  const user = await requireUser();
  const showPay = can(user.role, "cost.view");
  const canEdit = can(user.role, "people.edit");
  const person = await prisma.person.findUnique({
    where: { id },
    // Pay fields are read only for roles that see pay.
    omit: { costInr: !showPay, tdsRatePct: !showPay, gstRegistered: !showPay, nextReviewDate: !showPay },
    include: {
      documents: { orderBy: { createdAt: "asc" } },
      workOrders: { orderBy: { createdAt: "desc" }, omit: { fixedFeeInr: !showPay, feePaidInr: !showPay }, include: { project: { select: { code: true, name: true } } } },
      assignments: { include: { project: { select: { id: true, code: true, name: true, status: true } } } },
      timesheetWeeks: { orderBy: { weekStart: "desc" }, take: 8 },
    },
  });
  if (!person) notFound();
  const [roles, projects, monthly] = await Promise.all([
    prisma.roleRate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    tab === "work" ? prisma.project.findMany({ where: { status: { notIn: ["CANCELLED", "COMPLETED"] } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }) : [],
    prisma.timeEntry.findMany({ where: { personId: id, date: { gte: new Date(Date.now() - 190 * 86_400_000) } }, select: { date: true, hours: true, billable: true } }),
  ]);
  const byMonth = new Map<string, { hrs: number; bill: number }>();
  for (const e of monthly) {
    const k = e.date.toISOString().slice(0, 7);
    const r = byMonth.get(k) ?? { hrs: 0, bill: 0 };
    r.hrs += e.hours;
    if (e.billable) r.bill += e.hours;
    byMonth.set(k, r);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const allocated = person.assignments.filter((a) => ["ACTIVE", "ON_HOLD"].includes(a.project.status)).reduce((s, a) => s + a.hoursPerMonth, 0);
  const costPerHour = showPay ? hourlyCost({ payModel: person.payModel, costInr: (person as { costInr?: number }).costInr ?? 0, stdHoursPerMonth: person.stdHoursPerMonth }) : null;

  return (
    <>
      <PageHeader
        title={person.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/people" className="hover:underline">← People</Link>·<span className="font-mono text-xs">{person.code}</span>·<StatusBadge status={person.type} />
            {person.title && <>·<span>{person.title}</span></>}
            {!person.active && <span className="badge bg-neutral-100">Inactive</span>}
          </span>
        }
        actions={
          <>
            <Link href={`/timesheets?person=${person.id}`} className="btn-secondary">Timesheet</Link>
            {can(user.role, "cost.edit") && (
              <form action={deletePerson.bind(null, person.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Capacity" value={`${person.stdHoursPerMonth} hrs`} hint={`${allocated} allocated · ${person.stdHoursPerMonth - allocated} free`} accent />
        <Stat label="Documents signed" value={`${person.documents.filter((d) => d.status === "SIGNED").length} / ${person.documents.length}`} />
        <Stat label="Open work orders" value={person.workOrders.filter((w) => ["ISSUED", "ACTIVE"].includes(w.status)).length} />
        {showPay ? (
          <Stat label={PAY_MODELS[person.payModel]?.label ?? person.payModel} value={person.payModel === "FIXED_FEE" ? "per work order" : inr((person as { costInr?: number }).costInr ?? 0)} hint={costPerHour ? `≈ ${inr(costPerHour)} per hour of project time` : undefined} />
        ) : (
          <Stat label="Pay" value="—" hint="Visible to owners, CFO and HR" />
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-x-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link key={t.key} href={`/people/${person.id}?tab=${t.key}`} className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-semibold text-brand-fg" : "border-transparent text-neutral-600 hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "profile" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <PersonForm
            roles={roles}
            showPay={showPay}
            canPay={can(user.role, "cost.edit")}
            readOnly={!canEdit && !can(user.role, "cost.edit")}
            initial={{
              id: person.id,
              name: person.name,
              email: person.email ?? "",
              phone: person.phone ?? "",
              title: person.title ?? "",
              department: person.department ?? "",
              managerName: person.managerName ?? "",
              type: person.type,
              roleId: person.roleId ?? "",
              stdHoursPerMonth: String(person.stdHoursPerMonth),
              startDate: iso(person.startDate),
              endDate: iso(person.endDate),
              pan: person.pan ?? "",
              gstin: person.gstin ?? "",
              notes: person.notes ?? "",
              active: person.active,
              payModel: person.payModel,
              costInr: showPay ? String((person as { costInr?: number }).costInr ?? 0) : "",
              gstRegistered: showPay ? !!(person as { gstRegistered?: boolean }).gstRegistered : false,
              tdsRatePct: showPay && (person as { tdsRatePct?: number | null }).tdsRatePct != null ? String((person as { tdsRatePct?: number | null }).tdsRatePct) : "",
              nextReviewDate: showPay ? iso((person as { nextReviewDate?: Date | null }).nextReviewDate) : "",
            }}
          />
          <div className="card h-fit overflow-x-auto">
            <div className="card-h"><div className="card-t">Time logged</div></div>
            <table className="tbl">
              <thead><tr><th>Month</th><th className="num">Hours</th><th className="num">Billable</th><th className="num">Use</th></tr></thead>
              <tbody>
                {months.map(([m, r]) => <tr key={m}><td>{monthLabel(m)}</td><td className="num">{r.hrs}</td><td className="num">{r.bill}</td><td className="num">{pct(r.hrs / person.stdHoursPerMonth)}</td></tr>)}
                {months.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-neutral-500">No time logged.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <Documents
          personId={person.id}
          type={person.type}
          canEdit={canEdit}
          docs={person.documents.map((d) => ({ id: d.id, type: d.type, title: d.title, status: d.status, documentUrl: d.documentUrl, signedAt: d.signedAt?.toISOString() ?? null, expiresAt: d.expiresAt?.toISOString() ?? null, notes: d.notes }))}
        />
      )}

      {tab === "work" && (
        <div className="space-y-6">
          {person.type === "CONTRACTOR" ? (
            <WorkOrders
              personId={person.id}
              canEdit={canEdit}
              showFee={showPay}
              payModel={person.payModel}
              projects={projects.map((p) => ({ id: p.id, label: `${p.code} ${p.name}` }))}
              orders={person.workOrders.map((w) => ({
                id: w.id,
                code: w.code,
                projectId: w.projectId,
                projectLabel: `${w.project.code} ${w.project.name}`,
                role: w.role,
                expectedHoursPerMonth: w.expectedHoursPerMonth,
                startDate: w.startDate?.toISOString() ?? null,
                endDate: w.endDate?.toISOString() ?? null,
                payTreatment: w.payTreatment,
                fixedFeeInr: showPay ? ((w as { fixedFeeInr?: number | null }).fixedFeeInr ?? null) : null,
                status: w.status,
                documentUrl: w.documentUrl,
                reportingTo: w.reportingTo,
                notes: w.notes,
              }))}
            />
          ) : (
            <p className="text-sm text-neutral-600">Employees are assigned to projects by the delivery manager (project → Team), not by work orders.</p>
          )}
          <div className="card overflow-x-auto">
            <div className="card-h"><div className="card-t">Assigned projects</div></div>
            <table className="tbl">
              <thead><tr><th>Project</th><th>Status</th><th className="num">Hrs / month</th><th>Billable</th></tr></thead>
              <tbody>
                {person.assignments.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/projects/${a.project.id}?tab=team`} className="text-brand-fg hover:underline"><span className="font-mono text-xs">{a.project.code}</span> {a.project.name}</Link></td>
                    <td><StatusBadge status={a.project.status} /></td>
                    <td className="num">{a.hoursPerMonth}</td>
                    <td>{a.billable ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {person.assignments.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-neutral-500">Not assigned to a project.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "checklists" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Checklist personId={person.id} list="onboarding" title="Onboarding" items={ONBOARDING_ITEMS[person.type === "CONTRACTOR" ? "CONTRACTOR" : "EMPLOYEE"]} done={parseList(person.onboarding)} canEdit={canEdit} />
          <Checklist personId={person.id} list="offboarding" title="Exit / contract end" items={OFFBOARDING_ITEMS} done={parseList(person.offboarding)} canEdit={canEdit} />
        </div>
      )}
    </>
  );
}
