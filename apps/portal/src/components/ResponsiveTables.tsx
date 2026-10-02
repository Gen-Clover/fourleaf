"use client";

import { useEffect } from "react";

/**
 * Makes every `.tbl` table work on small screens without sideways scrolling: each cell is labelled with its
 * column name (data-label), and a table wider than the space it has (at any screen size) is switched to stacked rows (`tbl-stack`,
 * styled in packages/ui/src/styles.css): one card per row, "Column  value" on each line. Tables that fit keep
 * their normal layout. Re-checks when the window is resized or the page content changes. Opt out with `tbl-keep`.
 */
export default function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;

    const label = (t: HTMLTableElement) => {
      const cols: string[] = [];
      const head = t.tHead?.rows[t.tHead.rows.length - 1];
      for (const th of head ? Array.from(head.cells) : []) {
        for (let k = 0; k < (th.colSpan || 1); k++) cols.push(th.innerText.trim());
      }
      const rows = [...Array.from(t.tBodies).flatMap((b) => Array.from(b.rows)), ...(t.tFoot ? Array.from(t.tFoot.rows) : [])];
      for (const row of rows) {
        const cells = Array.from(row.cells);
        // A single cell across the table (an empty-state message) is shown whole, without a label.
        const full = cells.length === 1 && cells[0].colSpan > 1;
        let i = 0;
        for (const td of cells) {
          const l = full ? "" : (cols[i] ?? "");
          if (td.getAttribute("data-label") !== l) td.setAttribute("data-label", l);
          td.toggleAttribute("data-full", full);
          i += td.colSpan || 1;
        }
      }
    };

    const fit = (t: HTMLTableElement) => {
      const box = t.parentElement;
      if (!box || t.classList.contains("tbl-keep")) return;
      t.classList.remove("tbl-stack");
      if (t.offsetWidth > box.clientWidth + 2) t.classList.add("tbl-stack");
    };

    // Only touch a table once React has hydrated it (React tags the DOM nodes it owns): changing it earlier,
    // while a streamed part of the page is still waiting to hydrate, makes React report a mismatch.
    const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
    let retry: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      frame = 0;
      let waiting = false;
      for (const t of Array.from(document.querySelectorAll<HTMLTableElement>("table.tbl"))) {
        if (!hydrated(t)) {
          waiting = true;
          continue;
        }
        label(t);
        fit(t);
      }
      if (waiting && !retry) retry = setTimeout(() => ((retry = undefined), schedule()), 150);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };

    run();
    // Content changes (navigation, refreshes, rows added) and resizes; attribute changes are ours, so not watched.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      if (retry) clearTimeout(retry);
    };
  }, []);
  return null;
}
