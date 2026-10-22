/**
 * Regenerates lib/screen/data/climate.json (step 11, docs/plans/step-11-new-data.md §2.2, §3): the Climate factor's
 * baked data for the study region.
 * - PRISM 1991–2020 normals at 800 m (30 arc-seconds): January's mean low and July's mean high, in tenths of a °F,
 *   with PRISM's own 800 m DEM (each cell's mean elevation, in ft), so the screen can adjust a cell's temperature to
 *   the site's elevation. Free to reproduce with attribution (prism.oregonstate.edu/terms); commercial use isn't
 *   addressed (plan §3).
 * - NOAA NCEI U.S. Climate Normals 1991–2020, annual/seasonal, for every temperature station (USC/USW) in the region
 *   widened by STATION_MARGIN_DEG: annual snowfall, the median (50%) last spring and first fall 32 °F dates, and the
 *   median season length between them. U.S. government work.
 *
 *   pnpm data:climate <dir>
 *
 * <dir> holds the three PRISM rasters, unzipped, from (checked 2026-10-21):
 *   https://data.prism.oregonstate.edu/normals/us/800m/tmin/monthly/prism_tmin_us_30s_202001_avg_30y.zip
 *   https://data.prism.oregonstate.edu/normals/us/800m/tmax/monthly/prism_tmax_us_30s_202007_avg_30y.zip
 *   https://prism.oregonstate.edu/downloads/data/PRISM_us_dem_800m_bil.zip
 * NOAA's files are fetched (about 180 requests, one a second). Run by hand, never in CI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fromFile } from "geotiff";

const ROOT = resolve(import.meta.dirname, "..");
export const OUT = join(ROOT, "lib", "screen", "data", "climate.json");
const UA = "parcelscreen-data/1 (climate snapshot, run by hand; https://github.com/zgrether/parcelscreen)";

/** The study region (plan §3), [south, west, north, east]: the fixtures' counties and their neighbours. */
export const REGION = [35.8, -82.7, 37.4, -79.9] as const;
/** Stations this far outside the region are kept, so a parcel near its edge has neighbours on every side. */
const STATION_MARGIN_DEG = 0.5;
/** PRISM's 30 arc-second grid. */
const CELL_DEG = 1 / 120;
const FT_PER_M = 3.28084;
const NOAA = "https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020";

const dir = process.argv[2];
if (!dir) throw new Error("usage: pnpm data:climate <dir with the three PRISM rasters>");

/** Rows and columns of the region on PRISM's grid. */
const [S, W, N, E] = REGION;
const cols = Math.round((E - W) / CELL_DEG);
const rows = Math.round((N - S) / CELL_DEG);

/**
 * The clipped grid's north-west corner. PRISM's cell edges fall half a cell off whole 1/120ths of a degree, so it's
 * the edge nearest the region's, taken from the first raster and checked against the others.
 */
let corner: { west: number; north: number } | null = null;
const near = (a: number, b: number) => Math.abs(a - b) < CELL_DEG / 100;

/** A GeoTIFF's cells over the region, north-up. */
async function tiffRegion(file: string): Promise<Float64Array> {
  const image = await (await fromFile(join(dir!, file))).getImage();
  const [x0, y0] = image.getOrigin() as [number, number];
  const [dx, dy] = image.getResolution() as [number, number];
  if (!near(dx, CELL_DEG) || !near(-dy, CELL_DEG)) throw new Error(`${file}: not a 30 arc-second grid`);
  const nodata = Number(image.getGDALNoData() ?? -9999);
  const c0 = Math.round((W - x0) / dx);
  const r0 = Math.round((N - y0) / dy);
  const at = { west: x0 + c0 * dx, north: y0 + r0 * dy };
  corner ??= at;
  if (!near(at.west, corner.west) || !near(at.north, corner.north)) throw new Error(`${file}: another grid`);
  const [band] = (await image.readRasters({ window: [c0, r0, c0 + cols, r0 + rows] })) as unknown as [
    ArrayLike<number>,
  ];
  return Float64Array.from({ length: cols * rows }, (_, i) => (band[i] === nodata ? NaN : band[i]!));
}

/** PRISM's BIL DEM (32-bit signed, little-endian, metres) over the region; its header gives the cell centres. */
function demRegion(): Float64Array {
  const hdr = Object.fromEntries(
    readFileSync(join(dir!, "PRISM_us_dem_800m_bil.hdr"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length === 2),
  ) as Record<string, string>;
  const ncols = Number(hdr.NCOLS);
  const ulx = Number(hdr.ULXMAP) - CELL_DEG / 2; // ULXMAP and ULYMAP are the first cell's centre
  const uly = Number(hdr.ULYMAP) + CELL_DEG / 2;
  const buf = readFileSync(join(dir!, "PRISM_us_dem_800m_bil.bil"));
  const c0 = Math.round((corner!.west - ulx) / CELL_DEG);
  const r0 = Math.round((uly - corner!.north) / CELL_DEG);
  if (!near(ulx + c0 * CELL_DEG, corner!.west) || !near(uly - r0 * CELL_DEG, corner!.north))
    throw new Error("the DEM's grid isn't the normals'");
  const out = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = buf.readInt32LE(((r0 + r) * ncols + c0 + c) * 4);
      out[r * cols + c] = v === -9999 ? NaN : v;
    }
  return out;
}

