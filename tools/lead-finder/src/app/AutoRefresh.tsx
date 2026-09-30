"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render the page every few seconds while background work is running. */
export default function AutoRefresh({ active, everyMs = 3000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
