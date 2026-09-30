"use client";

import { useMemo, useState, useTransition } from "react";
import { type Estimate, estimateSearch, startSearch } from "../actions";

type Niche = { key: string; label: string; phrases: string[]; market: string };
type Service = { key: string; label: string; about: string; offers: Record<string, string> };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const money = (usd: number) => (usd <= 0 ? "free" : `$${usd.toFixed(2)}`);

export default function NewSearchForm({ niches, markets, services, keyConfigured }: { niches: Niche[]; markets: { key: string; label: string }[]; services: Service[]; keyConfigured: boolean }) {
  const [market, setMarket] = useState(markets[0]?.key ?? "IN");
  const inMarket = niches.filter((n) => n.market === market);
  const [service, setService] = useState("ALL");
  const [nicheKey, setNicheKey] = useState(inMarket[0]?.key ?? "");
  const [phrases, setPhrases] = useState(inMarket[0]?.phrases.join(", ") ?? "");
  const [repeat, setRepeat] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hour, setHour] = useState(7);
  const [areas, setAreas] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);
  const [depth, setDepth] = useState<"QUICK" | "THOROUGH">("THOROUGH");
  const [estimate, setEstimate] = useState<(Estimate & { for: string }) | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const input = useMemo(
    () => ({ service, nicheKey, phrases: phrases.split(/[,\n]/).map((p) => p.trim()).filter(Boolean), areas, radiusKm, depth }),
    [service, nicheKey, phrases, areas, radiusKm, depth],
  );
  const inputKey = JSON.stringify(input);
  const fresh = estimate?.ok && estimate.for === inputKey;
  const overCap = fresh && estimate.spendUsd! + estimate.costMaxUsd! > estimate.capUsd!;

  const pickNiche = (key: string) => {
    setNicheKey(key);
    setPhrases(niches.find((n) => n.key === key)?.phrases.join(", ") ?? "");
  };

  const runEstimate = () =>
    start(async () => {
      setError("");
      const r = await estimateSearch(input);
      setEstimate({ ...r, for: inputKey });
      if (!r.ok) setError(r.message);
    });

  const run = () =>
    start(async () => {
      setError("");
      const r = await startSearch({ ...input, resolved: estimate?.areas ?? [], repeat: repeat ? { dayOfWeek, hour } : null });
      if (r && !r.ok) setError(r.message);
    });

  const pickMarket = (m: string) => {
    setMarket(m);
    const first = niches.find((n) => n.market === m);
    setNicheKey(first?.key ?? "");
    setPhrases(first?.phrases.join(", ") ?? "");
    setAreas("");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="card space-y-6 p-5">
        {!keyConfigured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Google Maps isn&apos;t connected yet. Add <span className="font-mono">GOOGLE_MAPS_API_KEY</span> to <span className="font-mono">.env</span> (a Google Cloud key with
            Places API (New) and PageSpeed Insights API enabled), then restart <span className="font-mono">npm run dev</span>. You can still add leads by hand.
          </div>
        )}

        <section>
          <div className="label">Market</div>
          <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 text-sm" role="radiogroup" aria-label="Market">
            {markets.map((m) => (
              <button key={m.key} type="button" role="radio" aria-checked={market === m.key} onClick={() => pickMarket(m.key)} className={`rounded-md px-4 py-1.5 ${market === m.key ? "bg-brand-soft font-medium text-brand-fg" : "text-neutral-600 hover:text-neutral-900"}`}>
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="label">1 · What are you selling?</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[{ key: "ALL", label: "All services", offer: "Rank for everything, pick later" }, ...services.map((sv) => ({ key: sv.key, label: sv.label, offer: sv.offers[market] }))].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setService(s.key)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${service === s.key ? "border-brand bg-brand-soft" : "border-neutral-200 hover:border-neutral-400"}`}
              >
                <div className="text-sm font-medium text-neutral-900">{s.label}</div>
                <div className="text-xs text-neutral-500">{s.offer}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">This only decides how results are ranked first. Every search finds all businesses, and every lead is scored for every service.</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="niche">2 · Niche</label>
            <select id="niche" className="input" value={nicheKey} onChange={(e) => pickNiche(e.target.value)}>
              {inMarket.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="phrases">Search phrases (comma-separated)</label>
            <input id="phrases" className="input" value={phrases} onChange={(e) => setPhrases(e.target.value)} />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[1fr_9rem]">
          <div>
            <label className="label" htmlFor="areas">3 · Where (one or more places, comma-separated)</label>
            <input
              id="areas"
              className="input"
              placeholder={market === "US" ? "Austin TX, Round Rock TX" : "Chandigarh, Mohali, Panchkula, Zirakpur"}
              value={areas}
              onChange={(e) => setAreas(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="radius">and around (km)</label>
            <input id="radius" className="input" type="number" min={0} max={50} value={radiusKm} onChange={(e) => setRadiusKm(Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </section>

        <section>
          <div className="label">4 · Depth</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { key: "QUICK" as const, label: "Quick", text: "Top 60 per phrase for each place. Cheapest; good for testing a niche." },
              { key: "THOROUGH" as const, label: "Thorough (recommended)", text: "Covers the area with a grid and splits busy cells, to get past Google's 60-result limit." },
            ].map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDepth(d.key)}
                className={`rounded-lg border px-3 py-2 text-left ${depth === d.key ? "border-brand bg-brand-soft" : "border-neutral-200 hover:border-neutral-400"}`}
              >
                <div className="text-sm font-medium text-neutral-900">{d.label}</div>
                <div className="text-xs text-neutral-500">{d.text}</div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-28">
        <div className="card-t">Before you run it</div>
        {fresh ? (
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-neutral-500">Areas found: </span>
              {estimate.areas!.map((a) => a.name).join(" · ")}
            </div>
            <div>
              <span className="text-neutral-500">Cell searches: </span>
              {estimate.cellQueries}
            </div>
            <div>
              <span className="text-neutral-500">Google requests: </span>
              {estimate.requestsMin}–{estimate.requestsMax}
            </div>
            <div className="text-base font-semibold text-ink">
              Estimated cost: {money(estimate.costMinUsd!)}
              {estimate.costMaxUsd! > estimate.costMinUsd! && ` – ${money(estimate.costMaxUsd!)}`}
            </div>
            <div className="text-xs text-neutral-500">
              This month so far: {money(estimate.spendUsd!)} of your ${estimate.capUsd} cap. Free allowances are used first.
            </div>
            {overCap && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">It may reach the cap and pause. You can resume after raising the cap in Settings.</div>}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Estimate first: it finds each place on the map and works out how many Google requests the search needs, and what they cost.</p>
        )}
        <div className="space-y-2 border-t border-neutral-200 pt-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Repeat every week
          </label>
          {repeat && (
            <div className="flex flex-wrap items-center gap-2 text-neutral-600">
              <select className="input-sm" aria-label="Day" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              at
              <select className="input-sm" aria-label="Hour" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
              IST
              <p className="w-full text-xs text-neutral-500">Runs now, then weekly. Only new businesses become leads, so repeats cost little.</p>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={runEstimate} disabled={pending || !areas.trim() || !keyConfigured}>
            {pending && !fresh ? "Estimating…" : "Estimate"}
          </button>
          <button type="button" className="btn-primary flex-1" onClick={run} disabled={pending || !fresh}>
            {pending && fresh ? "Starting…" : "Run search"}
          </button>
        </div>
      </aside>
    </div>
  );
}
