import { STAGE_LABEL } from "../lib/services";
import { temperature } from "../lib/scoring";

const STAGE_COLOR: Record<string, string> = {
  NEW: "bg-neutral-100 text-neutral-700",
  QUALIFIED: "bg-blue-50 text-blue-700",
  CONTACTED: "bg-violet-50 text-violet-700",
  REPLIED: "bg-amber-50 text-amber-700",
  MEETING: "bg-amber-50 text-amber-700",
  PROPOSAL: "bg-orange-50 text-orange-700",
  WON: "bg-emerald-50 text-emerald-700",
  LOST: "bg-red-50 text-red-700",
  NOT_A_FIT: "bg-neutral-100 text-neutral-500",
};

export function StageBadge({ stage }: { stage: string }) {
  return <span className={`badge ${STAGE_COLOR[stage] ?? STAGE_COLOR.NEW}`}>{STAGE_LABEL[stage] ?? stage}</span>;
}

/** Score with its temperature: 🔥 hot, warm or cold. */
export function Score({ score, hot, warm }: { score: number; hot: number; warm: number }) {
  const t = temperature(score, hot, warm);
  if (!t) return <span className="text-neutral-400">—</span>;
  const cls = t === "HOT" ? "bg-brand-soft text-brand-fg" : t === "WARM" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600";
  return (
    <span className={`badge tabular-nums ${cls}`} title={t === "HOT" ? "Hot lead" : t === "WARM" ? "Warm lead" : "Cold lead"}>
      {t === "HOT" && "🔥 "}
      {score}
    </span>
  );
}

export const SITE_STATES: Record<string, string> = { NONE: "No website", SOCIAL: "Social page only", DOWN: "Site down", OK: "Has a website", PENDING: "Not checked yet" };

/** What we know about the website in two or three words. */
export function WebsiteState({ website, siteState, auditStatus }: { website: string | null; siteState: string; auditStatus: string }) {
  if (!website) return <span className="font-medium text-brand-fg">No website</span>;
  if (auditStatus === "PENDING") return <span className="text-neutral-500">Checking…</span>;
  if (siteState === "SOCIAL" || siteState === "DOWN") return <span className="font-medium text-brand-fg">{SITE_STATES[siteState]}</span>;
  let host = website;
  try {
    host = new URL(website).hostname.replace(/^www\./, "");
  } catch {
    // keep as typed
  }
  return <span className="break-all text-neutral-600">{host}</span>;
}

export const Check = ({ ok, children }: { ok: boolean | null | undefined; children: React.ReactNode }) => (
  <li className="flex items-start gap-2 text-sm">
    <span className={`mt-0.5 w-4 shrink-0 text-center ${ok == null ? "text-neutral-400" : ok ? "text-emerald-600" : "text-brand-fg"}`}>{ok == null ? "–" : ok ? "✓" : "✗"}</span>
    <span className={ok === false ? "text-neutral-900" : "text-neutral-600"}>{children}</span>
  </li>
);
