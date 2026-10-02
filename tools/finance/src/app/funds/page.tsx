import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { can, requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { INCENTIVE_FUND, PASS_THROUGH, fundBalances } from "../../lib/treasury";
import { ymd } from "../../lib/finance";
import { date, inr } from "@genclover/ui/format";
import MovementForm from "./MovementForm";
import { deleteFundEntry } from "./actions";

const TYPE_LABEL: Record<string, string> = { ALLOCATION: "Allocation", OPENING: "Opening", TRANSFER: "Transfer", ADJUSTMENT: "Adjustment", EXPENSE: "Expense paid" };

export default async function FundsPage({ searchParams }: { searchParams: Promise<{ fund?: string }> }) {
  const user = await requirePermission("finance.view");
  const isAdmin = can(user.role, "finance.edit");
  const sp = await searchParams;
  const funds = await fundBalances();
  const fund = funds.find((f) => f.key === sp.fund) ?? null;
  const cats = await prisma.expenseCategory.findMany({ select: { id: true, bucketKey: true } });
  const catIds = fund ? cats.filter((c) => (c.bucketKey ?? PASS_THROUGH) === fund.key).map((c) => c.id) : null;

  const [entries, expenses] = await Promise.all([
    prisma.fundEntry.findMany({ where: fund ? { fundKey: fund.key } : {}, orderBy: { date: "desc" }, take: 200, include: { payment: { select: { invoiceId: true } } } }),
    prisma.expense.findMany({ where: { paidOn: { not: null }, ...(catIds ? { categoryId: { in: catIds } } : {}) }, orderBy: { paidOn: "desc" }, take: 200, include: { category: true } }),
  ]);
  const rows = [
    ...entries.map((e) => ({ id: e.id, date: e.date, fundKey: e.fundKey, type: e.type, amount: e.amountInr, text: `${e.note ?? ""}${e.policy ? ` · ${e.policy}` : ""}`, href: e.payment ? `/invoices/${e.payment.invoiceId}` : null, deletable: e.type !== "ALLOCATION" })),
    ...expenses.map((x) => ({ id: x.id, date: x.paidOn!, fundKey: x.category.bucketKey ?? PASS_THROUGH, type: "EXPENSE", amount: -(x.amountInr + x.gstInr), text: `${x.vendor} — ${x.category.name}`, href: `/expenses?month=${ymd(x.date).slice(0, 7)}`, deletable: false })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 200);
  const name = (k: string) => funds.find((f) => f.key === k)?.name ?? k;

  return (
    <>
      <PageHeader title="Funds" subtitle="Every bucket is a live fund: receipts are allocated in, paid spending comes out." actions={<Link href="/cfo" className="btn-secondary">CFO dashboard</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {funds.map((f) => (
          <Link key={f.key} href={f.key === sp.fund ? "/funds" : `/funds?fund=${f.key}`} className={`card p-3 transition hover:border-brand/40 ${f.key === sp.fund ? "border-brand bg-brand-soft" : ""}`}>
            <div className="truncate text-xs font-medium text-neutral-500" title={f.name}>{f.name}</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${f.balance < 0 ? "text-red-600" : "text-ink"}`}>{inr(f.balance)}</div>
            <div className="text-[11px] text-neutral-500">{f.percent ? `${f.percent}% of receipts` : f.key === PASS_THROUGH ? "Clearing" : f.key === INCENTIVE_FUND ? "Held from receipts, paid in pay runs" : "Not funded by policy"}</div>
          </Link>
        ))}
      </div>
      {isAdmin && <div className="mb-6"><MovementForm funds={funds.map((f) => ({ key: f.key, name: f.name }))} today={ymd(new Date())} /></div>}
      <div className="card overflow-x-auto">
        <div className="card-h">
          <div className="card-t">{fund ? `${fund.name} — ledger` : "All fund movements"}</div>
          {fund && <span className="text-sm">Balance <b className="tabular-nums">{inr(fund.balance)}</b> · <Link href="/funds" className="text-brand-fg underline">show all</Link></span>}
        </div>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Fund</th><th>Type</th><th>Detail</th><th className="num">In</th><th className="num">Out</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.type}${r.id}`}>
                <td className="whitespace-nowrap">{date(r.date)}</td>
                <td className="text-xs">{name(r.fundKey)}</td>
                <td className="text-xs">{TYPE_LABEL[r.type] ?? r.type}</td>
                <td className="text-sm">{r.href ? <Link href={r.href} className="text-brand-fg hover:underline">{r.text}</Link> : r.text}</td>
                <td className="num text-emerald-700">{r.amount > 0 ? inr(r.amount) : ""}</td>
                <td className="num text-red-600">{r.amount < 0 ? inr(-r.amount) : ""}</td>
                <td>{isAdmin && r.deletable && <form action={deleteFundEntry.bind(null, r.id)}><button className="btn-danger btn-sm">✕</button></form>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-neutral-500">No movements yet. Record opening balances, then receipts will flow in as payments are recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
