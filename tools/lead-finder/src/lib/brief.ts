// Claude review without the API: the portal writes a brief (instructions + lead details) that a person
// pastes into Claude (chat, Cowork or Code), and Claude's answer is pasted back. The answer format is
// fixed so each lead's part can be read back by its GL- ID. Swap for an API call when there's budget.
import { marketOf } from "./markets";
import type { Reason } from "./scoring";
import { isService, SERVICE, SERVICES, type ServiceKey } from "./services";

export type BriefLead = {
  code: string;
  name: string;
  market: string;
  niche: string | null;
  area: string | null;
  person: string | null;
  rating: number | null;
  reviewCount: number | null;
  branchCount: number;
  website: string | null;
  siteState: string;
  checks: string[];
  reasons: Reason[];
  scores: Partial<Record<ServiceKey, number>>;
};

export const CLAUDE_INSTRUCTIONS = `You are helping Gen Clover (genclover.com), a web and AI studio, decide which local businesses to contact and what to say.

Gen Clover sells: ${SERVICES.map((s) => `${s.label} (${s.about})`).join("; ")}.

For EACH lead below:
1. Judge how good a prospect it is (HIGH, MEDIUM or LOW) from the findings, its size (reviews, branches) and its market.
2. Pick the single best service to lead with.
3. Explain why in 2–3 sentences, and list concrete AI automation ideas if they fit (for example a WhatsApp or website assistant that answers FAQs and books appointments), or "None".
4. Write a short first message (under 120 words) in the market's style: India = friendly WhatsApp message; USA = short professional email. Mention 2–3 specific findings, offer a free preview or demo, sign as "{sender}, Gen Clover". No prices, no false claims, nothing you can't see in the data.

Answer ONLY in this exact format, one block per lead, keeping the lead ID line exactly as given:

### GL-XXXX-XX-XXXXXX
FIT: HIGH | MEDIUM | LOW
SERVICE: ${SERVICES.map((s) => s.key).join(" | ")}
WHY: <2–3 sentences>
AI IDEAS: <ideas or None>
MESSAGE:
<the message>
END`;

export function buildBrief(leads: BriefLead[], sender: string) {
  const parts = leads.map((l) => {
    const m = marketOf(l.market);
    const top = Object.entries(l.scores)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k, v]) => `${SERVICE[k as ServiceKey].label} ${v}`)
      .join(", ");
    return [
      `### ${l.code}`,
      `Business: ${l.name}`,
      `Market: ${m.label}${l.niche ? ` · Niche: ${l.niche}` : ""}${l.area ? ` · Area: ${l.area}` : ""}`,
      l.person ? `Contact: ${l.person}` : null,
      `Google: ${l.rating ?? "?"}★ from ${l.reviewCount ?? 0} reviews${l.branchCount > 1 ? ` · ${l.branchCount} branches` : ""}`,
      `Website: ${l.website ?? "none"} (${l.siteState.toLowerCase()})`,
      l.checks.length ? `Website check: ${l.checks.join("; ")}` : null,
      `Findings: ${l.reasons.filter((r) => r.points > 0).map((r) => r.text).join("; ") || "none"}`,
      `Scores: ${top || "none"}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return `${CLAUDE_INSTRUCTIONS.replace("{sender}", sender)}\n\n---\n\n${parts.join("\n\n")}\n`;
}

export type ClaudeResult = { code: string; fit: string | null; service: ServiceKey | null; summary: string; message: string | null };

/** Read Claude's answer back: one result per "### GL-…" block. Tolerates extra text and markdown around it. */
export function parseClaudeAnswer(text: string): ClaudeResult[] {
  const blocks = text.split(/^#{1,4}\s*(?=GL-\d{4}-\d{2}-\d{6,}\s*$)/m).slice(1);
  return blocks.map((block) => {
    const code = block.match(/^GL-\d{4}-\d{2}-\d{6,}/)?.[0] ?? "";
    const field = (name: string) => block.match(new RegExp(`^\\**${name}\\**:\\s*(.+)$`, "im"))?.[1]?.trim() ?? null;
    const fit = field("FIT")?.toUpperCase().match(/HIGH|MEDIUM|LOW/)?.[0] ?? null;
    const service = field("SERVICE")?.toUpperCase().replace(/[^A-Z_]/g, "") ?? null;
    const why = field("WHY");
    const ideas = field("AI IDEAS");
    const message = block.match(/^\**MESSAGE\**:\s*\n([\s\S]*?)(?:^\s*END\s*$|$(?![\s\S]))/im)?.[1]?.trim() ?? null;
    return {
      code,
      fit,
      service: isService(service) ? service : null,
      summary: [why, ideas && !/^none\.?$/i.test(ideas) ? `AI ideas: ${ideas}` : null].filter(Boolean).join("\n"),
      message: message || null,
    };
  }).filter((r) => r.code);
}
