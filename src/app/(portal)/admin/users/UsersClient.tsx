"use client";

import { useActionState, useState, useTransition } from "react";
import { StatusBadgeClient } from "@/components/StatusBadgeClient";
import { createUser, resetPassword, updateUser } from "../actions";

type U = { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null };

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action} className="card grid gap-3 p-5 md:grid-cols-5 md:items-end">
      <div><label className="label">Name</label><input className="input" name="name" required /></div>
      <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
      <div>
        <label className="label">Role</label>
        <select className="input" name="role" defaultValue="VIEWER">
          <option value="VIEWER">Viewer — read only</option>
          <option value="EDITOR">Editor — manage clients/projects/billing</option>
          <option value="ADMIN">Admin — full control</option>
        </select>
      </div>
      <div><label className="label">Temporary password</label><input className="input" name="password" type="text" minLength={8} required /></div>
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create user"}</button>
      {state && <p className={`text-sm md:col-span-5 ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>}
    </form>
  );
}

export function UsersTable({ users, meId }: { users: U[]; meId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => setMsg(await fn()));

  return (
    <div className="card overflow-x-auto">
      {msg && <div className={`px-5 py-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</div>}
      <table className="tbl">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="font-medium">{u.name}{u.id === meId && <span className="ml-1 text-xs text-neutral-400">(you)</span>}</td>
              <td>{u.email}</td>
              <td>
                <select className="input-sm" value={u.role} disabled={pending} onChange={(e) => run(() => updateUser(u.id, { role: e.target.value }))}>
                  <option value="ADMIN">ADMIN</option>
                  <option value="EDITOR">EDITOR</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </td>
              <td><StatusBadgeClient label={u.active ? "Active" : "Disabled"} tone={u.active ? "green" : "red"} /></td>
              <td className="text-xs text-neutral-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
              <td className="space-x-2 whitespace-nowrap">
                <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => updateUser(u.id, { active: !u.active }))}>
                  {u.active ? "Disable" : "Enable"}
                </button>
                <button
                  className="btn-secondary btn-sm"
                  disabled={pending}
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
