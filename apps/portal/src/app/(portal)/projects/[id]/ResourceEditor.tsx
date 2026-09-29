"use client";

import { useEffect, useState, useTransition } from "react";
import { type Bucket, effectiveRate, lineHours, quoteSummary, split } from "@/lib/calc";
import { pct, usd, usd0 } from "@/lib/format";
import { saveResources } from "../actions";

export type RoleOpt = { id: string; name: string; family: string; standardRate: number; floor: number; premium: number };
export type Line = {
  id?: string;
  roleId: string | null;
  label: string;
  headcount: number;
  hoursPerMonth: number;
  tier: string;
  quotedRate: number;
  agreedRate: number | null;
  standardRate: number;
  floorRate: number;
};

export default function ResourceEditor({
  projectId,
  initial,
  roles,
  buckets,
  packages,
  readOnly,
}: {
  projectId: string;
  initial: Line[];
  roles: RoleOpt[];
  buckets: Bucket[];
  packages: { blendedRate: number; retainerAmount: number; retainerHours: number; additionalHourRate: number };
  readOnly: boolean;
}) {
  const initialKey = JSON.stringify(initial);
  const [rows, setRows] = useState<Line[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setRows(JSON.parse(initialKey)), [initialKey]);
  const dirty = JSON.stringify(rows) !== initialKey;
  const roleById = new Map(roles.map((r) => [r.id, r]));

  const set = (i: number, patch: Partial<Line>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const rateFor = (tier: string, r: Line) => {
    const role = r.roleId ? roleById.get(r.roleId) : undefined;
    if (tier === "STANDARD") return r.standardRate;
    if (tier === "FLOOR") return r.floorRate;
    if (tier === "PREMIUM") return role?.premium ?? Math.round(r.standardRate * 1.15);
    return r.quotedRate;
  };

  const pickRole = (i: number, roleId: string) => {
    const role = roleById.get(roleId);
    if (!role) return set(i, { roleId: null, tier: "CUSTOM" });
    const r = rows[i];
    const base = { ...r, roleId, standardRate: role.standardRate, floorRate: role.floor, label: r.label && !roles.some((x) => x.name === r.label) ? r.label : role.name };
    set(i, { ...base, quotedRate: rateFor(r.tier === "CUSTOM" ? "STANDARD" : r.tier, base), tier: r.tier === "CUSTOM" ? "STANDARD" : r.tier });
  };

  const add = () => {
    const role = roles[0];
    setRows((rs) => [
      ...rs,
      { roleId: role?.id ?? null, label: role?.name ?? "Resource", headcount: 1, hoursPerMonth: 160, tier: "STANDARD", quotedRate: role?.standardRate ?? 0, agreedRate: null, standardRate: role?.standardRate ?? 0, floorRate: role?.floor ?? 0 },
    ]);
  };

  const q = quoteSummary(rows);
  const s = split(q.agreed, buckets);

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-h">
          <div className="card-t">Resource plan & quote</div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span>}
              <button className="btn-secondary" onClick={add}>+ Add resource</button>
              <button className="btn-secondary" disabled={!dirty || pending} onClick={() => setRows(JSON.parse(initialKey))}>Discard</button>
              <button className="btn-primary" disabled={!dirty || pending} onClick={() => start(async () => setMsg((await saveResources(projectId, rows)) ?? null))}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Rate card role</th>
                <th>Label on quote</th>
                <th>HC</th>
                <th>Hrs / mo (each)</th>
                <th>Tier</th>
                <th>Quoted $/hr</th>
                <th>Agreed $/hr</th>
                <th className="num">Std / Floor</th>
                <th className="num">Monthly</th>
                {buckets.filter((b) => b.category !== "CORPORATE").map((b) => <th key={b.key} className="num">{b.name.split(" ")[0]} {b.percent}%</th>)}
                <th className="num">Corp {buckets.filter((b) => b.category === "CORPORATE").reduce((a, b) => a + b.percent, 0)}%</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const monthly = lineHours(r) * effectiveRate(r);
                const ls = split(monthly, buckets);
                const low = effectiveRate(r) < r.floorRate;
                return (
                  <tr key={r.id ?? `n${i}`}>
                    <td>
                      <select className="input-sm w-56" value={r.roleId ?? ""} disabled={readOnly} onChange={(e) => pickRole(i, e.target.value)}>
                        <option value="">— Custom (no rate card) —</option>
                        {roles.map((ro) => <option key={ro.id} value={ro.id}>{ro.name} (${ro.standardRate})</option>)}
                      </select>
                    </td>
                    <td><input className="input-sm w-52" value={r.label} disabled={readOnly} onChange={(e) => set(i, { label: e.target.value })} /></td>
                    <td><input className="input-sm w-14" type="number" min={1} value={r.headcount} disabled={readOnly} onChange={(e) => set(i, { headcount: Math.max(1, Number(e.target.value) || 1) })} /></td>
                    <td><input className="input-sm w-20" type="number" min={0} value={r.hoursPerMonth} disabled={readOnly} onChange={(e) => set(i, { hoursPerMonth: Number(e.target.value) || 0 })} /></td>
                    <td>
                      <select className="input-sm" value={r.tier} disabled={readOnly} onChange={(e) => set(i, { tier: e.target.value, quotedRate: rateFor(e.target.value, r) })}>
                        <option value="STANDARD">Standard</option>
                        <option value="FLOOR">Floor</option>
                        <option value="PREMIUM">Premium</option>
                        <option value="CUSTOM">Custom</option>
                      </select>
                    </td>
                    <td>
                      <input className="input-sm w-20" type="number" min={0} value={r.quotedRate} disabled={readOnly || (r.tier !== "CUSTOM" && r.tier !== "PREMIUM")} onChange={(e) => set(i, { quotedRate: Number(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className={`input-sm w-20 ${low ? "border-red-400 text-red-700" : ""}`} type="number" min={0} placeholder="= quoted" value={r.agreedRate ?? ""} disabled={readOnly} onChange={(e) => set(i, { agreedRate: e.target.value === "" ? null : Number(e.target.value) })} />
                    </td>
                    <td className="num text-xs text-neutral-500">${r.standardRate} / ${r.floorRate}</td>
                    <td className="num font-medium">{usd(monthly)}</td>
                    {ls.lines.filter((l) => l.category !== "CORPORATE").map((l) => <td key={l.key} className="num text-neutral-600">{usd(l.amount)}</td>)}
                    <td className="num text-neutral-600">{usd(ls.corporate)}</td>
                    {!readOnly && <td><button className="btn-danger btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={14} className="py-8 text-center text-neutral-500">No resources yet. Add roles from the rate card to build the quote.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3}>TOTAL</td>
                  <td>{q.hours} hrs</td>
                  <td colSpan={3}>Blended {usd(q.blendedAgreed)}/hr</td>
                  <td></td>
                  <td className="num">{usd(q.agreed)}</td>
                  {s.lines.filter((l) => l.category !== "CORPORATE").map((l) => <td key={l.key} className="num">{usd(l.amount)}</td>)}
                  <td className="num">{usd(s.corporate)}</td>
                  {!readOnly && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {q.belowFloor.length > 0 && (
          <div className="border-t border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">
            ⚠ Below negotiation floor: {q.belowFloor.join(", ")}. This cuts into Delivery and Risk — needs a strategic reason.
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="card-t mb-3">Quote summary (per month)</div>
          <dl className="space-y-1.5 text-sm">
            <Row k="At standard rates" v={usd(q.standard)} />
            <Row k="At negotiation floor" v={usd(q.floor)} />
            <Row k="Quoted" v={usd(q.quoted)} />
            <Row k="Agreed (per-role)" v={<b>{usd(q.agreed)}</b>} />
            <Row k="Agreed vs standard" v={`${q.discountVsStandard > 0 ? "−" : "+"}${pct(Math.abs(q.discountVsStandard), 1)}`} />
            <Row k="Blended agreed rate" v={`${usd(q.blendedAgreed)}/hr`} />
          </dl>
        </div>
        <div className="card p-5">
          <div className="card-t mb-3">Package alternatives</div>
          <dl className="space-y-1.5 text-sm">
            <Row k={`Blended ${usd0(packages.blendedRate)} × ${q.hours} hrs`} v={usd(packages.blendedRate * q.hours)} />
            <Row
              k={`Retainer ${usd0(packages.retainerAmount)} (${packages.retainerHours} hrs) + extra @ ${usd0(packages.additionalHourRate)}`}
              v={usd(packages.retainerAmount + Math.max(0, q.hours - packages.retainerHours) * packages.additionalHourRate)}
            />
          </dl>
          <p className="mt-3 text-xs text-neutral-500">Set the final commercial model on the Agreement tab.</p>
        </div>
        <div className="card p-5">
          <div className="card-t mb-3">Allocation of agreed monthly</div>
          <dl className="space-y-1.5 text-sm">
            {s.lines.map((l) => <Row key={l.key} k={`${l.name} (${l.percent}%)`} v={usd(l.amount)} />)}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-600">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
