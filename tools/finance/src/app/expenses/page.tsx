import Link from "next/link";
import { PageHeader, Stat, StatusBadge } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getBuckets, getParams } from "../../lib/settings";
import { monthRange, ym, ymd } from "../../lib/finance";
import { date, inr, monthLabel, num } from "@genclover/ui/format";
import ExpenseForm from "./ExpenseForm";
import { deleteExpense, markExpensePaid } from "./actions";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; cat?: string; unpaid?: string; edit?: string }> }) {
  const user = await requireRole("EDITOR");
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : sp.month === "all" ? null : ym(new Date());
  const range = month ? monthRange(month) : null;

  const [expenses, categories, projects, buckets, p, payables, editing] = await Promise.all([
    prisma.expense.findMany({
      where: {
        ...(range ? { date: { gte: range.from, lt: range.to } } : {}),
        ...(sp.cat ? { categoryId: sp.cat } : {}),
        ...(sp.unpaid ? { paidOn: null } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { category: true, project: { select: { id: true, code: true } }, invoiceLines: { select: { invoiceId: true }, take: 1 } },
    }),
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.project.findMany({ where: { status: { notIn: ["CANCELLED"] } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }),
    getBuckets(),
    getParams(),
    prisma.expense.aggregate({ where: { paidOn: null }, _sum: { amountInr: true }, _count: true }),
    sp.edit ? prisma.expense.findUnique({ where: { id: sp.edit } }) : null,
  ]);
  const bucketName = (key: string | null) => (key == null ? "Pass-through" : (buckets.find((b) => b.key === key)?.name ?? `${key} (removed bucket)`));

  const total = expenses.reduce((s, e) => s + e.amountInr, 0);
  const gst = expenses.reduce((s, e) => s + e.gstInr, 0);
  const byBucket = new Map<string, number>();
  for (const e of expenses) byBucket.set(bucketName(e.category.bucketKey), (byBucket.get(bucketName(e.category.bucketKey)) ?? 0) + e.amountInr);
  const unbilledPass = expenses.filter((e) => e.passThrough && !e.invoiceLines.length);

  const qs = (patch: Record<string, string | undefined>) => {
    const o = { month: sp.month, cat: sp.cat, unpaid: sp.unpaid, ...patch };
    const s = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&");
    return `/expenses${s ? `?${s}` : ""}`;
  };
  const prevMonth = (m: string, d: number) => {
    const [y, mo] = m.split("-").map(Number);
    const dt = new Date(Date.UTC(y, mo - 1 + d, 1));
    return ym(dt);
  };

  return (
    <>
      <PageHeader title="Expenses" subtitle="Actual spend in ₹, mapped to the 65/10/25 buckets. Payroll runs from People land here too." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={month ? `Spend ${monthLabel(month)}` : "Spend (all time)"} value={inr(total)} hint={`${expenses.length} expense(s) · GST ${inr(gst)}`} accent />
        <Stat label="Unpaid (payables)" value={inr(payables._sum.amountInr ?? 0)} hint={<Link href={qs({ unpaid: "1", month: "all" })} className="underline">{payables._count} bill(s)</Link>} />
        <Stat label="Pass-through not yet billed" value={inr(unbilledPass.reduce((s, e) => s + e.amountInr, 0))} hint="Added to the next invoice of each project" />
        <Stat label="Largest bucket" value={<span className="text-base">{[...byBucket.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"}</span>} />
      </div>

      <div className="mb-6">
        <ExpenseForm
          key={editing?.id ?? "new"}
          expense={editing ? { ...editing, date: ymd(editing.date), paidOn: editing.paidOn ? ymd(editing.paidOn) : null } : null}
          categories={categories.map((c) => ({ id: c.id, name: c.name, bucket: bucketName(c.bucketKey) }))}
          projects={projects.map((pr) => ({ id: pr.id, label: `${pr.code} ${pr.name}` }))}
          defaultFx={p.fxRate}
          today={ymd(new Date())}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {month && <Link href={qs({ month: prevMonth(month, -1) })} className="btn-secondary btn-sm">←</Link>}
        <span className="text-sm font-semibold">{month ? monthLabel(month) : "All months"}</span>
        {month && <Link href={qs({ month: prevMonth(month, 1) })} className="btn-secondary btn-sm">→</Link>}
        <Link href={qs({ month: month ? "all" : undefined })} className="btn-secondary btn-sm">{month ? "All months" : "This month"}</Link>
        <Link href={qs({ unpaid: sp.unpaid ? undefined : "1" })} className={sp.unpaid ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Unpaid only</Link>
        <form action="/expenses" className="flex items-center gap-1">
          {sp.month && <input type="hidden" name="month" value={sp.month} />}
          {sp.unpaid && <input type="hidden" name="unpaid" value="1" />}
          <select name="cat" defaultValue={sp.cat ?? ""} className="input-sm">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Date</th><th>Vendor</th><th>Category</th><th>Bucket</th><th>Project</th><th className="num">Amount</th><th className="num">₹</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{date(e.date)}</td>
                <td>{e.vendor}{e.description && <div className="text-xs text-neutral-500">{e.description}</div>}</td>
                <td className="text-xs">{e.category.name}</td>
                <td className="text-xs">{bucketName(e.category.bucketKey)}</td>
                <td>{e.project ? <Link href={`/projects/${e.project.id}?tab=team`} className="font-mono text-xs text-brand-fg hover:underline">{e.project.code}</Link> : "—"}</td>
                <td className="num text-xs">{e.currency === "USD" ? `$${num(e.amount, 2)} @ ${e.fxRate}` : ""}</td>
                <td className="num font-semibold">{inr(e.amountInr)}</td>
                <td className="whitespace-nowrap">
                  {e.paidOn ? <span className="text-xs text-neutral-500">Paid {date(e.paidOn)}</span> : <StatusBadge status="UNPAID" />}
                  {e.passThrough && (e.invoiceLines[0] ? <Link href={`/invoices/${e.invoiceLines[0].invoiceId}`} className="ml-1 badge bg-emerald-50 text-emerald-700">Billed</Link> : <span className="ml-1 badge bg-violet-50 text-violet-700">To bill</span>)}
                </td>
                <td className="space-x-1 whitespace-nowrap">
                  <Link href={qs({ edit: e.id })} className="btn-secondary btn-sm">Edit</Link>
                  {!e.paidOn && <form action={markExpensePaid.bind(null, e.id)} className="inline"><button className="btn-secondary btn-sm">Mark paid</button></form>}
                  {isAdmin && !e.invoiceLines.length && <form action={deleteExpense.bind(null, e.id)} className="inline"><button className="btn-danger btn-sm">✕</button></form>}
                </td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-neutral-500">No expenses match.</td></tr>}
          </tbody>
          {expenses.length > 0 && <tfoot><tr><td colSpan={6}>TOTAL</td><td className="num">{inr(total)}</td><td colSpan={2}></td></tr></tfoot>}
        </table>
      </div>
    </>
  );
}
