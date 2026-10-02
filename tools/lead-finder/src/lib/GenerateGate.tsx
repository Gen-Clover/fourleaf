import { Empty, PageHeader } from "@genclover/ui";

/** Shown instead of searches and imports to someone the owner hasn't allowed to generate leads. */
export default function GenerateGate({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="card">
        <Empty>
          Searches and imports are for the owner and the sales managers they allow (Lead Finder → Sales team → &quot;Can generate leads&quot;). You can still add a lead you found yourself with Add a lead.
        </Empty>
      </div>
    </>
  );
}
