import Link from "next/link";
import { statusLabel } from "./format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`card px-4 py-3 ${accent ? "border-brand/30 bg-brand-soft" : ""}`}>
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700",
  QUOTED: "bg-blue-50 text-blue-700",
  NEGOTIATION: "bg-amber-50 text-amber-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ON_HOLD: "bg-orange-50 text-orange-700",
  COMPLETED: "bg-violet-50 text-violet-700",
  CANCELLED: "bg-red-50 text-red-700",
  INVOICED: "bg-blue-50 text-blue-700",
  PAID: "bg-emerald-50 text-emerald-700",
  SENT: "bg-blue-50 text-blue-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  VOID: "bg-neutral-100 text-neutral-500 line-through",
  PLANNED: "bg-neutral-100 text-neutral-700",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  DONE: "bg-emerald-50 text-emerald-700",
  BLOCKED: "bg-red-50 text-red-700",
  EMPLOYEE: "bg-brand-soft text-brand-fg",
  CONTRACTOR: "bg-violet-50 text-violet-700",
  UNPAID: "bg-amber-50 text-amber-700",
  Healthy: "bg-emerald-50 text-emerald-700",
  Tight: "bg-amber-50 text-amber-700",
  "Under cost": "bg-red-50 text-red-700",
  ADMIN: "bg-brand-soft text-brand-fg",
  EDITOR: "bg-blue-50 text-blue-700",
  VIEWER: "bg-neutral-100 text-neutral-700",
  SIGNED: "bg-emerald-50 text-emerald-700",
  EXPIRED: "bg-red-50 text-red-700",
  TERMINATED: "bg-neutral-100 text-neutral-500",
  SUPERSEDED: "bg-neutral-100 text-neutral-500",
  ONBOARDING: "bg-amber-50 text-amber-700",
  INACTIVE: "bg-neutral-100 text-neutral-500",
  SUBMITTED: "bg-blue-50 text-blue-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-700",
  OPEN: "bg-blue-50 text-blue-700",
  FILLED: "bg-emerald-50 text-emerald-700",
  ISSUED: "bg-blue-50 text-blue-700",
  CLOSED: "bg-neutral-100 text-neutral-600",
  IN_REVIEW: "bg-blue-50 text-blue-700",
  ESCALATED: "bg-red-50 text-red-700",
  DECIDED: "bg-violet-50 text-violet-700",
  FILED: "bg-emerald-50 text-emerald-700",
  OVERDUE: "bg-red-50 text-red-700",
  DUE: "bg-amber-50 text-amber-700",
  UPCOMING: "bg-neutral-100 text-neutral-700",
  DISCOVERY: "bg-neutral-100 text-neutral-700",
  QUALIFIED: "bg-blue-50 text-blue-700",
  PROPOSAL: "bg-violet-50 text-violet-700",
  WON: "bg-emerald-50 text-emerald-700",
  LOST: "bg-neutral-100 text-neutral-500",
  LOW: "bg-neutral-100 text-neutral-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH: "bg-amber-50 text-amber-700",
  CRITICAL: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_COLOR[status] ?? "bg-neutral-100 text-neutral-700"}`}>{statusLabel(status)}</span>;
}

export function Empty({ children, href, cta }: { children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-neutral-500">
      <p>{children}</p>
      {href && cta && (
        <Link href={href} className="btn-primary mt-3">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function ReadOnlyNote() {
  return (
    <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
      You can <b>view</b> this page. Your role can&apos;t change it; ask an owner if you need to.
    </div>
  );
}
