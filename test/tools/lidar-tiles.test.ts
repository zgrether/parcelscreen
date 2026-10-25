/**
 * Lidar terrain's tiles, timed live (roadmap step 14c plan §3): one phone screen of tiles (375 × 812, with the tile
 * row past each edge MapLibre asks for) at zooms 13–17, over the four fixture parcels. Timed: USGS 3DEP's
 * exportImage in both styles (what the layer draws), and the pre-rendered candidates the plan compares when those are
 * slow (USGS's cached shaded relief, Esri's World Hillshade, Mapterhorn's lidar elevation tiles). For each source and
 * zoom:
 * - the median and slowest tile, timed from when the request left (not while it waited its turn in the queue);
 * - the median wall time for the whole screen;
 * - how many answers weren't an image (an ArcGIS error, a 502, a missing tile) and what a screen weighs.
 * Then each cached service's own description (its deepest level, its copyright line), and the deepest zoom Mapterhorn
 * has tiles at over each parcel (its 1 m lidar is z17 and deeper; its 10 m base stops at z12).
 * A measurement kept for re-use, not a check: tests never reach the network.
 *
 *   pnpm lidar:tiles        writes test-results/lidar-tiles.md, and prints it
 *
 * Six requests at a time per host, as a browser's map asks for a screen's tiles, through lib/http.ts's client.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { centroid } from "@turf/turf";
import { describe, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { LIDAR_STYLES, lidarTiles } from "@/components/Map/lidarStyle";
import { PROTOTYPE_FIXTURE_SLUGS, loadFixture, type FixtureSlug } from "../support/fixtures";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const ZOOMS = [13, 14, 15, 16, 17] as const;
const SCREEN = { w: 375, h: 812 } as const;
const ORIGIN = 20037508.342789244;
const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8, 0xff],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF
};

/** A tile source: its URL for a tile, its pixel size, and the deepest zoom it's asked for (MapLibre overzooms past it). */
interface Source {
  id: string;
  label: string;
  url: (z: number, x: number, y: number) => string;
  size: 256 | 512;
  maxzoom: number;
  /** An ArcGIS cached service's description, for its levels and copyright. */
  about?: string;
}

/** A tile's box in Web Mercator metres, as MapLibre writes {bbox-epsg-3857}. */
function tileBox(x: number, y: number, z: number): string {
  const size = (2 * ORIGIN) / 2 ** z;
  const minX = -ORIGIN + x * size,
    maxY = ORIGIN - y * size;
  return [minX, maxY - size, minX + size, maxY].join(",");
}

const USGS_SHADED = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer";
const ESRI_HILLSHADE =
  "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer";

