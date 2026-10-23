/**
 * The sample parcels, live (step 13, docs/plans/step-13-area-catalog.md §5): two typical rural parcels per area, each
 * 10–30 acres with no house, screened by the engine as `pnpm expected` screens, written to
 * public/areas/v1/samples/<area>-<n>.json with their boundary, acres and screen only (no owner fields, phase-0.md
 * §9.23).
 *
 *   pnpm areas:samples                         every area missing a sample
 *   AREAS=floyd,cosby pnpm areas:samples       just those (their samples redone)
 *   SAMPLES_RESCREEN=1 pnpm areas:samples      the same parcels screened again, after an engine bump that changes
 *                                              a number (ENGINE_CURRENT_FROM moves); AREAS= narrows it
 *
 * "Typical": the area's own sample points nearest its median elevation are walked in turn, and the parcel under each
 * is asked of the state's parcel service. "No house": no Microsoft building footprint of a house's size (60 m²) on it;
 * the footprints are fetched for the area into tmp/ms-buildings and never committed. Run by hand, never monthly: each
 * sample is a full screen.
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { area, bbox, booleanIntersects, booleanPointInPolygon, centroid, point } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import { pickParcelAt } from "@/lib/geo/parcels";
import { deriveParcel } from "@/lib/geo/recipe";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { screen } from "@/lib/screen/index";
import { SERVER_USER_AGENT } from "@/lib/server/http";
import { AREAS } from "@/lib/areas/catalog";
import { outlineOf } from "@/lib/areas/outlines";
import { fetchPublicLand, widen, type Box } from "@/lib/areas/sources";
import { AREA_FILE_VERSION, AreaFileSchema, SampleFileSchema, type SampleFile } from "@/lib/areas/types";

const ROOT = process.cwd();
const AREAS_DIR = join(ROOT, "public", "areas", `v${AREA_FILE_VERSION}`);
const OUT = join(AREAS_DIR, "samples");
const CACHE = join(ROOT, "tmp", "ms-buildings");
const PER_AREA = 2;
const ACRES: [number, number] = [10, 30];
/** The area's points nearest its median elevation that are tried; SAMPLE_TRIES=200 tries them all (a short area). */
const MAX_TRIES = Number(process.env.SAMPLE_TRIES ?? 60);
const MIN_HOUSE_M2 = SCREEN_CONSTANTS.privacy.minHouseM2;
const SQ_M_PER_ACRE = 4046.8564224;
const INDEX = "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv";
const HOUR = 3_600_000;

/** Some services (the TN parcel WAF) refuse a non-browser User-Agent; Overpass wants the app's own. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const uaFor = (url: string) =>
  DEFAULT_ENDPOINTS.overpass.some((u) => url.startsWith(u)) ? SERVER_USER_AGENT : BROWSER_UA;

/** The zoom-9 quadkeys over a box: Microsoft's footprint tiles. */
function quadkeys([w, s, e, n]: Box): string[] {
  const z = 9;
  const k = 2 ** z;
  const tile = (lat: number, lon: number): [number, number] => {
    const r = (lat * Math.PI) / 180;
    return [
      Math.floor(((lon + 180) / 360) * k),
      Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * k),
    ];
  };
  const [x0, y0] = tile(n, w);
  const [x1, y1] = tile(s, e);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      let q = "";
      for (let i = z; i > 0; i--) q += ((x >> (i - 1)) & 1) + 2 * ((y >> (i - 1)) & 1);
      keys.push(q);
    }
  return keys;
}

/** The centroids of the houses (60 m² and up) in a box, from Microsoft's footprints, downloaded once into tmp/. */
async function housesIn(box: Box, live: typeof fetch): Promise<[number, number][]> {
  mkdirSync(CACHE, { recursive: true });
  const indexFile = join(CACHE, "dataset-links.csv");
  if (!existsSync(indexFile)) writeFileSync(indexFile, await (await live(INDEX)).text());
  const keys = new Set(quadkeys(box));
  const links = readFileSync(indexFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.split(","))
    .filter((c) => c[0] === "UnitedStates" && keys.has(c[1]!));
  const [w, s, e, n] = box;
  const out: [number, number][] = [];
  for (const [, key, url] of links) {
    const file = join(CACHE, `${key}-${url!.split("/").at(-1)}`);
    if (!existsSync(file)) {
      const res = await live(url!);
      if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
    }
    const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()) });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const f = JSON.parse(line) as { geometry: Polygon };
      if (f.geometry.type !== "Polygon") continue;
      const [lon, lat] = centroid(f.geometry).geometry.coordinates as [number, number];
      if (lat < s || lat > n || lon < w || lon > e) continue;
      if (area(f.geometry) >= MIN_HOUSE_M2) out.push([lat, lon]);
    }
  }
  return out;
}

const RESCREEN = !!process.env.SAMPLES_RESCREEN;

