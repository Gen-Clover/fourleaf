import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { inr } from "@genclover/ui/format";
import { PAY_MODELS } from "../../lib/pay";

/** Everyone who works for Gen Clover: employees and contractors, one pool for all projects. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ type?: string; show?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const showPay = can(user.role, "cost.view");
  const people = await prisma.person.findMany({
    where: { ...(sp.type ? { type: sp.type } : {}), ...(sp.show === "all" ? {} : { active: true }) },
    orderBy: { name: "asc" },
    omit: { costInr: !showPay, tdsRatePct: !showPay, nextReviewDate: !showPay },
    include: {
      documents: { select: { status: true } },
      workOrders: { where: { status: { in: ["ISSUED", "ACTIVE"] } }, select: { id: true } },
      assignments: { where: { project: { status: { in: ["ACTIVE", "ON_HOLD"] } } }, select: { hoursPerMonth: true } },
    },
  });
  const link = (patch: Record<string, string>) => `/people?${new URLSearchParams({ ...(sp.type ? { type: sp.type } : {}), ...(sp.show ? { show: sp.show } : {}), ...patch })}`;
  return (
    <>
      <PageHeader
        title="People"
        subtitle="Employees (GCE-) and contractors (GCT-): documents, work orders, onboarding and exit. Pay is visible to owners, CFO and HR only."
        actions={can(user.role, "people.edit") && <Link href="/people/new" className="btn-primary">+ Add person</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={link({ type: "" })} className={!sp.type ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Everyone</Link>
        <Link href={link({ type: "EMPLOYEE" })} className={sp.type === "EMPLOYEE" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Employees</Link>
        <Link href={link({ type: "CONTRACTOR" })} className={sp.type === "CONTRACTOR" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Contractors</Link>
        <Link href={link({ show: sp.show === "all" ? "" : "all" })} className="btn-secondary btn-sm ml-auto">{sp.show === "all" ? "Active only" : "Include inactive"}</Link>
      </div>
      <div className="card overflow-x-auto">
        {people.length === 0 ? (
          <Empty href={can(user.role, "people.edit") ? "/people/new" : undefined} cta="Add a person">Nobody here yet.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Type</th><th className="hidden md:table-cell">Title</th><th className="num">Capacity</th><th className="num">Allocated</th>
                <th className="num hidden sm:table-cell">Docs signed</th><th className="num hidden sm:table-cell">Work orders</th>{showPay && <th className="hidden lg:table-cell">Pay</th>}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const allocated = p.assignments.reduce((s, a) => s + a.hoursPerMonth, 0);
                const signed = p.documents.filter((d) => d.status === "SIGNED").length;
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-xs">{p.code}</td>
                    <td><Link href={`/people/${p.id}`} className="font-medium text-brand-fg hover:underline">{p.name}</Link>{!p.active && <span className="ml-1 badge bg-neutral-100">inactive</span>}<div className="text-xs text-neutral-500">{p.email}</div></td>
                    <td><StatusBadge status={p.type} /></td>
                    <td className="hidden md:table-cell">{p.title ?? "—"}</td>
                    <td className="num">{p.stdHoursPerMonth}</td>
                    <td className={`num ${allocated > p.stdHoursPerMonth ? "font-semibold text-red-600" : ""}`}>{allocated}</td>
                    <td className={`num hidden sm:table-cell ${p.documents.length && signed < p.documents.length ? "text-amber-700" : ""}`}>{signed}/{p.documents.length}</td>
                    <td className="num hidden sm:table-cell">{p.workOrders.length}</td>
                    {showPay && (
                      <td className="hidden text-sm lg:table-cell">
                        {PAY_MODELS[p.payModel]?.label ?? p.payModel}
                        {p.payModel !== "FIXED_FEE" && <div className="text-xs text-neutral-500">{inr((p as { costInr?: number }).costInr ?? 0)}{p.payModel === "HOURLY" ? " / hr" : " / month"}</div>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
