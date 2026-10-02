"use client";

// What was sold on a deal, with the qualifying service: edited at onboarding and in the owner's corrections.
// People who can't see amounts only tick and name services; the values stay as recorded.
import { useState } from "react";
import { highestValue, type ServiceLine } from "./rules";

export default function ServicesEditor({
  lines,
  onChange,
  picked,
  onPick,
  showValues,
  currency,
  disabled,
}: {
  lines: ServiceLine[];
  onChange: (lines: ServiceLine[]) => void;
  picked: string | null; // null = the highest-value service
  onPick: (key: string | null) => void;
  showValues: boolean;
  currency: string;
  disabled?: boolean;
}) {
  const [n, setN] = useState(1);
  const top = highestValue(lines);
  const set = (i: number, patch: Partial<ServiceLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const sym = currency === "USD" ? "$" : "₹";
  return (
    <div className="overflow-x-auto">
      <table className="tbl text-sm">
        <thead>
          <tr>
            <th>Service sold</th>
            <th>Billing</th>
            {showValues && <th className="num">Agreed price {sym} (excl. GST)</th>}
            <th className="text-center">Qualifies</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key}>
              <td><input className="input" value={l.label} disabled={disabled} onChange={(e) => set(i, { label: e.target.value })} /></td>
              <td>
                <select className="input" value={l.kind} disabled={disabled} onChange={(e) => set(i, { kind: e.target.value as ServiceLine["kind"] })}>
                  <option value="ONE_TIME">One-time</option>
                  <option value="MONTHLY">Monthly (first month counts)</option>
                </select>
              </td>
              {showValues && (
                <td className="num">
                  <input className="input w-32 text-right" type="number" min={0} disabled={disabled} value={l.value ?? ""} onChange={(e) => set(i, { value: e.target.value === "" ? null : Number(e.target.value) })} placeholder="price" />
                </td>
              )}
              <td className="text-center">
                <input type="radio" name="qualifying" disabled={disabled} checked={picked === l.key || (picked == null && top?.key === l.key)} onChange={() => onPick(l.key)} />
              </td>
              <td className="text-right">
                {!disabled && lines.length > 1 && (
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => { onChange(lines.filter((_, j) => j !== i)); if (picked === l.key) onPick(null); }}>Remove</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <button type="button" className="btn-secondary btn-sm" onClick={() => { onChange([...lines, { key: `EXTRA:${Date.now()}:${n}`, label: "", kind: "ONE_TIME", value: null }]); setN(n + 1); }}>+ Service</button>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={picked == null} onChange={(e) => onPick(e.target.checked ? null : (top?.key ?? lines[0]?.key ?? null))} />
            Qualifying service = the highest-value one (default)
          </label>
          {showValues && top && <span className="text-neutral-500">Highest: {top.label}</span>}
        </div>
      )}
    </div>
  );
}