describe.runIf(import.meta.env.MODE === "areas-samples")("the sample parcels, live", () => {
  it.skipIf(RESCREEN)(
    "two per area",
    async () => {
      const live = (globalThis as unknown as Record<symbol, typeof fetch>)[
        Symbol.for("parcelscreen.liveFetch")
      ]!;
      const withUA: typeof fetch = (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("User-Agent", uaFor(String(input)));
        return live(input, { ...init, headers });
      };
      const http = createHttpClient({ env: "node", fetchImpl: withUA, clock: realClock });
      mkdirSync(OUT, { recursive: true });
      const only = (process.env.AREAS ?? "").split(",").filter(Boolean);
      const have = new Set(existsSync(OUT) ? readdirSync(OUT) : []);
      const defs = only.length
        ? AREAS.filter((a) => only.includes(a.id))
        : AREAS.filter((a) => !have.has(`${a.id}-${PER_AREA}.json`));
      const missed: string[] = [];
      for (const def of defs) {
        const profile = AreaFileSchema.parse(
          JSON.parse(readFileSync(join(AREAS_DIR, `${def.id}.json`), "utf8")),
        );
        const outline = await outlineOf(def.id);
        const box = bbox(outline) as Box;
        const houses = await housesIn(widen(box, 1), live);
        const land = await fetchPublicLand(widen(box, 1), http, DEFAULT_ENDPOINTS.padus[0]!);
        const median = profile.medians.elevFt ?? 0;
        const order = profile.points.ll
          .map((ll, i) => ({ ll, d: Math.abs((profile.points.elevFt[i] ?? Infinity) - median) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, MAX_TRIES);
        const kept: SampleFile[] = [];
        const seen = new Set<string>();
        for (const { ll } of order) {
          if (kept.length >= PER_AREA) break;
          const pick = await pickParcelAt(http, DEFAULT_ENDPOINTS.parcels, ll);
          if (!pick.parcel) continue;
          const geo = pick.parcel.geo as Feature<Polygon>;
          const id = JSON.stringify(bbox(geo).map((x) => x.toFixed(5)));
          if (seen.has(id)) continue;
          seen.add(id);
          if (pick.parcel.multiPart) continue;
          const acres = area(geo) / SQ_M_PER_ACRE;
          if (acres < ACRES[0] || acres > ACRES[1]) continue;
          const [w, s, e, n] = bbox(geo);
          const house = houses.some(
            ([lat, lon]) =>
              lon >= w && lon <= e && lat >= s && lat <= n && booleanPointInPolygon(point([lon, lat]), geo),
          );
          if (house) continue;
          const publicLand = land.fee.some(
            (x) =>
              x.box[0] <= e && x.box[2] >= w && x.box[1] <= n && x.box[3] >= s && booleanIntersects(x.f, geo),
          );
          if (publicLand) continue;
          const d = deriveParcel({ parts: [pick.parcel] }, SCREEN_CONSTANTS.combine);
          if (!d.ok) continue;
          const out = await screen(
            { polygon: d.record.geo.geometry, config: DEFAULT_USER_CONFIG },
            undefined,
            {
              http,
            },
          );
          if (out.result.failed.length) {
            console.log(
              `${def.id}: a ${acres.toFixed(1)} ac parcel's screen failed ${out.result.failed.join(", ")}`,
            );
            continue;
          }
          const n1 = kept.length + 1;
          const sample: SampleFile = {
            version: AREA_FILE_VERSION,
            area: def.id,
            n: n1,
            name: `Sample parcel ${n1} · ${def.name}`,
            acres: +acres.toFixed(1),
            boundary: d.record.geo.geometry as Polygon,
            result: out.result,
          };
          SampleFileSchema.parse(sample);
          kept.push(sample);
          writeFileSync(join(OUT, `${def.id}-${n1}.json`), JSON.stringify(sample) + "\n");
          console.log(`${def.id}: sample ${n1}, ${acres.toFixed(1)} ac at ${ll}`);
        }
        if (kept.length < PER_AREA) missed.push(`${def.id} (${kept.length})`);
      }
      console.log(missed.length ? `short: ${missed.join(", ")}` : "every area has its samples");
      expect(missed.length).toBeLessThan(defs.length || 1);
    },
    6 * HOUR,
  );

  it.runIf(RESCREEN)(
    "each kept sample screened again on the current rules (SAMPLES_RESCREEN=1; an engine bump that changes a number)",
    async () => {
      const live = (globalThis as unknown as Record<symbol, typeof fetch>)[
        Symbol.for("parcelscreen.liveFetch")
      ]!;
      const withUA: typeof fetch = (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("User-Agent", uaFor(String(input)));
        return live(input, { ...init, headers });
      };
      const http = createHttpClient({ env: "node", fetchImpl: withUA, clock: realClock });
      const only = (process.env.AREAS ?? "").split(",").filter(Boolean);
      const files = readdirSync(OUT)
        .filter((f) => f.endsWith(".json"))
        .filter((f) => !only.length || only.some((id) => f.startsWith(`${id}-`)));
      const kept: string[] = [];
      for (const f of files) {
        const sample = SampleFileSchema.parse(JSON.parse(readFileSync(join(OUT, f), "utf8")));
        const out = await screen({ polygon: sample.boundary, config: DEFAULT_USER_CONFIG }, undefined, {
          http,
        });
        if (out.result.failed.length) {
          // The sample stays as it was; run it again later.
          console.log(`${f}: the screen failed ${out.result.failed.join(", ")}; kept as it was`);
          kept.push(f);
          continue;
        }
        const next: SampleFile = { ...sample, result: out.result };
        SampleFileSchema.parse(next);
        writeFileSync(join(OUT, f), JSON.stringify(next) + "\n");
        console.log(`${f}: screened again (engine ${out.result.engine})`);
      }
      console.log(kept.length ? `kept as they were: ${kept.join(", ")}` : "every sample screened again");
      expect(kept).toEqual([]);
    },
    6 * HOUR,
  );
});
