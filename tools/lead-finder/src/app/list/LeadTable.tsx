"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { date } from "@genclover/ui/format";
import { isService, NOT_FIT_REASONS, SERVICE } from "../../lib/services";
import { bulkAction } from "../actions";
import { Score, StageBadge, WebsiteState } from "../bits";
import { download } from "../ClaudePanel";
import { claudeBrief, estimateRefresh, refreshMatching } from "../moreActions";
import { assignOwner } from "../stageActions";

type Row = {
  id: string;
  code: string;
  name: string;
  sub: string;
  website: string | null;
  siteState: string;
  auditStatus: string;
  rating: number | null;
  reviewCount: number | null;
  stage: string;
  doNotContact: boolean;
  nextFollowUpAt: string | null;
  score: number;
  bestService: string | null;
  branchCount: number;
  claudeFit: string | null;
  googleFetchedAt: string | null;
  market: string;
  ownerName: string | null;
};

const money = (usd: number) => (usd <= 0 ? "free (within the monthly allowance)" : `about $${usd.toFixed(2)}`);

export default function LeadTable({
  leads,
  users,
  canEdit,
  showService,
  hot,
  warm,
  query,
  total,
}: {
  leads: Row[];
  users: { id: string; name: string }[];
  canEdit: boolean;
  showService: boolean;
  hot: number;
  warm: number;
  query: string;
  total: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const all = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const run = (action: Parameters<typeof bulkAction>[1], reason?: string) =>
    start(async () => {
      const r = await bulkAction([...selected], action, reason);
      setMsg(r?.message ?? "");
      if (r?.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  const assign = (userId: string) =>
    start(async () => {
      const r = await assignOwner([...selected], userId === "none" ? null : userId);
      setMsg(r?.message ?? "");
      if (r?.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  /** Refresh Google data for the selection, or for every lead matching the filters; asks first with the cost. */
  const refresh = (scope: "selected" | "matching") =>
    start(async () => {
      const input = scope === "selected" ? { ids: [...selected] } : { query };
      const est = await estimateRefresh(input);
      if (!est.count) return setMsg("Nothing to refresh: leads added by hand have no Google data, and queued ones are already waiting.");
      const overCap = est.spendUsd + est.costUsd > est.capUsd;
      if (!window.confirm(`Refresh Google data for ${est.count} lead(s)?\n\nCost: ${money(est.costUsd)}.${overCap ? `\nThis passes your $${est.capUsd} monthly cap: the rest pauses until you raise it.` : ""}`)) return;
      const r = await refreshMatching(input);
      setMsg(r?.message ?? "");
      setSelected(new Set());
      router.refresh();
    });
  const brief = () =>
    start(async () => {
      const r = await claudeBrief([...selected]);
      if (!r.ok) return setMsg(r.message);
      download(`claude-brief-${selected.size}-leads.md`, r.text);
      setMsg(`Brief for ${selected.size} lead(s) downloaded. Paste Claude's answer on the Claude review page.`);
    });
  const now = Date.now();

  return (
    <div className="card">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 text-sm">
          <span className="text-neutral-500">{selected.size ? `${selected.size} selected` : "Select leads to act on several at once"}</span>
          {selected.size > 0 && (
            <>
              <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run("QUALIFY")}>✓ Qualify</button>
              <select className="input-sm w-auto" value="" disabled={pending} onChange={(e) => e.target.value && run("NOT_A_FIT", e.target.value)} aria-label="Mark not a fit, with the reason">
                <option value="">Not a fit…</option>
                {NOT_FIT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {users.length > 0 && (
                <select className="input-sm w-auto" value="" disabled={pending} onChange={(e) => e.target.value && assign(e.target.value)} aria-label="Move to">
                  <option value="">Move to…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
              <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run("SPEED")}>Speed test</button>
              <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run("RECHECK")}>Re-check websites</button>
              <button className="btn-secondary btn-sm" disabled={pending} onClick={() => refresh("selected")}>Refresh Google data</button>
              <button className="btn-secondary btn-sm" disabled={pending || selected.size > 40} title={selected.size > 40 ? "Up to 40 per brief" : undefined} onClick={brief}>
                Claude brief (.md)
              </button>
            </>
          )}
          <button className="btn-secondary btn-sm ml-auto" disabled={pending || !total} onClick={() => refresh("matching")} title="Every lead matching the current filters, on all pages">
            ⟳ Refresh Google data for all {total} matching
          </button>
          {msg && <span className="w-full text-emerald-700">{msg}</span>}
        </div>
      )}
      <table className="tbl">
        <thead>
          <tr>
            {canEdit && (
              <th className="w-8">
                <input type="checkbox" aria-label="Select all on this page" checked={all} onChange={() => setSelected(all ? new Set() : new Set(leads.map((l) => l.id)))} />
              </th>
            )}
            <th>Lead</th>
            <th className="hidden sm:table-cell">Website</th>
            <th className="num hidden md:table-cell">Google</th>
            <th>Stage</th>
            <th className="hidden lg:table-cell">Follow-up</th>
            <th className="num">Score</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const due = l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= now;
            return (
              <tr key={l.id}>
                {canEdit && (
                  <td>
                    <input type="checkbox" aria-label={`Select ${l.name}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                  </td>
                )}
                <td>
                  <Link href={`/leads/${l.id}`} className="font-medium text-brand-fg hover:underline">{l.name}</Link>
                  <div className="text-xs text-neutral-500">
                    <span className="font-mono">{l.code}</span>
                    {l.market === "US" && " · USA"}
                    {l.sub && ` · ${l.sub}`}
                    {l.branchCount > 1 && <span className="ml-1 badge bg-neutral-100 text-neutral-600">{l.branchCount} branches</span>}
                    {l.claudeFit && <span className="ml-1 badge bg-blue-50 text-blue-700">Claude: {l.claudeFit.toLowerCase()}</span>}
                  </div>
                </td>
                <td className="hidden max-w-56 text-sm sm:table-cell"><WebsiteState website={l.website} siteState={l.siteState} auditStatus={l.auditStatus} /></td>
                <td className="num hidden text-sm md:table-cell">
                  {l.rating ? <>{l.rating}★ <span className="text-neutral-500">· {l.reviewCount ?? 0}</span></> : "—"}
                  {l.googleFetchedAt && <div className="text-[11px] text-neutral-500">updated {date(l.googleFetchedAt)}</div>}
                </td>
                <td>
                  {l.doNotContact ? <span className="badge bg-red-50 text-red-700">Do not contact</span> : <StageBadge stage={l.stage} />}
                  {l.ownerName && <div className="mt-0.5 text-[11px] text-neutral-500">{l.ownerName}</div>}
                </td>
                <td className={`hidden text-sm whitespace-nowrap lg:table-cell ${due ? "font-medium text-brand-fg" : "text-neutral-600"}`}>{l.nextFollowUpAt ? (due ? `Due ${date(l.nextFollowUpAt)}` : date(l.nextFollowUpAt)) : "—"}</td>
                <td className="num">
                  <Score score={l.score} hot={hot} warm={warm} />
                  {showService && isService(l.bestService) && l.score > 0 && <div className="mt-0.5 text-[11px] text-neutral-500">{SERVICE[l.bestService].short}</div>}
                </td>
              </tr>
            );
          })}
          {leads.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 7 : 6} className="py-10 text-center text-neutral-500">No leads match these filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
