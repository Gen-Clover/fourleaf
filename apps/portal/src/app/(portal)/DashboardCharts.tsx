"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usd0 } from "@/lib/format";

// Validated categorical slots (dataviz reference palette, light surface)
const SERIES = [
  { key: "delivery", name: "Delivery", color: "#2a78d6" },
  { key: "growth", name: "Growth / Talent", color: "#eb6834" },
  { key: "corporate", name: "Corporate (ex-profit)", color: "#1baf7a" },
  { key: "profit", name: "Retained profit", color: "#eda100" },
];
const SINGLE = "#2a78d6";
const AXIS = { fontSize: 11, fill: "#52514e" };
const k = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`);

export type TrendRow = { label: string; delivery: number; growth: number; corporate: number; profit: number; total: number };

function TipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-neutral-600"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>
          <span className="tabular-nums text-ink">{usd0(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{usd0(total)}</span></div>}
    </div>
  );
}

export function RevenueTrend({ data }: { data: TrendRow[] }) {
  const [table, setTable] = useState(false);
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Monthly revenue & allocation — last 12 months</div>
        <button className="text-xs text-brand underline" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Month</th>{SERIES.map((s) => <th key={s.key} className="num">{s.name}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}><td>{d.label}</td>{SERIES.map((s) => <td key={s.key} className="num">{usd0(d[s.key as keyof TrendRow] as number)}</td>)}<td className="num font-semibold">{usd0(d.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#ececea" />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={k} tick={AXIS} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<TipBox />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Legend
                iconType="square"
                iconSize={9}
                itemSorter={null}
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value: string) => <span style={{ color: "#52514e" }}>{value}</span>}
              />
              {SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="a"
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth={2}
                  maxBarSize={36}
                  isAnimationActive={false}
                  radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function HBar({ title, data, valueLabel = "Revenue" }: { title: string; data: { label: string; value: number }[]; valueLabel?: string }) {
  const h = Math.max(160, data.length * 34 + 30);
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">{title}</div></div>
      {data.length === 0 ? (
        <p className="p-6 text-center text-sm text-neutral-500">No data yet.</p>
      ) : (
        <div className="p-3" style={{ height: h }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#ececea" />
              <XAxis type="number" tickFormatter={k} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={150} />
              <Tooltip content={<TipBox />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar
                dataKey="value"
                name={valueLabel}
                fill={SINGLE}
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                isAnimationActive={false}
                label={{ position: "right", formatter: (v: unknown) => k(Number(v)), fontSize: 11, fill: "#52514e" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
