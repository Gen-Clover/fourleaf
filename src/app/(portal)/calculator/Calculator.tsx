"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type Bucket, MODELS, monthlyRevenue, split } from "@/lib/calc";
import { pct, usd, usd0 } from "@/lib/format";
import { createProjectFromCalculator } from "../projects/actions";

export type CalcRole = { id: string; name: string; standard: number; floor: number; premium: number; usLoaded: number };
type L = { roleId: string; headcount: number; hoursPerMonth: number; tier: string; quotedRate: number };
type Pkg = { blendedRate: number; retainerAmount: number; retainerHours: number; additionalHourRate: number };

export default function Calculator({ roles, buckets, pkg, clients, canSave }: { roles: CalcRole[]; buckets: Bucket[]; pkg: Pkg; clients: { id: string; name: string }[]; canSave: boolean }) {
  const router = useRouter();
  const byId = new Map(roles.map((r) => [r.id, r]));
  const rateFor = (roleId: string, tier: string, current = 0) => {
    const r = byId.get(roleId);
    if (!r) return current;
    return tier === "STANDARD" ? r.standard : tier === "FLOOR" ? r.floor : tier === "PREMIUM" ? r.premium : current;
  };
  const [lines, setLines] = useState<L[]>([]);
  const [model, setModel] = useState("TM");
  const [save, setSave] = useState({ name: "", clientId: "" });
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (roleId = roles[0]?.id) => roleId && setLines((ls) => [...ls, { roleId, headcount: 1, hoursPerMonth: 160, tier: "STANDARD", quotedRate: rateFor(roleId, "STANDARD") }]);

  const worked = lines.map((l) => ({ hours: l.headcount * l.hoursPerMonth, rate: l.quotedRate }));
  const hours = worked.reduce((s, w) => s + w.hours, 0);
  const std = lines.reduce((s, l) => s + l.headcount * l.hoursPerMonth * (byId.get(l.roleId)?.standard ?? 0), 0);
  const floor = lines.reduce((s, l) => s + l.headcount * l.hoursPerMonth * (byId.get(l.roleId)?.floor ?? 0), 0);
  const us = lines.reduce((s, l) => s + l.headcount * l.hoursPerMonth * (byId.get(l.roleId)?.usLoaded ?? 0), 0);
  const agreement = { engagementModel: model, agreedMonthly: pkg.retainerAmount, agreedRetainerHrs: pkg.retainerHours, agreedExtraRate: pkg.additionalHourRate, agreedBlendedRate: pkg.blendedRate };
  const rev = monthlyRevenue(agreement, worked).revenue;
  const s = split(rev, buckets);
  const options = Object.keys(MODELS).filter((k) => k !== "FIXED").map((k) => ({ k, v: monthlyRevenue({ ...agreement, engagementModel: k }, worked).revenue }));

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-h">
          <div className="card-t">Resources</div>
          <div className="flex items-center gap-2">
            <select className="input-sm" value="" onChange={(e) => add(e.target.value)}>
              <option value="">+ Add role…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name} (${r.standard})</option>)}
            </select>
            {lines.length > 0 && <button className="btn-secondary btn-sm" onClick={() => setLines([])}>Clear</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Role</th><th>HC</th><th>Hrs / mo</th><th>Tier</th><th>Rate $/hr</th><th className="num">Monthly</th><th className="num">US onsite equiv.</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const r = byId.get(l.roleId);
                return (
                  <tr key={i}>
                    <td>
                      <select className="input-sm w-64" value={l.roleId} onChange={(e) => set(i, { roleId: e.target.value, quotedRate: rateFor(e.target.value, l.tier, l.quotedRate) })}>
                        {roles.map((ro) => <option key={ro.id} value={ro.id}>{ro.name}</option>)}
                      </select>
                    </td>
                    <td><input className="input-sm w-14" type="number" min={1} value={l.headcount} onChange={(e) => set(i, { headcount: Math.max(1, Number(e.target.value) || 1) })} /></td>
                    <td><input className="input-sm w-20" type="number" min={0} value={l.hoursPerMonth} onChange={(e) => set(i, { hoursPerMonth: Number(e.target.value) || 0 })} /></td>
                    <td>
                      <select className="input-sm" value={l.tier} onChange={(e) => set(i, { tier: e.target.value, quotedRate: rateFor(l.roleId, e.target.value, l.quotedRate) })}>
                        <option value="STANDARD">Standard</option><option value="FLOOR">Floor</option><option value="PREMIUM">Premium</option><option value="CUSTOM">Custom</option>
                      </select>
                    </td>
                    <td><input className="input-sm w-20" type="number" min={0} value={l.quotedRate} disabled={l.tier !== "CUSTOM"} onChange={(e) => set(i, { quotedRate: Number(e.target.value) || 0 })} /></td>
                    <td className="num font-medium">{usd(l.headcount * l.hoursPerMonth * l.quotedRate)}</td>
                    <td className="num text-neutral-500">{usd0(l.headcount * l.hoursPerMonth * (r?.usLoaded ?? 0))}</td>
                    <td><button className="btn-danger btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></td>
                  </tr>
                );
              })}
              {lines.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-neutral-500">Pick roles from the rate card to start calculating.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <div className="card-t mb-3">Commercial model</div>
          <div className="space-y-2">
            {options.map((o) => (
              <label key={o.k} className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${model === o.k ? "border-brand bg-brand-soft" : "border-neutral-200"}`}>
                <span className="flex items-center gap-2"><input type="radio" checked={model === o.k} onChange={() => setModel(o.k)} />{MODELS[o.k]}</span>
                <b className="tabular-nums">{usd0(o.v)}</b>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">Blended {usd0(pkg.blendedRate)}/hr · Retainer {usd0(pkg.retainerAmount)} for {pkg.retainerHours} hrs + {usd0(pkg.additionalHourRate)}/hr extra</p>
        </div>
        <div className="card p-5">
          <div className="card-t mb-3">Monthly result</div>
          <div className="text-3xl font-semibold tabular-nums text-brand">{usd(rev)}</div>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Hours</dt><dd>{hours}</dd></div>
            <div className="flex justify-between"><dt>Effective rate</dt><dd>{hours ? usd(rev / hours) : "—"}/hr</dd></div>
            <div className="flex justify-between"><dt>At standard</dt><dd>{usd0(std)}</dd></div>
            <div className="flex justify-between"><dt>At floor</dt><dd className={rev < floor ? "font-semibold text-red-600" : ""}>{usd0(floor)}</dd></div>
            <div className="flex justify-between"><dt>US onsite equivalent</dt><dd>{usd0(us)}</dd></div>
            <div className="flex justify-between font-medium"><dt>Client savings vs US</dt><dd className="text-emerald-700">{us ? pct(1 - rev / us) : "—"}</dd></div>
          </dl>
        </div>
        <div className="card p-5">
          <div className="card-t mb-3">Internal allocation</div>
          <dl className="space-y-1 text-sm">
            {s.lines.map((l) => <div key={l.key} className="flex justify-between"><dt className="text-neutral-600">{l.name} ({l.percent}%)</dt><dd className="tabular-nums">{usd(l.amount)}</dd></div>)}
          </dl>
        </div>
      </div>

      {canSave && lines.length > 0 && (
        <div className="card flex flex-wrap items-end gap-3 p-5">
          <div className="grow"><label className="label">Save as project — name</label><input className="input" value={save.name} onChange={(e) => setSave({ ...save, name: e.target.value })} /></div>
          <div>
            <label className="label">Client</label>
            <select className="input" value={save.clientId} onChange={(e) => setSave({ ...save, clientId: e.target.value })}>
              <option value="">Select…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await createProjectFromCalculator({ ...save, engagementModel: model, lines });
                setMsg(res ?? null);
                if (res?.ok && res.id) router.push(`/projects/${res.id}?tab=pricing`);
              })
            }
          >
            {pending ? "Creating…" : "Create project"}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
        </div>
      )}
    </div>
  );
}
