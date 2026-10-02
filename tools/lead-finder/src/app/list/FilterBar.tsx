"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { STAGE_LABEL, STAGES } from "../../lib/services";
import { SITE_STATES } from "../bits";

type F = {
  stage: string;
  temp: string;
  niche: string;
  site: string;
  q: string;
  followUp: string;
  sort: string;
  search: string;
  gFrom: string;
  gTo: string;
  gOlder: string;
  branches: string;
  claude: string;
  owner: string;
  stuck: string;
};

/** Filters apply as soon as they change; the text search on Enter. */
export default function FilterBar({ filters, niches, users, meId }: { filters: F; niches: { key: string; label: string }[]; users: { id: string; name: string }[]; meId: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(filters.q);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`${path}?${next.toString()}`);
  };
  const select = (key: keyof F, label: string, options: [string, string][]) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
      <select className="input-sm" value={filters[key]} onChange={(e) => set({ [key]: e.target.value })}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <div className="card mb-4 space-y-3 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <form
          className="flex min-w-56 flex-1 flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() });
          }}
        >
          <span className="text-[11px] font-medium text-neutral-500">Search</span>
          <input className="input-sm" placeholder="Name, GL- ID, area, phone, email, website…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {select("stage", "Stage", [["OPEN", "Open (being worked)"], ["ALL", "All stages"], ...STAGES.map((s) => [s, STAGE_LABEL[s]] as [string, string]), ["DNC", "Do not contact"]])}
        {select("temp", "Temperature", [["", "Any"], ["HOT", "🔥 Hot"], ["WARM", "Warm"], ["COLD", "Cold"]])}
        {select("site", "Website", [["", "Any"], ...Object.entries(SITE_STATES)])}
        {select("niche", "Niche", [["", "All niches"], ...niches.map((n) => [n.key, n.label] as [string, string])])}
        {select("followUp", "Follow-up", [["", "Any"], ["DUE", "Due now"]])}
        {select("owner", "Owner", [["", "Anyone"], ["none", "Unassigned"], ...users.map((u) => [u.id, u.id === meId ? `${u.name} (me)` : u.name] as [string, string])])}
        {select("claude", "Claude review", [["", "Any"], ["HIGH", "High fit"], ["MEDIUM", "Medium fit"], ["LOW", "Low fit"], ["NONE", "Not reviewed"]])}
        {select("sort", "Sort", [["score", "Best score"], ["followup", "Next follow-up (scheduled)"], ["google", "Google data (oldest first)"], ["newest", "Newest"], ["name", "Name"]])}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-3">
        <span className="pb-1.5 text-[11px] font-medium text-neutral-500">Google data last updated</span>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-neutral-500">From</span>
          <input type="date" className="input-sm" value={filters.gFrom} onChange={(e) => set({ gFrom: e.target.value, gOlder: "" })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-neutral-500">To</span>
          <input type="date" className="input-sm" value={filters.gTo} onChange={(e) => set({ gTo: e.target.value, gOlder: "" })} />
        </label>
        {select("gOlder", "or older than", [["", "—"], ["20", "20 days"], ["25", "25 days"], ["30", "30 days"]])}
        <label className="flex items-center gap-2 pb-1.5 text-sm text-neutral-600" title="Replied, call / meeting or proposal with nothing happening for the days set in Settings">
          <input type="checkbox" checked={filters.stuck === "1"} onChange={(e) => set({ stuck: e.target.checked ? "1" : "", stage: e.target.checked ? "ALL" : "" })} />
          Stuck deals only
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={filters.branches === "show"} onChange={(e) => set({ branches: e.target.checked ? "show" : "" })} />
          Show every branch
        </label>
        {(filters.gFrom || filters.gTo || filters.gOlder) && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => set({ gFrom: "", gTo: "", gOlder: "" })}>
            ✕ Clear dates
          </button>
        )}
        {filters.search && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => set({ search: "" })}>
            ✕ This search only
          </button>
        )}
        {params.toString().replace(/(^|&)page=\d+/, "") && (
          <button type="button" className="btn-secondary btn-sm ml-auto" onClick={() => router.push(path)}>
            ✕ Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}
