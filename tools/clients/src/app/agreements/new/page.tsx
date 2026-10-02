import { PageHeader } from "@genclover/ui";
import { requireUser } from "@genclover/auth";
import { AGREEMENT_TYPES } from "../../../lib/agreements";
import AgreementForm from "../AgreementForm";
import { agreementFormData } from "../data";

export default async function NewAgreementPage({ searchParams }: { searchParams: Promise<{ client?: string; project?: string; type?: string; parent?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const data = await agreementFormData(user.role);
  const project = data.projects.find((p) => p.id === sp.project);
  const clientId = project?.clientId ?? (data.clients.some((c) => c.id === sp.client) ? sp.client! : "");
  const type = sp.type && data.allowedTypes.includes(sp.type) ? sp.type : data.allowedTypes[0];
  return (
    <>
      <PageHeader title="New agreement" subtitle="Client-level documents get ABR-A01; project documents get ABR-P01-S01 (SOW), -CR01 (change) or -AC01 (acceptance)." />
      <AgreementForm
        {...data}
        initial={{
          type,
          clientId,
          projectId: project?.id ?? "",
          parentId: sp.parent ?? "",
          title: AGREEMENT_TYPES[type].label + (project ? ` — ${project.label}` : ""),
          status: "DRAFT",
          documentUrl: "",
          scopeSummary: "",
          estimatedHours: "",
          value: "",
          currency: data.clients.find((c) => c.id === clientId)?.currency ?? "INR",
          signedAt: "",
          effectiveFrom: "",
          expiresAt: "",
          renewalNoticeDays: "30",
          ownerName: user.name,
          notes: "",
        }}
      />
    </>
  );
}
