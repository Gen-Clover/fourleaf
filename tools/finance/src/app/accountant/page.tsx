import { PageHeader, Stat } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { currentMonth, monthLabel } from "@genclover/ui/format";
import { accountantPack } from "../../lib/accountant";
import { fyShort, fyStartYear } from "../../lib/finance";

const MONTH = /^\d{4}-\d{2}$/;

/**
 * Everything the CA enters in Zoho Books, staged here: pick the period, check the counts, download the ZIP and
 * share it. Each file can also be downloaded on its own.
 */
export default async function AccountantPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePermission("finance.view");
  const sp = await searchParams;
  const now = new Date();
  const fy = fyStartYear(now);
  const to = MONTH.test(sp.to ?? "") ? sp.to! : currentMonth();
  const from = MONTH.test(sp.from ?? "") ? sp.from! : to;
  const pack = await accountantPack(from, to);
  const q = `from=${from}&to=${to}`;
  const preset = (label: string, f: string, t: string) => (
    <a href={`/finance/accountant?from=${f}&to=${t}`} className="btn-secondary btn-sm">{label}</a>
  );
  const prev = (() => {
    const [y, m] = to.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  })();

  return (
    <>
      <PageHeader title="Accountant pack" subtitle="Customers, vendors, invoices (with GST), receipts (with TDS), bills, payroll and GST / TDS summaries — ready for Zoho Books or Tally." />
      <div className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <form className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="label">From</span><input className="input-sm" type="month" name="from" defaultValue={from} /></label>
          <label className="block"><span className="label">To</span><input className="input-sm" type="month" name="to" defaultValue={to} /></label>
          <button className="btn-secondary btn-sm">Show</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {preset("This month", currentMonth(), currentMonth())}
          {preset("Last month", prev, prev)}
          {preset(`FY ${fyShort(fy)} to date`, `${fy}-04`, currentMonth())}
          {preset(`FY ${fyShort(fy - 1)}`, `${fy - 1}-04`, `${fy}-03`)}
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="Customers" value={pack.counts.customers} />
        <Stat label="Vendors" value={pack.counts.vendors} />
        <Stat label="Invoices" value={pack.counts.invoices} accent />
        <Stat label="Receipts" value={pack.counts.payments} />
        <Stat label="Expenses" value={pack.counts.expenses} />
        <Stat label="Pay lines" value={pack.counts.payLines} />
      </div>
      <div className="card">
        <div className="card-h">
          <div className="card-t">{monthLabel(from)}{from !== to && ` – ${monthLabel(to)}`}</div>
          <a href={`/api/accountant?${q}`} className="btn-primary">Download ZIP for the CA</a>
        </div>
        <ul className="divide-y divide-neutral-100 text-sm">
          {Object.entries(pack.files).map(([name, body]) => (
            <li key={name} className="flex items-center justify-between gap-2 px-5 py-2.5">
              <span className="font-mono text-xs">{name}</span>
              <span className="flex items-center gap-3 text-xs text-neutral-500">
                {name.endsWith(".csv") ? `${Math.max(0, body.split("\r\n").length - 1)} rows` : "notes"}
                <a className="text-brand-fg underline" href={`/api/accountant?${q}&file=${encodeURIComponent(name)}`}>download</a>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Column names follow Zoho Books&apos; import templates where there is one; the import screen lets your CA map anything that differs. The pack is built from the portal&apos;s
        records: issue invoices, record receipts and approve pay runs here first, then export. Downloads are recorded in the audit log.
      </p>
    </>
  );
}
