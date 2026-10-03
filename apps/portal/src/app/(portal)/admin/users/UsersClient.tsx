"use client";

import { useState, useTransition } from "react";
import { StatusBadgeClient } from "@genclover/ui/status-badge";
import { createUser, editUser, resetPassword, updateUser } from "./actions";
import { useFormAction } from "@genclover/ui/form-action";

type U = { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null };
type R = { key: string; label: string; description: string };
type SortKey = "name" | "email" | "status" | "lastLoginAt";

export function NewUserForm({ roles }: { roles: R[] }) {
  const { state, pending, form } = useFormAction(createUser, { resetOnSuccess: true });
  return (
    <form {...form} className="card grid gap-3 p-5 md:grid-cols-5 md:items-end">
      <div><label className="label">Name</label><input className="input" name="name" required /></div>
      <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
      <div>
        <label className="label">Role</label>
        <select className="input" name="role" defaultValue="TEAM">
          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      <div><label className="label">Temporary password</label><input className="input" name="password" type="text" minLength={8} required /></div>
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create user"}</button>
      {state && <p className={`text-sm md:col-span-5 ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>}
    </form>
  );
}

/** isOwner: only an owner may give or take the Owner role, or change an owner's account (Admins manage everyone else). */
export function UsersTable({ users, meId, roles, isOwner }: { users: U[]; meId: string; roles: R[]; isOwner: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => setMsg(await fn()));
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; email: string } | null>(null);
  const roleLabel = (k: string) => roles.find((r) => r.key === k)?.label ?? k;
  // Search by name, email or role name; filter by role and status.
  const needle = q.trim().toLowerCase();
  const shown = users.filter(
    (u) =>
      (!needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle) || roleLabel(u.role).toLowerCase().includes(needle)) &&
      (!role || u.role === role) &&
      (!status || (status === "active" ? u.active : !u.active)),
  );
  // Click a column header to sort by it; click again to reverse. Name A–Z by default.
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const sorted = [...shown].sort((a, b) => {
    const v = (u: U) => (sort.key === "status" ? (u.active ? 0 : 1) : sort.key === "lastLoginAt" ? (u.lastLoginAt ? Date.parse(u.lastLoginAt) : -Infinity) : u[sort.key].toLowerCase());
    const [x, y] = [v(a), v(b)];
    const c = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
    return sort.dir === "asc" ? c : -c;
  });
  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase hover:text-ink"
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <span className={sort.key === key ? "text-ink" : "text-neutral-300"}>{sort.key === key && sort.dir === "desc" ? "↓" : "↑"}</span>
      </button>
    </th>
  );
  const locked = (u: U) => !isOwner && u.role === "OWNER";
  const save = () =>
    editing &&
    start(async () => {
      const r = await editUser(editing.id, { name: editing.name, email: editing.email });
      setMsg(r);
      if (r.ok) setEditing(null);
    });

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-5 py-3">
        <input className="input-sm w-64" placeholder="Search name, email or role…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <select className="input-sm w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <select className="input-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Active and disabled</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <span className="text-xs text-neutral-500">{shown.length} of {users.length}</span>
        {(q || role || status) && <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => { setQ(""); setRole(""); setStatus(""); }}>Clear</button>}
      </div>
      {msg && <div className={`px-5 py-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</div>}
      <table className="tbl">
        <thead>
          <tr>{th("name", "Name")}{th("email", "Email")}<th>Role</th>{th("status", "Status")}{th("lastLoginAt", "Last login")}<th>Actions</th></tr>
        </thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">No users match.</td></tr>}
          {sorted.map((u) => (
            <tr key={u.id}>
              {editing?.id === u.id ? (
                <>
                  <td><input className="input-sm w-full" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Name" autoFocus /></td>
                  <td>
                    <input className="input-sm w-full" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} aria-label="Email" />
                    {editing.email.trim().toLowerCase() !== u.email && <div className="mt-1 text-xs text-amber-700">They sign in with the new email. Change it on their People record too, if they have one.</div>}
                  </td>
                </>
              ) : (
                <>
                  <td className="font-medium">{u.name}{u.id === meId && <span className="ml-1 text-xs text-neutral-400">(you)</span>}</td>
                  <td>{u.email}</td>
                </>
              )}
              <td>
                <select className="input-sm" value={u.role} disabled={pending || (!isOwner && u.role === "OWNER")} title={roles.find((r) => r.key === u.role)?.description} onChange={(e) => run(() => updateUser(u.id, { role: e.target.value }))}>
                  {roles.filter((r) => isOwner || r.key !== "OWNER" || u.role === "OWNER").map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </td>
              <td><StatusBadgeClient label={u.active ? "Active" : "Disabled"} tone={u.active ? "green" : "red"} /></td>
              <td className="text-xs text-neutral-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
              <td className="space-x-2 whitespace-nowrap">
                {editing?.id === u.id ? (
                  <>
                    <button className="btn-primary btn-sm" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
                    <button className="btn-secondary btn-sm" disabled={pending} onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn-secondary btn-sm" disabled={pending || locked(u)} title={locked(u) ? "Only an owner can edit an owner" : undefined} onClick={() => setEditing({ id: u.id, name: u.name, email: u.email })}>
                    Edit
                  </button>
                )}
                <button className="btn-secondary btn-sm" disabled={pending || locked(u)} onClick={() => run(() => updateUser(u.id, { active: !u.active }))}>
                  {u.active ? "Disable" : "Enable"}
                </button>
                <button
                  className="btn-secondary btn-sm"
                  disabled={pending || locked(u)}
                  onClick={() => {
                    const pw = prompt(`New password for ${u.email} (min 8 chars):`);
                    if (pw) run(() => resetPassword(u.id, pw));
                  }}
                >
                  Reset password
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
