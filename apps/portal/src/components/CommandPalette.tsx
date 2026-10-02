"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PageLink } from "@/lib/tools";

const MAX = 8;
export const OPEN_SEARCH = "gc:search";

/** Opens the page search from anywhere (the search button in the top bar sends this). */
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹ ]/g, " ");

/** How well a page matches: every word must appear; label matches rank above descriptions and tool names. */
function score(p: PageLink, words: string[]) {
  const label = norm(p.label);
  const rest = norm(`${p.tool} ${p.group ?? ""} ${p.description ?? ""}`);
  let s = 0;
  for (const w of words) {
    if (label.startsWith(w)) s += 6;
    else if (label.includes(` ${w}`)) s += 4;
    else if (label.includes(w)) s += 3;
    else if (rest.includes(w)) s += 1;
    else return -1;
  }
  return s;
}

/**
 * Jump to any page the role can open, in any tool: Ctrl+K (⌘K on a Mac), type, Enter. Shows at most eight
 * matches, so the list never scrolls; typing narrows it.
 */
export default function CommandPalette({ pages }: { pages: PageLink[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH, onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return pages.slice(0, MAX);
    return pages
      .map((p, i) => ({ p, s: score(p, words), i }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, MAX)
      .map((x) => x.p);
  }, [q, pages]);

  if (!open) return null;
  const go = (p: PageLink | undefined) => {
    if (!p) return;
    setOpen(false);
    router.push(p.href);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-label="Search pages" className="card w-full max-w-xl overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4">
          <SearchIcon />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[sel]);
              } else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Go to… (invoices, timesheets, add a lead, pay runs)"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-neutral-400"
            aria-label="Search pages"
          />
          <kbd className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">Esc</kbd>
        </div>
        <ul className="p-2" role="listbox">
          {results.map((p, i) => (
            <li key={p.href} role="option" aria-selected={i === sel}>
              <button
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => go(p)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === sel ? "bg-brand-soft" : ""}`}
              >
                <span className="w-5 shrink-0 text-center text-brand-fg">{p.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">{p.label}</span>
                  {p.description && <span className="block truncate text-xs text-neutral-500">{p.description}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-500">{p.group ? `${p.tool} · ${p.group}` : p.tool}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-neutral-500">No page matches &ldquo;{q}&rdquo;.</li>}
        </ul>
        <div className="flex items-center gap-4 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500">
          <span><kbd className="font-mono">↑ ↓</kbd> choose</span>
          <span><kbd className="font-mono">Enter</kbd> open</span>
          <span className="ml-auto">{pages.length} pages you can open</span>
        </div>
      </div>
    </div>
  );
}

export function SearchIcon({ className = "h-4 w-4 text-neutral-400" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
