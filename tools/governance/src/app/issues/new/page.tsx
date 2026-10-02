import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import IssueForm from "../IssueForm";
import { issueFormData } from "../data";

export default async function NewIssuePage({ searchParams }: { searchParams: Promise<{ project?: string; category?: string }> }) {
  const user = await requirePermission("issues.edit");
  const sp = await searchParams;
  const data = await issueFormData();
  return (
    <>
      <PageHeader title="Raise an issue" subtitle="Resource clashes, scope disputes, quality, payment or people issues: logged with an owner and a deadline, and escalated by level if needed." />
      <IssueForm
        {...data}
        initial={{ title: "", category: sp.category ?? "RESOURCE", priority: "MEDIUM", projectId: data.projects.some((p) => p.id === sp.project) ? sp.project! : "", description: "", impact: "", options: "", ownerId: user.id, dueDate: "" }}
      />
    </>
  );
}
