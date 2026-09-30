// Map rectangles for searches. Google's Text Search returns at most 60 places per query, so a
// thorough search covers an area with a grid of cells and splits any cell that hits the limit.

export type Rect = { south: number; west: number; north: number; east: number };
export type Area = Rect & { name: string };

const KM_PER_DEG_LAT = 111.32;
const kmPerDegLng = (lat: number) => KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
const midLat = (r: Rect) => (r.south + r.north) / 2;

export const heightKm = (r: Rect) => (r.north - r.south) * KM_PER_DEG_LAT;
export const widthKm = (r: Rect) => (r.east - r.west) * kmPerDegLng(midLat(r));
export const sizeKm = (r: Rect) => Math.max(heightKm(r), widthKm(r));

/** Grow a rectangle by `km` on every side (for "and N km around"). */
export function expand(r: Rect, km: number): Rect {
  if (km <= 0) return r;
  const dLat = km / KM_PER_DEG_LAT;
  const dLng = km / kmPerDegLng(midLat(r));
  return { south: r.south - dLat, north: r.north + dLat, west: r.west - dLng, east: r.east + dLng };
}

/** Cover a rectangle with cells about `cellKm` wide. */
export function grid(r: Rect, cellKm: number): Rect[] {
  const rows = Math.max(1, Math.ceil(heightKm(r) / cellKm));
  const cols = Math.max(1, Math.ceil(widthKm(r) / cellKm));
  const dLat = (r.north - r.south) / rows;
  const dLng = (r.east - r.west) / cols;
  const cells: Rect[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      cells.push({ south: r.south + i * dLat, north: r.south + (i + 1) * dLat, west: r.west + j * dLng, east: r.west + (j + 1) * dLng });
  return cells;
}

/** Split a cell into four quarters. */
export function quarters(r: Rect): Rect[] {
  const lat = (r.south + r.north) / 2;
  const lng = (r.west + r.east) / 2;
  return [
    { south: r.south, north: lat, west: r.west, east: lng },
    { south: r.south, north: lat, west: lng, east: r.east },
    { south: lat, north: r.north, west: r.west, east: lng },
    { south: lat, north: r.north, west: lng, east: r.east },
  ];
}

export const isRect = (r: unknown): r is Rect =>
  !!r && typeof r === "object" && ["south", "west", "north", "east"].every((k) => Number.isFinite((r as Record<string, unknown>)[k]));
