"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** India / USA / all: sets ?market= on the current page. More countries appear as they're added. */
export default function MarketToggle({ markets }: { markets: { key: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const current = params.get("market") ?? "";
  const pick = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("market", value);
    else next.delete("market");
    next.delete("page");
    router.push(`${path}${next.size ? `?${next}` : ""}`);
  };
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 text-sm" role="radiogroup" aria-label="Market">
      {[{ key: "", label: "All markets" }, ...markets].map((m) => (
        <button
          key={m.key || "all"}
          type="button"
          role="radio"
          aria-checked={current === m.key}
          onClick={() => pick(m.key)}
          className={`rounded-md px-3 py-1 ${current === m.key ? "bg-brand-soft font-medium text-brand-fg" : "text-neutral-600 hover:text-neutral-900"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
