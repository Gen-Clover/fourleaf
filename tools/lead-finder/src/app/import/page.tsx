import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { IMPORT_SOURCES } from "../../lib/b2b";
import ImportClient, { UndoImportButton } from "./ImportClient";
import GenerateGate from "../../lib/GenerateGate";
import { canGenerateLeads } from "../../lib/scope";

export default async function ImportPage() {
  const user = await requirePermission("leads.edit");
  if (!(await canGenerateLeads(user))) return <GenerateGate title="Import a list" />;
  const imports = await prisma.leadImport.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <>
      <PageHeader title="Import accounts" subtitle="Company lists from LinkedIn Sales Navigator, Apollo, events or any spreadsheet: accounts and their contacts in one go." />
      <ImportClient />
      <section className="card mt-6">
        <div className="card-h"><div className="card-t">Past imports</div></div>
        <table className="tbl">
          <thead><tr><th>File</th><th>Source</th><th className="num">Rows</th><th className="num">New accounts</th><th className="num">Already known</th><th className="num">Skipped</th><th>By</th><th /></tr></thead>
          <tbody>
            {imports.map((i) => (
              <tr key={i.id}>
                <td className="max-w-56 truncate">{i.fileName}</td>
                <td className="text-xs">{IMPORT_SOURCES[i.source]?.split(" (")[0] ?? i.source}</td>
                <td className="num">{i.rows}</td>
                <td className="num">{i.created}</td>
                <td className="num">{i.duplicates}</td>
                <td className="num">{i.errors}</td>
                <td className="text-sm">{i.createdBy}<div className="text-xs text-neutral-500">{date(i.createdAt)}</div></td>
                <td className="text-right"><UndoImportButton id={i.id} /></td>
              </tr>
            ))}
            {imports.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-neutral-500">No imports yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
