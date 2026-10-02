"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@genclover/ui";
import { COMPLIANCE_CATEGORIES, FREQUENCIES } from "../../lib/governance";
import { markFiled, saveComplianceItem, setComplianceActive } from "../actions";

type Result = { ok: boolean; message: string } | undefined;
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result>(undefined);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, msg, run };
}
const Msg = ({ msg }: { msg: Result }) => (msg ? <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</span> : null);

/** "Mark filed": period, date, acknowledgement / challan number, evidence link. */
export function FileForm({ itemId, period }: { itemId: string; period: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>Mark filed</button>;
  return <FileFields itemId={itemId} period={period} onClose={() => setOpen(false)} />;
}

function FileFields({ itemId, period, onClose }: { itemId: string; period: string; onClose: () => void }) {
  const { pending, msg, run } = useRun();
  const [f, setF] = useState({ period, filedAt: new Date().toISOString().slice(0, 10), reference: "", evidenceUrl: "", notes: "" });
  return (
    <div className="mt-2 grid gap-2 rounded-lg bg-neutral-50 p-3 text-sm md:grid-cols-5">
      <input className="input-sm" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} aria-label="Period" />
      <input className="input-sm" type="date" value={f.filedAt} onChange={(e) => setF({ ...f, filedAt: e.target.value })} aria-label="Filed on" />
      <input className="input-sm" placeholder="ARN / challan / SRN" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
      <input className="input-sm" placeholder="Evidence link (https://…)" value={f.evidenceUrl} onChange={(e) => setF({ ...f, evidenceUrl: e.target.value })} />
      <div className="flex gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => markFiled(itemId, f), () => onClose())}>Save</button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => onClose()}>Cancel</button>
      </div>
      <div className="md:col-span-5"><Msg msg={msg} /></div>
    </div>
  );
}

export type RowView = {
  id: string;
  name: string;
  meta: string;
  notes: string | null;
  lastFiled: string | null;
  evidenceUrl: string | null;
  due: string;
  dueTone: "overdue" | "due" | "";
  state: string;
  active: boolean;
  period: string;
};

/**
 * One filing on one line: name and details on the left (notes in the same line, in full on hover), due date,
 * status and actions on the right. Edit and Mark filed open their forms under the row, at full width.
 */
export function ComplianceRow({ row, item, users, canEdit }: { row: RowView; item: ItemInput; users: { id: string; name: string }[]; canEdit: boolean }) {
  const [panel, setPanel] = useState<null | "edit" | "file">(null);
  const toggle = (p: "edit" | "file") => setPanel(panel === p ? null : p);
  return (
    <li className="px-5 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:flex-nowrap">
            <span className="font-medium text-neutral-900 sm:shrink-0">{row.name}</span>
            <span className="truncate text-xs text-neutral-500" title={row.notes ? `${row.meta}\n${row.notes}` : row.meta}>
              {row.meta}
              {row.notes && <span className="text-neutral-600"> · {row.notes}</span>}
            </span>
          </div>
          {row.lastFiled && (
            <div className="truncate text-xs text-neutral-500">
              Last filed: {row.lastFiled}
              {row.evidenceUrl && <> · <a className="text-brand-fg underline" href={row.evidenceUrl} target="_blank" rel="noreferrer">evidence</a></>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0">
          <span className={`text-sm whitespace-nowrap tabular-nums sm:w-36 sm:text-right ${row.dueTone === "overdue" ? "font-semibold text-red-700" : row.dueTone === "due" ? "font-medium text-amber-700" : "text-neutral-700"}`}>{row.due}</span>
          <span className="w-20"><StatusBadge status={row.state} /></span>
          {canEdit && (
            <span className="flex items-center gap-3">
              <button type="button" className="text-xs underline" onClick={() => toggle("edit")}>{panel === "edit" ? "Close" : "Edit"}</button>
              <StopButton id={row.id} active={row.active} />
              {row.active && (
                <button type="button" className={panel === "file" ? "btn-secondary btn-sm" : "btn-primary btn-sm"} onClick={() => toggle("file")}>
                  {panel === "file" ? "Cancel" : "Mark filed"}
                </button>
              )}
            </span>
          )}
        </div>
      </div>
      {panel === "edit" && (
        <div className="mt-2">
          <ItemForm initial={item} users={users} onDone={() => setPanel(null)} />
        </div>
      )}
      {panel === "file" && <FileFields itemId={row.id} period={row.period} onClose={() => setPanel(null)} />}
    </li>
  );
}

export function StopButton({ id, active }: { id: string; active: boolean }) {
  const { pending, run } = useRun();
  return (
    <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => setComplianceActive(id, !active))}>
      {active ? "Doesn't apply" : "Reactivate"}
    </button>
  );
}

export type ItemInput = { id?: string; name: string; category: string; authority: string; frequency: string; dueDate: string; ownerId: string; professional: string; remindDays: string; notes: string };

/** Add or edit a compliance item: what, how often, next due date, owner, the CA / CS, reminder days. */
export function ItemForm({ initial, users, onDone }: { initial: ItemInput; users: { id: string; name: string }[]; onDone?: () => void }) {
  const { pending, msg, run } = useRun();
  const [f, setF] = useState(initial);
  const set = (k: keyof ItemInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-2 rounded-lg bg-neutral-50 p-3 text-sm md:grid-cols-4">
      <input className="input md:col-span-2" placeholder="What (e.g. GSTR-1 monthly return)" value={f.name} onChange={set("name")} />
      <select className="input" value={f.category} onChange={set("category")}>
        {Object.entries(COMPLIANCE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input className="input" placeholder="Authority / portal" value={f.authority} onChange={set("authority")} />
      <select className="input" value={f.frequency} onChange={set("frequency")}>
        {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <label className="block"><span className="label">Next due</span><input className="input" type="date" value={f.dueDate} onChange={set("dueDate")} /></label>
      <label className="block">
        <span className="label">Owner</span>
        <select className="input" value={f.ownerId} onChange={set("ownerId")}>
          <option value="">—</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Remind days before</span><input className="input" type="number" min={0} max={90} value={f.remindDays} onChange={set("remindDays")} /></label>
      <input className="input md:col-span-2" placeholder="Professional (CA / CS / lawyer)" value={f.professional} onChange={set("professional")} />
      <input className="input md:col-span-2" placeholder="Notes" value={f.notes} onChange={set("notes")} />
      <div className="flex items-center gap-2 md:col-span-4">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveComplianceItem(f.id ?? null, f), onDone)}>Save</button>
        {onDone && <button type="button" className="btn-secondary btn-sm" onClick={onDone}>Cancel</button>}
        <Msg msg={msg} />
      </div>
    </div>
  );
}

export function AddItem({ users }: { users: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ Compliance item</button>;
  return (
    <div className="w-full">
      <ItemForm users={users} onDone={() => setOpen(false)} initial={{ name: "", category: "GST", authority: "", frequency: "MONTHLY", dueDate: new Date().toISOString().slice(0, 10), ownerId: "", professional: "", remindDays: "7", notes: "" }} />
    </div>
  );
}

export function EditItem({ item, users }: { item: ItemInput; users: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>Edit</button>;
  return (
    <div className="mt-2 w-full">
      <ItemForm initial={item} users={users} onDone={() => setOpen(false)} />
    </div>
  );
}
