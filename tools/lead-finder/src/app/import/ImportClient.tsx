"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { B2B_SERVICES, guessMapping, IMPORT_FIELDS, IMPORT_SOURCES, parseCsv } from "../../lib/b2b";
import { importAccounts, undoImport } from "../salesActions";

const TEMPLATE = "Company,Website,Industry,Company size,City,Country,First name,Last name,Title,Email,Phone,LinkedIn,Services,Notes\nABC Medical,abcmedical.com,Healthcare,51–200,Mumbai,India,Priya,Shah,Operations Director,priya@abcmedical.com,+91 98xxxxxx,https://www.linkedin.com/in/priya,Web application; Data migration,Met at expo\n";

/** Upload → map columns → preview → import. Nothing is saved until "Import". */
export default function ImportClient() {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [source, setSource] = useState("LINKEDIN");
  const [market, setMarket] = useState("IN");
  const [services, setServices] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const mapped = useMemo(
    () =>
      body
        .map((r) => Object.fromEntries(Object.entries(map).filter(([, i]) => i >= 0).map(([k, i]) => [k, (r[i] ?? "").trim()])))
        .filter((r) => r.company),
    [body, map],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    setFileName(file.name);
    setRows(parsed);
    setMap(guessMapping(parsed[0] ?? []));
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="label">Where is the list from?</span>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(IMPORT_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Market</span>
            <select className="input" value={market} onChange={(e) => setMarket(e.target.value)}>
              <option value="IN">India</option>
              <option value="US">USA</option>
            </select>
          </label>
          <label className="block">
            <span className="label">CSV file</span>
            <input className="input" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <fieldset>
          <legend className="label">Services they may need (added to every account; a &quot;Services&quot; column adds more)</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(B2B_SERVICES).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setServices(services.includes(k) ? services.filter((x) => x !== k) : [...services, k])} className={`rounded-full border px-3 py-1 text-xs ${services.includes(k) ? "border-brand bg-brand-soft font-medium text-brand-fg" : "border-neutral-200 text-neutral-600"}`}>
                {v}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-neutral-500">
          LinkedIn: export from Sales Navigator (or any tool that exports LinkedIn lists) as CSV; the portal never logs into LinkedIn itself.{" "}
          <a className="underline" download="accounts-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}>Download a template</a>
        </p>
      </div>

      {rows.length > 0 && (
        <div className="card space-y-4 p-5">
          <div className="card-t">Match the columns · {fileName} · {body.length} rows</div>
          <div className="grid gap-3 md:grid-cols-4">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="label">{f.label}{f.required && " *"}</span>
                <select className="input-sm w-full" value={map[f.key] ?? -1} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>—</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Company</th><th>Industry</th><th>Contact</th><th>Title</th><th>Email</th><th>LinkedIn</th></tr></thead>
              <tbody>
                {mapped.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{r.company}</td><td>{r.industry}</td><td>{r.fullName || [r.firstName, r.lastName].filter(Boolean).join(" ")}</td><td>{r.title}</td><td>{r.email}</td>
                    <td className="max-w-48 truncate text-xs">{r.linkedin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-neutral-500">
              First {Math.min(8, mapped.length)} of {mapped.length} rows with a company. Rows for the same company become one account with several contacts; companies already in the
              Lead Finder (same name or website) get the new contacts instead of a duplicate.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={pending || map.company == null || map.company < 0 || !mapped.length}
              onClick={() =>
                start(async () => {
                  const r = await importAccounts({ fileName, source, market, services, rows: mapped });
                  setMsg(r ?? null);
                  if (r?.ok) {
                    setRows([]);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Importing…" : `Import ${mapped.length} rows`}
            </button>
            {map.company == null || map.company < 0 ? <span className="text-sm text-red-600">Pick the Company column.</span> : null}
          </div>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p>}
    </div>
  );
}

export function UndoImportButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="text-xs underline"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Remove the accounts from this import that nobody has contacted yet?")) return;
          start(async () => {
            const r = await undoImport(id);
            setMsg(r?.message ?? null);
            router.refresh();
          });
        }}
      >
        Undo
      </button>
      {msg && <span className="text-xs text-neutral-500">{msg}</span>}
    </span>
  );
}
