/**
 * Lidar terrain's tiles, timed live (roadmap step 14c plan §3): one phone screen of tiles (375 × 812, with the tile
 * row past each edge MapLibre asks for) at zooms 13–17, over the four fixture parcels, in both styles. For each zoom
 * and style: the median and slowest tile, whether every answer was a PNG (not an ArcGIS error), and what a screen of
 * tiles weighs. A measurement kept for re-use, not a check: tests never reach the network.
 *
 *   pnpm lidar:tiles        writes test-results/lidar-tiles.md, and prints it
 *
 * Six requests at a time, as a browser's map asks for a screen's tiles, through lib/http.ts's client.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { centroid } from "@turf/turf";
import { describe, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { LIDAR_STYLES, lidarTiles, type LidarStyle } from "@/components/Map/lidarStyle";
import { PROTOTYPE_FIXTURE_SLUGS, loadFixture, type FixtureSlug } from "../support/fixtures";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const ZOOMS = [13, 14, 15, 16, 17] as const;
const SCREEN = { w: 375, h: 812 } as const;
const ORIGIN = 20037508.342789244;
const PNG = [0x89, 0x50, 0x4e, 0x47];

/** The tiles a 375 × 812 screen centred on a point needs at a zoom, one row and column past each edge. */
function screenTiles(lon: number, lat: number, z: number): [number, number][] {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const half = { x: SCREEN.w / 2 / 256, y: SCREEN.h / 2 / 256 };
  const out: [number, number][] = [];
  for (let tx = Math.floor(x - half.x) - 1; tx <= Math.floor(x + half.x) + 1; tx++)
    for (let ty = Math.floor(y - half.y) - 1; ty <= Math.floor(y + half.y) + 1; ty++) out.push([tx, ty]);
  return out;
}

/** A tile's box in Web Mercator metres, as MapLibre writes {bbox-epsg-3857}. */
function tileBox(x: number, y: number, z: number): string {
  const size = (2 * ORIGIN) / 2 ** z;
  const minX = -ORIGIN + x * size,
    maxY = ORIGIN - y * size;
  return [minX, maxY - size, minX + size, maxY].join(",");
}

interface Timed {
  ms: number;
  bytes: number;
  png: boolean;
  error?: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

describe.runIf(import.meta.env.MODE === "lidar-tiles")("lidar terrain's tiles, live", () => {
  it("times a phone screen of tiles at zooms 13–17, in both styles, over the fixture parcels", async () => {
    const http = createHttpClient({
      env: "node",
      fetchImpl: live(),
      userAgent: "ParcelScreen/1.0 (lidar tile timing; zgrether/parcelscreen)",
      defaultPolicy: { maxConcurrent: 6, minIntervalMs: 0 },
    });
    const slugs: FixtureSlug[] = [...PROTOTYPE_FIXTURE_SLUGS, "roan-hwy-143-099-046-02"];
    const rows: string[] = [
      "| Style | Zoom | Tiles | Median | Slowest | Over 1.5 s | Not a PNG | One screen |",
      "|---|---|---|---|---|---|---|---|",
    ];
    const problems: string[] = [];
    for (const style of LIDAR_STYLES.map((s) => s.id) as LidarStyle[]) {
      for (const z of ZOOMS) {
        const timed: Timed[] = [];
        const screens: number[] = [];
        for (const slug of slugs) {
          const [lon, lat] = centroid(loadFixture(slug).input.polygon).geometry.coordinates as [
            number,
            number,
          ];
          const tiles = screenTiles(lon, lat, z);
          const got = await Promise.all(
            tiles.map(async ([x, y]): Promise<Timed> => {
              const url = lidarTiles(style).replace("{bbox-epsg-3857}", tileBox(x, y, z));
              const t0 = performance.now();
              try {
                const r = await http.fetch(url, { timeoutMs: 30_000 });
                const body = new Uint8Array(await r.arrayBuffer());
                const png = PNG.every((b, i) => body[i] === b);
                return {
                  ms: performance.now() - t0,
                  bytes: body.length,
                  png,
                  ...(png ? {} : { error: new TextDecoder().decode(body.slice(0, 200)) }),
                };
              } catch (e) {
                return { ms: performance.now() - t0, bytes: 0, png: false, error: String(e) };
              }
            }),
          );
          timed.push(...got);
          screens.push(got.reduce((t, g) => t + g.bytes, 0));
          for (const g of got) if (g.error) problems.push(`${style} z${z} ${slug}: ${g.error}`);
        }
        const ms = timed.map((t) => t.ms);
        rows.push(
          `| ${style} | ${z} | ${timed.length} | ${Math.round(median(ms))} ms | ${Math.round(Math.max(...ms))} ms | ${
            ms.filter((m) => m > 1500).length
          } | ${timed.filter((t) => !t.png).length} | ${Math.round(median(screens) / 1024)} KB |`,
        );
      }
    }
    const report = [
      "# Lidar terrain tiles, timed",
      "",
      `${new Date().toISOString()}; six requests at a time; a screen is 375 × 812 plus a tile past each edge.`,
      "",
      ...rows,
      "",
      problems.length
        ? `## Problems (first 20 of ${problems.length})\n\n${problems.slice(0, 20).join("\n")}`
        : "No problems.",
    ].join("\n");
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/lidar-tiles.md", report);
    console.log(report);
  }, 1_800_000);
});
