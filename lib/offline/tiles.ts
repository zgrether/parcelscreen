/**
 * Web Mercator tile arithmetic for the offline map cache (step 14e, docs/plans/step-14e-offline.md §3–4). Pure: the
 * service worker and the page both use it.
 *
 * A layer's URL is a MapLibre template: `{z}/{x}/{y}` for an XYZ tile, or `{bbox-epsg-3857}` for a service that
 * exports any box (VGIN's ortho, USGS 3DEP's Slope). A box URL is keyed by its tile, worked back from the box, so a
 * download that formats the numbers differently from MapLibre still finds what the map stored, and the other way round.
 */

export interface Tile {
  z: number;
  x: number;
  y: number;
}

/** West, south, east, north in degrees. */
export interface LonLatBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Half the Web Mercator world's width, in metres. */
const HALF_WORLD = 20037508.342789244;

const lonToX = (lon: number, z: number): number => ((lon + 180) / 360) * 2 ** z;
const latToY = (lat: number, z: number): number => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

/** Every tile at zoom z that touches the box. */
export function tilesInBox(box: LonLatBox, z: number): Tile[] {
  const n = 2 ** z;
  const clamp = (v: number): number => Math.min(n - 1, Math.max(0, Math.floor(v)));
  const x0 = clamp(lonToX(box.west, z));
  const x1 = clamp(lonToX(box.east, z));
  const y0 = clamp(latToY(box.north, z));
  const y1 = clamp(latToY(box.south, z));
  const out: Tile[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  return out;
}

/** A box grown by `m` metres on each side (a local approximation; fine at a quarter mile). */
export function growBox(box: LonLatBox, m: number): LonLatBox {
  const dLat = m / 111_320;
  const midLat = ((box.south + box.north) / 2) * (Math.PI / 180);
  const dLon = m / (111_320 * Math.cos(midLat));
  return { west: box.west - dLon, south: box.south - dLat, east: box.east + dLon, north: box.north + dLat };
}

/** A tile's box in Web Mercator metres, as MapLibre writes `{bbox-epsg-3857}`: minX,minY,maxX,maxY. */
export function bbox3857(t: Tile): string {
  const size = (2 * HALF_WORLD) / 2 ** t.z;
  const minX = -HALF_WORLD + t.x * size;
  const maxY = HALF_WORLD - t.y * size;
  return [minX, maxY - size, minX + size, maxY].join(",");
}

/** The tile a `{bbox-epsg-3857}` box stands for, or null when it isn't one tile of the grid. */
export function tileOfBbox(bbox: string): Tile | null {
  const v = bbox.split(",").map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, maxX, maxY] = v as [number, number, number, number];
  const width = maxX - minX;
  if (!(width > 0) || Math.abs(maxY - minY - width) > width * 1e-6) return null;
  const z = Math.round(Math.log2((2 * HALF_WORLD) / width));
  const size = (2 * HALF_WORLD) / 2 ** z;
  if (Math.abs(size - width) > size * 1e-6) return null;
  const x = Math.round((minX + HALF_WORLD) / size);
  const y = Math.round((HALF_WORLD - maxY) / size);
  return { z, x, y };
}

/** A template filled for one tile. */
export function tileUrl(template: string, t: Tile): string {
  return template
    .replace("{z}", String(t.z))
    .replace("{x}", String(t.x))
    .replace("{y}", String(t.y))
    .replace("{bbox-epsg-3857}", bbox3857(t));
}