const SOURCES: readonly Source[] = [
  ...LIDAR_STYLES.map((s): Source => ({
    id: `3dep-${s.id}`,
    label: `USGS 3DEP exportImage, ${s.label}`,
    url: (z, x, y) => lidarTiles(s.id).replace("{bbox-epsg-3857}", tileBox(x, y, z)),
    size: 256,
    maxzoom: 18,
  })),
  {
    id: "usgs-shaded",
    label: "USGS Shaded Relief (cached)",
    url: (z, x, y) => `${USGS_SHADED}/tile/${z}/${y}/${x}`,
    size: 256,
    maxzoom: 16,
    about: USGS_SHADED,
  },
  {
    id: "esri-hillshade",
    label: "Esri World Hillshade (cached)",
    url: (z, x, y) => `${ESRI_HILLSHADE}/tile/${z}/${y}/${x}`,
    size: 256,
    maxzoom: 16,
    about: ESRI_HILLSHADE,
  },
  {
    id: "mapterhorn",
    label: "Mapterhorn elevation (terrarium, shaded by MapLibre)",
    url: (z, x, y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`,
    size: 512,
    maxzoom: 18,
  },
];

/**
 * The tiles a 375 × 812 screen centred on a point needs at a view zoom, one row and column past each edge. MapLibre
 * asks a 256 px raster source for the tiles one zoom deeper than the view, and a 512 px one for the view's own, each
 * capped at the source's maxzoom (then overzoomed).
 */
function screenTiles(
  lon: number,
  lat: number,
  viewZ: number,
  src: Source,
): { z: number; xy: [number, number][] } {
  const z = Math.min(src.size === 256 ? viewZ + 1 : viewZ, src.maxzoom);
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  // A tile of zoom z drawn at the view zoom: 512 CSS px at the view's own zoom, halved for each zoom deeper.
  const tilePx = 512 / 2 ** (z - viewZ);
  const half = { x: SCREEN.w / 2 / tilePx, y: SCREEN.h / 2 / tilePx };
  const xy: [number, number][] = [];
  for (let tx = Math.floor(x - half.x) - 1; tx <= Math.floor(x + half.x) + 1; tx++)
    for (let ty = Math.floor(y - half.y) - 1; ty <= Math.floor(y + half.y) + 1; ty++) xy.push([tx, ty]);
  return { z, xy };
}

interface Timed {
  ms: number;
  bytes: number;
  image: boolean;
  status: number;
  error?: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

const isImage = (b: Uint8Array) => Object.values(MAGIC).some((m) => m.every((v, i) => b[i] === v));

describe.runIf(import.meta.env.MODE === "lidar-tiles")("lidar terrain's tiles, live", () => {
  it("times a phone screen of tiles at zooms 13–17 from each source, over the fixture parcels", async () => {
    // Each request's own time, from when the client sent it (after its turn in the host queue) to its last byte.
    const served = new Map<string, number>();
    const timedFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const t0 = performance.now();
      const r = await live()(input, init);
      const body = await r.arrayBuffer();
      served.set(url, performance.now() - t0);
      return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
    };
    const http = createHttpClient({
      env: "node",
      fetchImpl: timedFetch,
      userAgent: "ParcelScreen/1.0 (lidar tile timing; zgrether/parcelscreen)",
      defaultPolicy: { maxConcurrent: 6, minIntervalMs: 0 },
      maxRetries: 0,
    });
    const slugs: FixtureSlug[] = [...PROTOTYPE_FIXTURE_SLUGS, "roan-hwy-143-099-046-02"];
    const centres = slugs.map(
      (slug) => centroid(loadFixture(slug).input.polygon).geometry.coordinates as [number, number],
    );
    const rows: string[] = [
      "| Source | View zoom | Tile zoom | Tiles | Median tile | Slowest | Over 1.5 s | Whole screen | Not an image | One screen |",
      "|---|---|---|---|---|---|---|---|---|---|",
    ];
    const problems: string[] = [];
    for (const src of SOURCES) {
      for (const viewZ of ZOOMS) {
        const timed: Timed[] = [];
        const screens: number[] = [];
        const walls: number[] = [];
        let tileZ: number = viewZ;
        for (const [i, [lon, lat]] of centres.entries()) {
          const { z, xy } = screenTiles(lon, lat, viewZ, src);
          tileZ = z;
          const w0 = performance.now();
          const got = await Promise.all(
            xy.map(async ([x, y]): Promise<Timed> => {
              const url = src.url(z, x, y);
              try {
                const r = await http.fetch(url, { timeoutMs: 60_000, retries: 0 });
                const body = new Uint8Array(await r.arrayBuffer());
                const image = r.ok && isImage(body);
                return {
                  ms: served.get(url) ?? NaN,
                  bytes: body.length,
                  image,
                  status: r.status,
                  ...(image ? {} : { error: `${r.status} ${new TextDecoder().decode(body.slice(0, 120))}` }),
                };
              } catch (e) {
                return { ms: served.get(url) ?? NaN, bytes: 0, image: false, status: 0, error: String(e) };
              }
            }),
          );
          walls.push(performance.now() - w0);
          timed.push(...got);
          screens.push(got.reduce((t, g) => t + g.bytes, 0));
          for (const g of got)
            if (g.error) problems.push(`${src.id} z${z} ${slugs[i]}: ${g.error.replace(/\s+/g, " ")}`);
        }
        const ms = timed.map((t) => t.ms).filter(Number.isFinite);
        rows.push(
          `| ${src.label} | ${viewZ} | ${tileZ} | ${timed.length} | ${Math.round(median(ms))} ms | ${Math.round(
            Math.max(...ms),
          )} ms | ${ms.filter((m) => m > 1500).length} | ${(median(walls) / 1000).toFixed(1)} s | ${
            timed.filter((t) => !t.image).length
          } | ${Math.round(median(screens) / 1024)} KB |`,
        );
      }
    }

    // The cached services' own descriptions: their deepest level and copyright line.
    const about: string[] = [];
    for (const src of SOURCES.filter((s) => s.about)) {
      try {
        const r = await http.fetch(`${src.about}?f=json`, { timeoutMs: 30_000 });
        const j = (await r.json()) as {
          copyrightText?: string;
          singleFusedMapCache?: boolean;
          tileInfo?: { lods?: { level: number; resolution: number }[] };
          maxLOD?: number;
          description?: string;
        };
        const lods = j.tileInfo?.lods ?? [];
        about.push(
          `- **${src.label}:** cached ${j.singleFusedMapCache ?? "?"}; levels ${lods[0]?.level ?? "?"}–${
            lods.at(-1)?.level ?? "?"
          }${j.maxLOD !== undefined ? ` (maxLOD ${j.maxLOD})` : ""}; copyright "${j.copyrightText ?? ""}"; ${(
            j.description ?? ""
          )
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 400)}`,
        );
      } catch (e) {
        about.push(`- **${src.label}:** no description (${String(e)})`);
      }
    }

    // Mapterhorn keeps deep zooms only where its source is fine: the deepest tile over a parcel says its resolution.
    const deepest: string[] = [];
    const terra = SOURCES.find((s) => s.id === "mapterhorn")!;
    for (const [i, [lon, lat]] of centres.entries()) {
      const found: string[] = [];
      for (let z = 12; z <= 18; z++) {
        const n = 2 ** z;
        const x = Math.floor(((lon + 180) / 360) * n);
        const r = (lat * Math.PI) / 180;
        const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
        try {
          const res = await http.fetch(terra.url(z, x, y), { timeoutMs: 30_000, retries: 0 });
          const ok = res.ok && isImage(new Uint8Array(await res.arrayBuffer()));
          found.push(`z${z} ${ok ? "yes" : res.status}`);
        } catch (e) {
          found.push(`z${z} ${String(e).slice(0, 40)}`);
        }
      }
      deepest.push(`- ${slugs[i]}: ${found.join(", ")}`);
    }

    const report = [
      "# Lidar terrain tiles, timed",
      "",
      `${new Date().toISOString()}; six requests at a time per host, no retries; a screen is 375 × 812 CSS px plus a tile past each edge.`,
      "A tile's time runs from when it was sent (not while it queued); the whole screen is the wall time for all of its tiles.",
      "",
      ...rows,
      "",
      "## The cached services",
      "",
      ...about,
      "",
      "## Mapterhorn's tiles over each parcel (at 36°N a 512 px pixel is 2.4 m at z15, 1.2 m at z16, 0.6 m at z17)",
      "",
      ...deepest,
      "",
      problems.length
        ? `## Problems (first 30 of ${problems.length})\n\n${problems.slice(0, 30).join("\n")}`
        : "No problems.",
    ].join("\n");
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/lidar-tiles.md", report);
    console.log(report);
  }, 2_400_000);
});
