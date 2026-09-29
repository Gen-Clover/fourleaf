"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CloverMark, Wordmark } from "@genclover/ui/brand";
import type { NavItem, ToolNav } from "@genclover/ui/nav";
import { ThemeToggle } from "@genclover/ui/theme-toggle";

/** Admin links that belong to the portal itself, not to any one tool. */
const CORE_ADMIN: NavItem[] = [
  { href: "/admin/users", label: "Users & Roles", icon: "👤" },
  { href: "/admin/audit", label: "Audit Log", icon: "⎘" },
];

export default function Sidebar({ role, name, tools }: { role: string; name: string; tools: ToolNav[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : href === "/admin" ? path === "/admin" : path.startsWith(href));
  const visible = (items: NavItem[]) => items.filter((i) => !i.editor || role !== "VIEWER");
  const adminItems = [...tools.flatMap((t) => t.admin ?? []), ...CORE_ADMIN];

  const link = (i: NavItem) => (
    <Link
      key={i.href}
      href={i.href}
      prefetch
      onClick={() => setOpen(false)}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive(i.href) ? "bg-brand-soft font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
      }`}
    >
      {isActive(i.href) && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />}
      <span className={`w-4 text-center ${isActive(i.href) ? "text-brand-fg" : "opacity-70"}`}>{i.icon}</span>
      {i.label}
    </Link>
  );

  const heading = (title: string) => <div className="mt-6 mb-2 px-3 font-display text-[11px] font-semibold tracking-eyebrow text-neutral-500 uppercase">{title}</div>;

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <CloverMark className="h-7 w-7" />
          <Wordmark className="text-sm" />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button className="btn-secondary btn-sm" onClick={() => setOpen(!open)}>Menu</button>
        </div>
      </div>
      <aside className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r border-neutral-200 bg-surface p-4 lg:block`}>
        <div className="mb-6 flex items-center justify-between gap-2 px-1">
          <Link href="/" className="flex items-center gap-2.5">
            <CloverMark className="h-8 w-8" />
            <div>
              <Wordmark className="text-sm" />
              <div className="mt-1 font-display text-[10px] font-semibold tracking-eyebrow text-brand-fg uppercase">Portal</div>
            </div>
          </Link>
          <ThemeToggle className="hidden lg:inline-flex" />
        </div>
        {tools.map((tool) =>
          tool.sections.map((s, i) => {
            const items = visible(s.items);
            if (!items.length) return null;
            return (
              <div key={`${tool.tool}-${s.title ?? i}`}>
                {s.title && heading(s.title)}
                <nav className="space-y-0.5">{items.map(link)}</nav>
              </div>
            );
          }),
        )}
        {role === "ADMIN" && (
          <>
            {heading("Admin Panel")}
            <nav className="space-y-0.5">{adminItems.map(link)}</nav>
          </>
        )}
        <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="truncate text-sm font-medium text-neutral-900">{name}</div>
          <div className="mb-2 font-display text-[10px] font-semibold tracking-eyebrow text-neutral-500 uppercase">{role}</div>
          <form action="/logout" method="post">
            <button className="text-xs text-neutral-600 underline hover:text-brand-fg">Sign out</button>
          </form>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
