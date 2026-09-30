// Turning a search request into queued map-cell jobs. Used by the New search page and by scheduled searches.
import { prisma } from "@genclover/db";
import { enqueue } from "@genclover/db/jobs";
import { type Area, type Rect, grid } from "./geo";
import { getLfSettings } from "./settings";

/** Most cells × phrases one search may queue: keeps a typo in the area from queueing thousands of requests. */
export const MAX_CELL_QUERIES = 1500;

export type SearchConfig = {
  service: string;
  nicheKey: string;
  phrases: string[];
  radiusKm: number;
  depth: "QUICK" | "THOROUGH";
  areas: Area[];
};

export type CellPayload = { searchId: string; phrase: string; rect: Rect; area: string; market: string; depth: string };

export function planCells(areas: Area[], phrases: string[], depth: string, cellKm: number) {
  const cells = areas.flatMap((a) => (depth === "QUICK" ? [{ area: a.name, rect: a as Rect }] : grid(a, cellKm).map((rect) => ({ area: a.name, rect }))));
  return { cells, cellQueries: cells.length * phrases.length };
}

/** Create the search and queue one job per map cell and phrase. */
export async function createSearch(config: SearchConfig, by: { id: string | null; name: string }, scheduleId: string | null = null) {
  const niche = await prisma.leadNiche.findUniqueOrThrow({ where: { key: config.nicheKey } });
  const s = await getLfSettings();
  const { cells, cellQueries } = planCells(config.areas, config.phrases, config.depth, s.cellKm);
  if (cellQueries > MAX_CELL_QUERIES) throw new Error("Search is too big");
  const search = await prisma.leadSearch.create({
    data: {
      service: config.service,
      nicheKey: niche.key,
      nicheLabel: niche.label,
      market: niche.market,
      phrases: config.phrases,
      areaLabel: config.areas.map((a) => a.name.split(",")[0]).join(", ") + (config.radiusKm ? ` + ${config.radiusKm} km` : ""),
      areas: JSON.stringify(config.areas),
      depth: config.depth,
      cellsTotal: cellQueries,
      estimateMin: cellQueries,
      estimateMax: config.depth === "QUICK" ? cellQueries * 3 : Math.ceil(cellQueries * 4.5),
      scheduleId,
      createdById: by.id,
      createdBy: by.name,
    },
  });
  await enqueue(
    prisma,
    config.phrases.flatMap((phrase) =>
      cells.map((c) => ({
        type: "LF_SEARCH_CELL",
        group: search.id,
        payload: { searchId: search.id, phrase, rect: c.rect, area: c.area.split(",")[0], market: niche.market, depth: config.depth } satisfies CellPayload,
      })),
    ),
  );
  return search;
}

/** Next weekly run at `hour`:00 IST on `dayOfWeek`, after `from`. */
export function nextWeekly(dayOfWeek: number, hour: number, from = new Date()) {
  const IST = 330 * 60_000;
  const local = new Date(from.getTime() + IST);
  const target = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, 0, 0));
  let days = (dayOfWeek - local.getUTCDay() + 7) % 7;
  if (days === 0 && target.getTime() <= local.getTime()) days = 7;
  return new Date(target.getTime() + days * 86_400_000 - IST);
}

/** Next 2 AM IST (nightly jobs). */
export function nextNight(from = new Date()) {
  const IST = 330 * 60_000;
  const local = new Date(from.getTime() + IST);
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 2, 0, 0);
  if (t <= local.getTime()) t += 86_400_000;
  return new Date(t - IST);
}
