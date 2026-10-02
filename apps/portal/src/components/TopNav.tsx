"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { canAccessPath, roleLabel } from "@genclover/auth/access";
import { CloverMark } from "@genclover/ui/brand";
import type { NavItem, ToolNav } from "@genclover/ui/nav";
import { ThemeToggle } from "@genclover/ui/theme-toggle";
import { CORE_ADMIN, pagesFor, toolsFor } from "@/lib/tools";
import CommandPalette, { openSearch, SearchIcon } from "./CommandPalette";

const Grid = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="currentColor">
    {[4, 10.5, 17].flatMap((x) => [4, 10.5, 17].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="3.5" rx="1" />))}
  </svg>
);

const Caret = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 12 12" aria-hidden className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}>
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

/**
 * The shared top bar: the app switcher (every tool), the tool's grouped menus with tabs for the current group
 * underneath, page search (Ctrl+K), settings and the user menu. Only the page scrolls, never the navigation.
 */
export default function TopNav({ role, name, tool }: { role: string; name: string; tool: ToolNav }) {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const header = useRef<HTMLElement>(null);

  // Close an open menu on a click outside the bar or on Escape.
  useEffect(() => {
    if (!open && !mobile) return;
    const onDown = (e: MouseEvent) => {
      if (!header.current?.contains(e.target as Node)) {
        setOpen(null);
        setMobile(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobile(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobile]);

  const close = () => {
    setOpen(null);
    setMobile(false);
  };
  // A tool's home and the admin overview only light up on their own page, not on every page below them.
  const isActive = (href: string) => ([tool.home, "/admin"].includes(href) ? path === href : path === href || path.startsWith(`${href}/`));
  const sections = tool.sections
    // Only the pages this role can open (packages/auth/src/access.ts).
    .map((s) => ({ ...s, items: s.items.filter((i) => canAccessPath(role, i.href)) }))
    .filter((s) => s.items.length > 0);
  const settings = [...(tool.admin ?? []), ...CORE_ADMIN].filter((i) => canAccessPath(role, i.href));
  const groups = [...sections.filter((s) => s.title), ...(settings.length ? [{ title: "Settings", items: settings }] : [])];
  const current = groups.find((g) => g.items.some((i) => isActive(i.href)));
  // The tool's name opens its home, or the first page this role can use there.
  const start = [tool.home, ...sections.flatMap((s) => s.items.map((i) => i.href))].find((h) => canAccessPath(role, h)) ?? "/";
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tools = useMemo(() => toolsFor(role), [role]);
  const pages = useMemo(() => pagesFor(role), [role]);
  const inTool = (home: string) => home !== "/" && (path === home || tool.home === home);

  const topClass = (active: boolean) =>
    `flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-brand-soft font-medium text-brand-fg" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
    }`;

  const menuLink = (i: NavItem) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={close}
      className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${isActive(i.href) ? "bg-brand-soft" : "hover:bg-neutral-50"}`}
    >
      <span className="mt-0.5 w-4 shrink-0 text-center text-brand-fg">{i.icon}</span>
      <span>
        <span className="block text-sm font-medium text-neutral-900">{i.label}</span>
        {i.description && <span className="block text-xs text-neutral-500">{i.description}</span>}
      </span>
    </Link>
  );

  const menu = (key: string, button: React.ReactNode, items: NavItem[], opts: { align?: "left" | "right"; label?: string } = {}) => {
    const isOpen = open === key;
    return (
      <div key={key} className="relative">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`menu-${key}`}
          aria-label={opts.label}
          onClick={() => setOpen(isOpen ? null : key)}
          className={topClass(items.some((i) => isActive(i.href)))}
        >
          {button}
        </button>
        {isOpen && (
          <div id={`menu-${key}`} className={`card absolute top-full z-50 mt-2 w-80 p-2 shadow-xl ${opts.align === "right" ? "right-0" : "left-0"}`}>
            {items.map(menuLink)}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    <header ref={header} className={`${mobile ? "relative" : "sticky top-0"} z-40 border-b border-neutral-200 bg-surface/90 backdrop-blur`}>
      <div className="mx-auto flex h-14 max-w-[1536px] items-center gap-2 px-3 sm:gap-3 sm:px-4 md:px-6 lg:px-8">
        <div className="relative shrink-0">
          <button
            type="button"
            aria-expanded={open === "apps"}
            aria-controls="menu-apps"
            aria-label="Switch tool"
            title="Switch tool"
            onClick={() => setOpen(open === "apps" ? null : "apps")}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${open === "apps" ? "bg-brand-soft text-brand-fg" : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"}`}
          >
            <Grid />
          </button>
          {open === "apps" && (
            <div id="menu-apps" className="card absolute top-full left-0 z-50 mt-2 w-[min(34rem,calc(100vw-1.5rem))] p-3 shadow-xl">
              <Link href="/" onClick={close} className={`mb-2 flex items-center gap-3 rounded-lg px-3 py-2 ${path === "/" ? "bg-brand-soft" : "hover:bg-neutral-50"}`}>
                <CloverMark className="h-6 w-6" />
                <span>
                  <span className="block text-sm font-medium text-neutral-900">Portal home</span>
                  <span className="block text-xs text-neutral-500">Overview, what needs attention, all tools</span>
                </span>
              </Link>
              <div className="grid gap-1 border-t border-neutral-200 pt-2 sm:grid-cols-2">
                {tools.map((t) => (
                  <Link key={t.home} href={t.href} onClick={close} className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${inTool(t.home) ? "bg-brand-soft" : "hover:bg-neutral-50"}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-base text-brand-fg">{t.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-neutral-900">{t.name}</span>
                      <span className="block text-xs leading-snug text-neutral-500">{t.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        <Link href="/" title="Portal home" className="hidden shrink-0 sm:block" onClick={close}>
          <CloverMark className="h-7 w-7" />
        </Link>
        <Link href={start} onClick={close} className="min-w-0 truncate font-display text-sm font-semibold tracking-wide text-ink">
          {tool.tool}
        </Link>

        <nav className="ml-3 hidden items-center gap-0.5 xl:flex" aria-label={tool.tool}>
          {sections.map((s) =>
            s.title
              ? menu(s.title, <>{s.title} <Caret open={open === s.title} /></>, s.items)
              : s.items.map((i) => (
                  <Link key={i.href} href={i.href} onClick={close} className={topClass(isActive(i.href))}>
                    {i.label}
                  </Link>
                )),
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          {path !== "/" && <button
            type="button"
            onClick={() => {
              close();
              openSearch();
            }}
            className="hidden h-8 items-center gap-2 rounded-md border border-neutral-200 px-2.5 text-xs text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-900 md:flex"
            title="Search pages (Ctrl+K)"
          >
            <SearchIcon className="h-3.5 w-3.5" />
            <span className="w-28 text-left">Search pages…</span>
            <kbd className="rounded border border-neutral-200 px-1 font-mono text-[10px]">Ctrl K</kbd>
          </button>}
          <button type="button" onClick={openSearch} className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50 md:hidden" aria-label="Search pages">
            <SearchIcon />
          </button>
          <ThemeToggle />
          {settings.length > 0 && <div className="hidden xl:block">{menu("Settings", <Gear />, settings, { align: "right", label: "Settings" })}</div>}
          <div className="relative">
            <button
              type="button"
              aria-expanded={open === "user"}
              aria-controls="menu-user"
              aria-label={`Account: ${name}`}
              onClick={() => setOpen(open === "user" ? null : "user")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft font-display text-xs font-semibold text-brand-fg hover:ring-2 hover:ring-brand/30"
            >
              {initials}
            </button>
            {open === "user" && (
              <div id="menu-user" className="card absolute top-full right-0 z-50 mt-2 w-60 p-2 shadow-xl">
                <div className="border-b border-neutral-200 px-3 pt-1 pb-2">
                  <div className="truncate text-sm font-medium text-neutral-900">{name}</div>
                  <div className="font-display text-[10px] font-semibold tracking-eyebrow text-neutral-500 uppercase">{roleLabel(role)}</div>
                </div>
                <Link href="/" onClick={close} className="mt-1 block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                  Portal home
                </Link>
                <form action="/logout" method="post">
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">Sign out</button>
                </form>
              </div>
            )}
          </div>
          {(sections.length > 0 || settings.length > 0) && (
            <button type="button" className="btn-secondary btn-sm xl:hidden" aria-expanded={mobile} onClick={() => { setOpen(null); setMobile(!mobile); }}>
              Menu
            </button>
          )}
        </div>
      </div>

      {current && current.items.length > 1 && (
        <div className="hidden border-t border-neutral-200 xl:block">
          <nav className="mx-auto flex max-w-[1536px] flex-wrap gap-1 px-4 py-1.5 sm:px-6 lg:px-8" aria-label={current.title}>
            {current.items.map((i) => (
              <Link key={i.href} href={i.href} className={`rounded-md px-2.5 py-1 text-xs transition-colors ${isActive(i.href) ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-900"}`}>
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {mobile && (
        <div className="border-t border-neutral-200 px-3 pt-2 pb-3 xl:hidden">
          {/* Compact on small screens: two columns, label only (the description is the link's tooltip). It scrolls
              with the page; the bar stops sticking while it's open, so no inner scrollbar is needed. */}
          {[...sections, ...(settings.length ? [{ title: "Settings", items: settings }] : [])].map((s, n) => (
            <div key={s.title ?? n} className="mb-1">
              {s.title && <div className="px-2 pt-2 pb-1 font-display text-[11px] font-semibold tracking-eyebrow text-neutral-500 uppercase">{s.title}</div>}
              <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
                {s.items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={close}
                    title={i.description}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${isActive(i.href) ? "bg-brand-soft font-medium text-brand-fg" : "text-neutral-800 hover:bg-neutral-50"}`}
                  >
                    <span className="w-4 shrink-0 text-center text-brand-fg">{i.icon}</span>
                    <span className="min-w-0 truncate">{i.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
    <CommandPalette pages={pages} />
    </>
  );
}
