import Link from "next/link";
import { PageHeader } from "@genclover/ui";
import { requirePermission } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { date } from "@genclover/ui/format";
import { CLAUDE_INSTRUCTIONS } from "../../lib/brief";
import { isMarket, MARKETS, MARKET_KEYS } from "../../lib/markets";
import { isService, SERVICE } from "../../lib/services";
import { ClaudePanel } from "../ClaudePanel";
import MarketToggle from "../MarketToggle";
import { leadScope } from "../../lib/scope";

const SIZES = [10, 20, 40];

/**
 * Claude review in batches, using a Claude subscription instead of the API: the best leads that haven't
 * been reviewed go into one brief; Claude's answer is pasted back and saved to each lead.
 */
export default async function ClaudeReviewPage({ searchParams }: { searchParams: Promise<{ market?: string; n?: string }> }) {
  const user = await requirePermission("leads.edit");
  const scope = await leadScope(user);
  const sp = await searchParams;
  const market = isMarket(sp.market) ? sp.market : undefined;
  const n = SIZES.includes(Number(sp.n)) ? Number(sp.n) : 20;
  const [next, reviewed] = await Promise.all([
    prisma.lead.findMany({
      where: { ...scope, claudeAt: null, stage: { in: ["NEW", "QUALIFIED"] }, doNotContact: false, branchOfId: null, bestScore: { gt: 0 }, ...(market ? { market } : {}) },
      orderBy: [{ bestScore: "desc" }, { reviewCount: "desc" }],
      take: n,
      select: { id: true, code: true, name: true, bestScore: true },
    }),
    prisma.lead.findMany({
      where: { ...scope, claudeAt: { not: null }, ...(market ? { market } : {}) },
      orderBy: { claudeAt: "desc" },
      take: 15,
      select: { id: true, name: true, claudeFit: true, claudeService: true, claudeAt: true },
    }),
  ]);
  const link = (size: number) => `/leads/claude?${new URLSearchParams({ ...(market ? { market } : {}), n: String(size) })}`;

  return (
    <>
      <PageHeader
        title="Claude review"
        subtitle="Claude reads your best leads and says which to contact, with what, and writes the first message. Uses your Claude subscription: copy out, paste back."
        actions={<MarketToggle markets={MARKET_KEYS.map((k) => ({ key: k, label: MARKETS[k].label }))} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="card">
          <div className="card-h">
            <div className="card-t">Next batch: {next.length} best leads not yet reviewed</div>
            <div className="flex gap-1 text-xs">
              {SIZES.map((s) => (
                <Link key={s} href={link(s)} className={`rounded-md px-2 py-1 ${s === n ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500"}`}>{s}</Link>
              ))}
            </div>
          </div>
          <div className="space-y-4 p-5">
            {next.length ? (
              <>
                <p className="text-sm text-neutral-600">
                  {next.map((l) => l.name).slice(0, 8).join(", ")}
                  {next.length > 8 && ` and ${next.length - 8} more`}.
                </p>
                <ClaudePanel ids={next.map((l) => l.id)} fileName={`claude-brief-${new Date().toISOString().slice(0, 10)}.md`} />
              </>
            ) : (
              <p className="text-sm text-neutral-500">Every open lead with a score has been reviewed. Run a search or qualify more leads.</p>
            )}
          </div>
        </section>
        <aside className="space-y-6">
          <section className="card">
            <div className="card-h"><div className="card-t">Recently reviewed</div></div>
            <ul className="divide-y divide-neutral-100">
              {reviewed.map((l) => (
                <li key={l.id} className="px-4 py-2 text-sm">
                  <Link className="font-medium text-brand-fg hover:underline" href={`/leads/${l.id}`}>{l.name}</Link>
                  <div className="text-xs text-neutral-500">
                    {l.claudeFit?.toLowerCase() ?? "?"} fit{isService(l.claudeService) && ` · ${SERVICE[l.claudeService].short}`} · {date(l.claudeAt)}
                  </div>
                </li>
              ))}
              {reviewed.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">None yet.</li>}
            </ul>
          </section>
          <details className="card p-4 text-sm">
            <summary className="cursor-pointer font-medium text-neutral-900">What Claude is asked</summary>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-xs text-neutral-600">{CLAUDE_INSTRUCTIONS.replace("{sender}", "your first name")}</pre>
          </details>
        </aside>
      </div>
    </>
  );
}
