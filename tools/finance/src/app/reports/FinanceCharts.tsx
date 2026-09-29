"use client";

import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { inr } from "@genclover/ui/format";

// Validated categorical slots (dataviz reference palette, light surface). Single ₹ axis for every series.
const C = { a: "#2a78d6", b: "#eb6834", c: "#1baf7a" };
const AXIS = { fontSize: 11, fill: "var(--chart-axis)" };
const lakh = (n: number) => `₹${(n / 1e5).toFixed(Math.abs(n) >= 1e6 ? 0 : 1)}L`;

export type FlowRow = { label: string; a: number; b: number; c: number };

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface px-3 py-2 text-xs shadow">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-neutral-600"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>
          <span className="tabular-nums text-ink">{inr(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Two bar series (a, b) + one line (c), all in ₹, with a table toggle. */
export function FlowChart({ title, data, names }: { title: string; data: FlowRow[]; names: [string, string, string] }) {
  const [table, setTable] = useState(false);
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">{title}</div>
        <button className="text-xs text-brand-fg underline" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Month</th>{names.map((n) => <th key={n} className="num">{n}</th>)}</tr></thead>
            <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{inr(d.a)}</td><td className="num">{inr(d.b)}</td><td className="num font-semibold">{inr(d.c)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={lakh} tick={AXIS} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<Tip />} cursor={{ fill: "var(--chart-cursor)" }} />
              <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span style={{ color: "var(--chart-axis)" }}>{v}</span>} />
              <Bar dataKey="a" name={names[0]} fill={C.a} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Bar dataKey="b" name={names[1]} fill={C.b} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Line dataKey="c" name={names[2]} stroke={C.c} strokeWidth={2} dot={{ r: 4, fill: C.c, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