/** A grid as base64 of little-endian Int16, NaN as the minimum (-32768). */
function packed(values: Float64Array, scale: (v: number) => number): string {
  const ints = new Int16Array(values.length);
  for (let i = 0; i < values.length; i++)
    ints[i] = Number.isNaN(values[i]!) ? -32768 : Math.round(scale(values[i]!));
  return Buffer.from(ints.buffer).toString("base64");
}

const cToF10 = (c: number) => ((c * 9) / 5) * 10 + 320;

const janLow = await tiffRegion("prism_tmin_us_30s_202001_avg_30y.tif");
const julHigh = await tiffRegion("prism_tmax_us_30s_202007_avg_30y.tif");
const dem = demRegion();

/** A blank or one of NOAA's special values (-5555 to -9999) is missing. */
const field = (h: string[], v: string[], key: string): string | null => {
  const i = h.indexOf(key);
  const x = i < 0 ? "" : (v[i] ?? "").trim();
  return x === "" || /^-[5-9]{4}/.test(x) ? null : x;
};
const cells = (line: string) => line.split('","').map((s) => s.replace(/^"|"$/g, ""));
/** NOAA writes a date "04/15" (or "0415"): "04-15". */
const mmdd = (x: string) => {
  const m = /^(\d{2})\/?(\d{2})$/.exec(x);
  if (!m) throw new Error(`a date NOAA doesn't write: ${x}`);
  return `${m[1]}-${m[2]}`;
};

interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevFt: number;
  snowIn: number;
  lastFreeze: string;
  firstFreeze: string;
  frostFreeDays: number;
}

const inventory = await (
  await fetch(`${NOAA}/doc/inventory_30yr.txt`, { headers: { "User-Agent": UA } })
).text();
const candidates = inventory
  .split(/\r?\n/)
  .map((l) => l.trim().split(/\s+/))
  .filter(([id, lat, lon]) => {
    const [y, x] = [Number(lat), Number(lon)];
    return (
      /^US[CW]/.test(id ?? "") &&
      y >= S - STATION_MARGIN_DEG &&
      y <= N + STATION_MARGIN_DEG &&
      x >= W - STATION_MARGIN_DEG &&
      x <= E + STATION_MARGIN_DEG
    );
  });

const stations: Station[] = [];
for (const [id] of candidates) {
  await new Promise((r) => setTimeout(r, 1000));
  const res = await fetch(`${NOAA}/access/${id}.csv`, { headers: { "User-Agent": UA } });
  if (!res.ok) continue;
  const [head, row] = (await res.text()).split(/\r?\n/);
  if (!head || !row) continue;
  const h = cells(head);
  const v = cells(row);
  const snow = field(h, v, "ANN-SNOW-NORMAL");
  const last = field(h, v, "ANN-TMIN-PRBLST-T32FP50");
  const first = field(h, v, "ANN-TMIN-PRBFST-T32FP50");
  const season = field(h, v, "ANN-TMIN-PRBGSL-T32FP50");
  if (!snow || !last || !first || !season) continue;
  stations.push({
    id: id!,
    // "ELK CREEK 1 NW, VA US" → "Elk Creek 1 NW, VA"; "FLAT SPRINGS 1E" → "Flat Springs 1E"
    name: (field(h, v, "NAME") ?? id!)
      .replace(/ US$/, "")
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/(\d+(?:\.\d+)?\s?)([nsew]{1,3})\b/gi, (_m, d: string, dir: string) => d + dir.toUpperCase())
      .replace(/\b(Va|Nc|Tn|Wv|Ky)$/, (m) => m.toUpperCase())
      // NOAA's abbreviations: a Weather Service office, an airport.
      .replace(/\b(Nwso|Wso)\b/g, (m) => m.toUpperCase())
      .replace(/\bAp\b/g, "Airport"),
    lat: Number(field(h, v, "LATITUDE")),
    lon: Number(field(h, v, "LONGITUDE")),
    elevFt: Math.round(Number(field(h, v, "ELEVATION")) * FT_PER_M),
    snowIn: Number(snow),
    lastFreeze: mmdd(last),
    firstFreeze: mmdd(first),
    frostFreeDays: Number(season),
  });
  console.log(`${id} ${stations.at(-1)!.name}: ${snow} in, ${last}–${first}, ${season} d`);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      // The local date the sources were read (en-CA writes YYYY-MM-DD).
      checked: new Date().toLocaleDateString("en-CA"),
      prism: {
        west: +corner!.west.toFixed(6),
        north: +corner!.north.toFixed(6),
        cellDeg: CELL_DEG,
        cols,
        rows,
        // Row 0 is the northern edge (north-up, as PRISM writes it).
        janLowF10: packed(janLow, cToF10),
        julHighF10: packed(julHigh, cToF10),
        elevFt: packed(dem, (m) => m * FT_PER_M),
      },
      stations,
    },
    null,
    1,
  ) + "\n",
);
console.log(`${OUT}: ${cols}×${rows} cells, ${stations.length} stations`);
