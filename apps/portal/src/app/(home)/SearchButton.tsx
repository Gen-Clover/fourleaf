"use client";

import { openSearch, SearchIcon } from "@/components/CommandPalette";

/** The big "jump to any page" box on the portal home: opens the page search (Ctrl+K). */
export default function SearchButton() {
  return (
    <button
      type="button"
      onClick={openSearch}
      className="flex h-10 w-full max-w-md items-center gap-3 rounded-lg border border-neutral-200 bg-surface px-3 text-sm text-neutral-500 shadow-sm transition-colors hover:border-brand/50 hover:text-neutral-800 sm:w-96"
    >
      <SearchIcon />
      <span className="flex-1 text-left">Jump to any page…</span>
      <kbd className="rounded border border-neutral-200 px-1.5 font-mono text-[10px]">Ctrl K</kbd>
    </button>
  );
}
