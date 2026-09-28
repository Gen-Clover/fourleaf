"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; icon: string; editor?: boolean };

const MAIN: Item[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/projects", label: "Projects", icon: "◧" },
  { href: "/clients", label: "Clients", icon: "◉" },
  { href: "/calculator", label: "Quick Calculator", icon: "∑" },
  { href: "/rate-card", label: "Rate Card", icon: "☰" },
];

const CFO: Item[] = [
  { href: "/cfo", label: "CFO Dashboard", icon: "◎", editor: true },
  { href: "/funds", label: "Funds", icon: "▣", editor: true },
  { href: "/commitments", label: "Commitments", icon: "⧗", editor: true },
  { href: "/planner", label: "Hire Planner", icon: "⚖", editor: true },
  { href: "/pipeline", label: "Sales Pipeline", icon: "↗", editor: true },
];

const DELIVERY: Item[] = [
  { href: "/timesheets", label: "Timesheets", icon: "◷" },
  { href: "/people", label: "People", icon: "☺", editor: true },
];

const FINANCE: Item[] = [
  { href: "/billing", label: "Monthly Billing", icon: "₿" },
  { href: "/invoices", label: "Invoices", icon: "⎙" },
  { href: "/expenses", label: "Expenses", icon: "₹", editor: true },
  { href: "/reports", label: "Reports", icon: "▤", editor: true },
];

const ADMIN: Item[] = [
  { href: "/admin", label: "Admin Overview", icon: "⚙" },
  { href: "/admin/rate-card", label: "Manage Rate Card", icon: "✎" },
  { href: "/admin/formula", label: "Formula & Allocation", icon: "ƒ" },
  { href: "/admin/policies", label: "Financial Policies", icon: "§" },
  { href: "/admin/users", label: "Users & Roles", icon: "👤" },
  { href: "/admin/audit", label: "Audit Log", icon: "⎘" },
];

export default function Sidebar({ role, name, company }: { role: string; name: string; company: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : href === "/admin" ? path === "/admin" : path.startsWith(href));

  const link = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={() => setOpen(false)}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
        isActive(i.href) ? "bg-brand text-white" : "text-neutral-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="w-4 text-center opacity-80">{i.icon}</span>
      {i.label}
    </Link>
  );

  return (
    <>
      <div className="flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <span className="font-semibold text-white">{company} Portal</span>
        <button className="btn-secondary btn-sm" onClick={() => setOpen(!open)}>Menu</button>
      </div>
      <aside
        className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-ink p-4 lg:block`}
      >
        <div className="mb-6 flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-bold text-white">GC</div>
          <div>
            <div className="text-sm font-semibold text-white">{company}</div>
            <div className="text-xs text-neutral-400">Financial Control System</div>
          </div>
        </div>
        <nav className="space-y-1">{MAIN.map(link)}</nav>
        {[["Financial Control", CFO], ["Delivery", DELIVERY], ["Finance", FINANCE]].filter(([, items]) => (items as Item[]).some((i) => !i.editor || role !== "VIEWER")).map(([title, items]) => (
          <div key={title as string}>
            <div className="mt-6 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{title as string}</div>
            <nav className="space-y-1">{(items as Item[]).filter((i) => !i.editor || role !== "VIEWER").map(link)}</nav>
          </div>
        ))}
        {role === "ADMIN" && (
          <>
            <div className="mt-6 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Admin Panel</div>
            <nav className="space-y-1">{ADMIN.map(link)}</nav>
          </>
        )}
        <div className="mt-8 rounded-lg bg-white/5 p-3">
          <div className="truncate text-sm text-white">{name}</div>
          <div className="mb-2 text-xs text-neutral-400">{role}</div>
          <form action="/logout" method="post">
            <button className="text-xs text-neutral-300 underline hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
