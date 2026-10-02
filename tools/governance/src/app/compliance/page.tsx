import { Empty, PageHeader } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { COMPLIANCE_CATEGORIES, complianceStatus, FREQUENCIES, periodFor } from "../../lib/governance";
import { AddItem, ComplianceRow } from "./ComplianceParts";

const ORDER = ["OVERDUE", "DUE", "UPCOMING", "CLOSED"];

/**
 * The compliance calendar: every filing and renewal with its next due date, owner and professional. Mark each
 * one filed with the acknowledgement and evidence; the next due date rolls forward. Reminders are emailed.
 */
export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = can(user.role, "compliance.edit");
  const [items, users] = await Promise.all([
    prisma.complianceItem.findMany({
      where: sp.category ? { category: sp.category } : {},
      orderBy: { dueDate: "asc" },
      include: { filings: { orderBy: { filedAt: "desc" }, take: 3 } },
    }),
    canEdit ? prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const rows = items.map((i) => ({ ...i, state: complianceStatus(i) })).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.dueDate.getTime() - b.dueDate.getTime());
  const count = (s: string) => rows.filter((r) => r.state === s).length;

  return (
    <>
      <PageHeader
        title="Compliance calendar"
        subtitle="GST, TDS, income tax, MCA, payroll and contract renewals. Confirm the exact dates for your company with your CA / CS; the list is a starting point."
        actions={canEdit && <AddItem users={users} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="badge bg-red-50 text-red-700">{count("OVERDUE")} overdue</span>
        <span className="badge bg-amber-50 text-amber-700">{count("DUE")} due soon</span>
        <span className="badge bg-neutral-100 text-neutral-700">{count("UPCOMING")} upcoming</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <a href="/compliance" className={!sp.category ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</a>
          {Object.entries(COMPLIANCE_CATEGORIES).map(([k, v]) => (
            <a key={k} href={`/compliance?category=${k}`} className={sp.category === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{v}</a>
          ))}
        </span>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <Empty>No compliance items. Seed the defaults (npm run db:seed) or add your own.</Empty>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rows.map((i) => (
              <ComplianceRow
                key={i.id}
                canEdit={canEdit}
                users={users}
                row={{
                  id: i.id,
                  name: i.name,
                  meta: [COMPLIANCE_CATEGORIES[i.category], i.authority, FREQUENCIES[i.frequency]?.label, `owner ${i.ownerName ?? "—"}`, i.professional].filter(Boolean).join(" · "),
                  notes: i.notes,
                  lastFiled: i.filings.length ? i.filings.map((f) => `${f.period} on ${date(f.filedAt)}${f.reference ? ` (${f.reference})` : ""}`).join(" · ") : null,
                  evidenceUrl: i.filings[0]?.evidenceUrl ?? null,
                  due: i.active ? `due ${date(i.dueDate)}` : "",
                  dueTone: i.state === "OVERDUE" ? "overdue" : i.state === "DUE" ? "due" : "",
                  state: i.state,
                  active: i.active,
                  period: periodFor(i.dueDate, i.frequency),
                }}
                item={{ id: i.id, name: i.name, category: i.category, authority: i.authority ?? "", frequency: i.frequency, dueDate: i.dueDate.toISOString().slice(0, 10), ownerId: i.ownerId ?? "", professional: i.professional ?? "", remindDays: String(i.remindDays), notes: i.notes ?? "" }}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
