import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@genclover/ui";
import { can, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { AGREEMENT_TYPES } from "../../../lib/agreements";
import { deleteAgreement } from "../../actions";
import AgreementForm from "../AgreementForm";
import { agreementFormData, d } from "../data";
import AgreementControls from "./AgreementControls";

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const showMoney = can(user.role, "finance.view");
  const a = await prisma.agreement.findUnique({
    where: { id },
    omit: { value: !showMoney, currency: !showMoney },
    include: { client: { select: { id: true, name: true, code: true } }, project: { select: { id: true, code: true, name: true } }, versions: { orderBy: { version: "desc" } } },
  });
  if (!a) notFound();
  const [data, parent, children] = await Promise.all([
    agreementFormData(user.role),
    a.parentId ? prisma.agreement.findUnique({ where: { id: a.parentId }, select: { id: true, code: true, title: true } }) : null,
    prisma.agreement.findMany({ where: { parentId: a.id }, select: { id: true, code: true, title: true, status: true, type: true } }),
  ]);
  const editable = can(user.role, "agreements.edit") || (can(user.role, "projects.edit") && ["CR", "ACCEPTANCE"].includes(a.type));

  return (
    <>
      <PageHeader
        title={`${a.code} · ${a.title}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/agreements" className="hover:underline">← Agreements</Link>·<span>{AGREEMENT_TYPES[a.type]?.label ?? a.type}</span>·<StatusBadge status={a.status} />·
            <Link className="hover:underline" href={`/clients/${a.client.id}`}>{a.client.name}</Link>
            {a.project && <>·<Link className="font-mono text-xs hover:underline" href={`/projects/${a.project.id}`}>{a.project.code}</Link></>}
            {parent && <>· under <Link className="font-mono text-xs hover:underline" href={`/agreements/${parent.id}`}>{parent.code}</Link></>}
          </span>
        }
        actions={
          <>
            {a.documentUrl && <a className="btn-secondary" href={a.documentUrl} target="_blank" rel="noreferrer">Open document ↗</a>}
            {can(user.role, "agreements.edit") && a.status === "DRAFT" && (
              <form action={deleteAgreement.bind(null, a.id)}>
                <button className="btn-danger">Delete draft</button>
              </form>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          {editable && <AgreementControls id={a.id} status={a.status} canVersion={can(user.role, "agreements.edit")} />}
          <AgreementForm
            {...data}
            readOnly={!editable}
            initial={{
              id: a.id,
              code: a.code,
              type: a.type,
              clientId: a.clientId,
              projectId: a.projectId ?? "",
              parentId: a.parentId ?? "",
              title: a.title,
              status: a.status,
              documentUrl: a.documentUrl ?? "",
              scopeSummary: a.scopeSummary ?? "",
              estimatedHours: a.estimatedHours == null ? "" : String(a.estimatedHours),
              value: a.value == null ? "" : String(a.value),
              currency: a.currency ?? "INR",
              signedAt: d(a.signedAt),
              effectiveFrom: d(a.effectiveFrom),
              expiresAt: d(a.expiresAt),
              renewalNoticeDays: String(a.renewalNoticeDays),
              ownerName: a.ownerName ?? "",
              notes: a.notes ?? "",
            }}
          />
        </div>
        <aside className="space-y-4">
          <div className="card">
            <div className="card-h"><div className="card-t">Versions</div><span className="text-xs text-neutral-500">current v{a.version}</span></div>
            <ul className="divide-y divide-neutral-100 text-sm">
              {a.versions.map((v) => (
                <li key={v.id} className="px-4 py-2.5">
                  <div className="font-medium">
                    v{v.version}{" "}
                    {v.documentUrl && <a className="ml-1 text-xs text-brand-fg underline" href={v.documentUrl} target="_blank" rel="noreferrer">open</a>}
                  </div>
                  <div className="text-xs text-neutral-500">{v.note ?? ""} · {v.createdBy ?? ""} · {date(v.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>
          {children.length > 0 && (
            <div className="card">
              <div className="card-h"><div className="card-t">Under this agreement</div></div>
              <ul className="divide-y divide-neutral-100 text-sm">
                {children.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link className="font-mono text-xs text-brand-fg hover:underline" href={`/agreements/${c.id}`}>{c.code}</Link>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {editable && a.project && ["SOW", "RESOURCE", "SUPPORT"].includes(a.type) && (
            <div className="card space-y-2 p-4 text-sm">
              <div className="card-t">Next documents</div>
              <Link className="btn-secondary btn-sm" href={`/agreements/new?type=CR&project=${a.project.id}&parent=${a.id}`}>+ Change request</Link>{" "}
              <Link className="btn-secondary btn-sm" href={`/agreements/new?type=ACCEPTANCE&project=${a.project.id}&parent=${a.id}`}>+ Acceptance certificate</Link>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
