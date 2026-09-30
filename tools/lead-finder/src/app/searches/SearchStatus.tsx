const LABEL: Record<string, [string, string]> = {
  QUEUED: ["Waiting", "bg-neutral-100 text-neutral-700"],
  RUNNING: ["Running", "bg-blue-50 text-blue-700"],
  PAUSED: ["Paused: spend cap", "bg-amber-50 text-amber-700"],
  DONE: ["Done", "bg-emerald-50 text-emerald-700"],
  STOPPED: ["Stopped", "bg-neutral-100 text-neutral-500"],
  FAILED: ["Failed", "bg-red-50 text-red-700"],
};

export function SearchStatus({ status, done, total }: { status: string; done: number; total: number }) {
  const [label, cls] = LABEL[status] ?? [status, "bg-neutral-100 text-neutral-700"];
  return (
    <span className={`badge ${cls}`}>
      {label}
      {status === "RUNNING" && total > 0 && ` · ${Math.floor((done / total) * 100)}%`}
    </span>
  );
}
