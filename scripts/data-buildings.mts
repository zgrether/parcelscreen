/**
 * Regenerates lib/screen/data/buildings/ (step 11, docs/plans/step-11-new-data.md §2.3, §3): the Privacy factor's
 * houses for the study region, from Microsoft's Global ML Building Footprints (CDLA Permissive 2.0; commercial use
 * allowed). Each footprint becomes its centroid, its area and its height, and only those of at least
 * privacy.minHouseM2 are kept (smaller ones are sheds). Written as one file per 0.1° tile, so the screen loads only
 * the tiles around a parcel, and an index of them.
 *
 *   pnpm data:buildings <cache dir>
 *
 * The footprints' tiles (about 260 MB, gzipped GeoJSON lines) are downloaded into <cache dir> once, from the
 * dataset's index (checked 2026-10-21):
 *   https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv
 * Run by hand, never in CI.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { area, centroid } from "@turf/turf";

const ROOT = resolve(import.meta.dirname, "..");
export const OUT = join(ROOT, "lib", "screen", "data", "buildings");
const UA = "parcelscreen-data/1 (building snapshot, run by hand; https://github.com/zgrether/parcelscreen)";
const INDEX = "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv";

/** The study region (plan §3), [south, west, north, east], as the climate data's. */
export const REGION = [35.8, -82.7, 37.4, -79.9] as const;
/** The tile size: a parcel's houses within a mile reach at most the eight tiles around its own. */
export const TILE_DEG = 0.1;
/**
 * Positions within a tile in steps of 1e-4° (about 10 m, finer than the 30 m DEM the line of sight reads), so each fits
 * in 10 bits; a building is 3 bytes with its height (scripts below, `packed`).
 */
const STEP = 1e-4;
/** Heights in whole metres up to this; 15 is unknown. */
const MAX_HEIGHT_M = 14;

const cache = process.argv[2];
if (!cache) throw new Error("usage: pnpm data:buildings <cache dir>");
mkdirSync(cache, { recursive: true });

/** The zoom-9 quadkeys over the region: the dataset's tiles. */
function quadkeys(): Set<string> {
  const [S, W, N, E] = REGION;
  const z = 9;
  const n = 2 ** z;
  const tile = (lat: number, lon: number): [number, number] => {
    const r = (lat * Math.PI) / 180;
    return [
      Math.floor(((lon + 180) / 360) * n),
      Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
    ];
  };
  const [x0, y0] = tile(N, W);
  const [x1, y1] = tile(S, E);
  const keys = new Set<string>();
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      let q = "";
      for (let i = z; i > 0; i--) q += ((x >> (i - 1)) & 1) + 2 * ((y >> (i - 1)) & 1);
      keys.add(q);
    }
  return keys;
}

const keys = quadkeys();
const links = (await (await fetch(INDEX, { headers: { "User-Agent": UA } })).text())
  .split(/\r?\n/)
  .map((l) => l.split(","))
  .filter((c) => c[0] === "UnitedStates" && keys.has(c[1]!));
for (const [, key, url] of links) {
  const file = join(cache, `${key}-${url!.split("/").at(-1)}`);
  if (existsSync(file)) continue;
  console.log(`downloading ${key}`);
  const res = await fetch(url!, { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
}

const [S, W, N, E] = REGION;
/** privacy.minHouseM2 (lib/screen/config.ts); a test holds the two equal. */
export const MIN_HOUSE_M2 = 60;
const minM2 = MIN_HOUSE_M2;
/** Each 0.1° tile's buildings, as [lat, lon, height in m (-1: unknown)]. */
const tiles = new Map<string, number[][]>();
/** A tile's name: its south-west corner, "n3660w8150" for 36.6 N, 81.5 W. */
export const tileName = (lat: number, lon: number): string =>
  `n${Math.round(Math.floor(lat / TILE_DEG) * TILE_DEG * 100)}w${Math.round(-Math.floor(lon / TILE_DEG) * TILE_DEG * 100)}`;

for (const f of readdirSync(cache).filter((x) => x.endsWith(".csv.gz"))) {
  const lines = createInterface({ input: createReadStream(join(cache, f)).pipe(createGunzip()) });
  let n = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line) as { geometry: GeoJSON.Polygon; properties: { height?: number } };
    if (feature.geometry.type !== "Polygon") continue;
    const [lon, lat] = centroid(feature.geometry).geometry.coordinates as [number, number];
    if (lat < S || lat >= N || lon < W || lon >= E) continue;
    const m2 = area(feature.geometry);
    if (m2 < minM2) continue;
    const h = feature.properties.height;
    const key = tileName(lat, lon);
    const list = tiles.get(key) ?? [];
    list.push([lat, lon, typeof h === "number" && h > 0 ? h : -1]);
    tiles.set(key, list);
    n++;
  }
  console.log(`${f}: ${n} kept`);
}

/**
 * A tile as base64 of 3-byte little-endian words, one per building: bits 0–9 its latitude above the tile's south-west
 * corner in STEP degrees, bits 10–19 its longitude, bits 20–23 its height in whole metres (15: unknown).
 */
function packed(key: string, list: number[][]): string {
  const south = Number(key.slice(1, key.indexOf("w"))) / 100;
  const west = -Number(key.slice(key.indexOf("w") + 1)) / 100;
  const out = new Uint8Array(list.length * 3);
  list
    .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
    .forEach(([lat, lon, h], i) => {
      const y = Math.min(1023, Math.round((lat! - south) / STEP));
      const x = Math.min(1023, Math.round((lon! - west) / STEP));
      const m = h! < 0 ? 15 : Math.min(MAX_HEIGHT_M, Math.max(1, Math.round(h!)));
      const v = y | (x << 10) | (m << 20);
      out[i * 3] = v & 255;
      out[i * 3 + 1] = (v >> 8) & 255;
      out[i * 3 + 2] = (v >> 16) & 255;
    });
  return Buffer.from(out.buffer).toString("base64");
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const names = [...tiles.keys()].sort();
for (const key of names)
  writeFileSync(join(OUT, `${key}.json`), JSON.stringify({ b: packed(key, tiles.get(key)!) }) + "\n");
// The index: the region, and one lazy import per tile, so the bundler splits them and a parcel loads its own.
writeFileSync(
  join(OUT, "index.ts"),
  `// Generated by \`pnpm data:buildings\` (scripts/data-buildings.mts); don't edit.\n` +
    `export const CHECKED = "${new Date().toLocaleDateString("en-CA")}";\n` +
    `export const REGION = ${JSON.stringify(REGION)} as const;\n` +
    `export const TILE_DEG = ${TILE_DEG};\n` +
    `export const STEP_DEG = ${STEP};\n` +
    `export const TILES: Record<string, () => Promise<{ default: { b: string } }>> = {\n` +
    names.map((k) => `  ${k}: () => import("./${k}.json"),\n`).join("") +
    `};\n`,
);
console.log(
  `${OUT}: ${names.length} tiles, ${[...tiles.values()].reduce((a, l) => a + l.length, 0)} buildings`,
);
