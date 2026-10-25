/**
 * The shaded-relief candidates, judged live (roadmap step 14c plan §3; owner, 10/25): first-view speed, terms and
 * coverage, for the PR. The detail is the comparison shots' (screenshots/lidar-compare.spec.ts).
 * - Speed: one phone screen of tiles (375 × 812 plus a tile past each edge) at view zooms 15 and 17, at each spot the
 *   candidate covers. Rendered-on-request services get a parameter of this run's own, so every tile is a first view
 *   (USGS's CDN keeps what earlier requests asked for). Each tile is timed from when it was sent, not while it queued.
 *   Slope (USGS 3DEP, staying as built) is timed the same way.
 * - Terms: each service's own description (copyright line, whether tiles may be exported for offline use) and, for
 *   Esri's, its ArcGIS item's licence text.
 * - Coverage: points across VA, NC and TN: whether 3DEP's index holds 1 m lidar there, and what each candidate answers.
 * - The states' servers searched for a lidar relief service (VGIN, NC OneMap, TNMap).
 * A measurement kept for re-use, not a check: tests never reach the network.
 *
 *   pnpm lidar:tiles        writes test-results/lidar-tiles.md, and prints it
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { lidarTiles } from "@/components/Map/lidarStyle";
import {
  BASE_CANDIDATES,
  COVERAGE_POINTS,
  DEP_INDEX,
  SPOTS,
  findStateServices,
  stateCandidate,
  tileBox,
  tileOf,
  type Candidate,
} from "./reliefCandidates";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const VIEW_ZOOMS = [15, 17] as const;
const SCREEN = { w: 375, h: 812 } as const;
const MAGIC = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x52, 0x49, 0x46, 0x46], // WebP (RIFF)
  [0x49, 0x49, 0x2a, 0x00], // TIFF, little-endian
  [0x4d, 0x4d, 0x00, 0x2a], // TIFF, big-endian
];
const isImage = (b: Uint8Array) => MAGIC.some((m) => m.every((v, i) => b[i] === v));
const RUN = `ps_run=${Date.now().toString(36)}`;

const SLOPE: Candidate = {
  id: "3dep-slope",
  label: "USGS 3DEP exportImage, Slope (as built, staying)",
  kind: "raster",
  url: (z, x, y) => lidarTiles("slope").replace("{bbox-epsg-3857}", tileBox(x, y, z)),
  size: 256,
  maxzoom: 18,
  dynamic: true,
  covers: "all",
  source: "3DEP best available",
};

/** The tiles a phone screen centred on a point needs: 256 px sources one zoom deeper than the view, capped. */
function screenTiles(
  lat: number,
  lon: number,
  viewZ: number,
  c: Candidate,
): { z: number; xy: [number, number][] } {
  const z = Math.min(c.size === 256 ? viewZ + 1 : viewZ, c.maxzoom);
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tilePx = 512 / 2 ** (z - viewZ);
  const half = { x: SCREEN.w / 2 / tilePx, y: SCREEN.h / 2 / tilePx };
  const xy: [number, number][] = [];
  for (let tx = Math.floor(x - half.x) - 1; tx <= Math.floor(x + half.x) + 1; tx++)
    for (let ty = Math.floor(y - half.y) - 1; ty <= Math.floor(y + half.y) + 1; ty++) xy.push([tx, ty]);
  return { z, xy };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

describe.runIf(import.meta.env.MODE === "lidar-tiles")("the shaded-relief candidates, live", () => {
  it("times first views, reads the terms and checks coverage", async () => {
    const served = new Map<string, number>();
    const timedFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const t0 = performance.now();
      const r = await live()(input, init);
      const body = r.status === 304 ? null : await r.arrayBuffer();
      served.set(url, performance.now() - t0);
      return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
    };
    const http = createHttpClient({
      env: "node",
      fetchImpl: timedFetch,
      userAgent: "ParcelScreen/1.0 (shaded relief comparison; zgrether/parcelscreen)",
      defaultPolicy: { maxConcurrent: 6, minIntervalMs: 0 },
      maxRetries: 0,
    });
    const get = (url: string) => http.fetch(url, { timeoutMs: 60_000, retries: 0 });
    const out: string[] = ["# Shaded relief: the candidates, live", "", new Date().toISOString(), ""];

    // ---------- the states' servers ----------
    const log: string[] = [];
    const found = await findStateServices((u, i) => live()(u, i), log);
    out.push("## The states' servers, searched for lidar relief", "", ...log.map((l) => `- ${l}`), "");
    if (found.length) {
      out.push(
        "| Service | Type | Cached | Spatial ref | Deepest level | Pixel size | Raster functions | Export tiles | Copyright |",
        "|---|---|---|---|---|---|---|---|---|",
      );
      for (const s of found)
        out.push(
          `| ${s.url} | ${s.type} | ${s.cached} | ${s.wkid ?? ""} | ${s.maxLevel ?? ""} | ${s.pixelSize ?? ""} | ${s.functions.join(", ")} | ${s.exportTiles ?? ""} | ${s.copyright.slice(0, 120)} |`,
        );
      out.push("");
    }
    const states = found.map(stateCandidate).filter((c): c is Candidate => c !== null);
    const candidates = [...BASE_CANDIDATES, ...states, SLOPE];
    out.push(`State candidates drawn on the map: ${states.map((c) => c.label).join("; ") || "none"}.`, "");

    // ---------- speed: first views ----------
    out.push(
      "## First-view speed (a phone screen; each tile timed from when it was sent)",
      "",
      "| Candidate | Spot | View zoom | Tile zoom | Tiles | Median tile | Slowest | Over 1.5 s | Whole screen | Not an image | One screen |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
    );
    const problems: string[] = [];
    for (const c of candidates) {
      for (const spot of SPOTS) {
        if (c.covers !== "all" && c.covers !== spot.state) continue;
        for (const viewZ of VIEW_ZOOMS) {
          const { z, xy } = screenTiles(spot.ll[0], spot.ll[1], viewZ, c);
          const w0 = performance.now();
          const got = await Promise.all(
            xy.map(async ([x, y]) => {
              const url = c.url(z, x, y) + (c.dynamic ? `&${RUN}` : "");
              try {
                const r = await get(url);
                const body = new Uint8Array(await r.arrayBuffer());
                const image = r.ok && isImage(body);
                if (!image)
                  problems.push(
                    `${c.id} z${z} ${spot.id}: ${r.status} ${new TextDecoder().decode(body.slice(0, 100)).replace(/\s+/g, " ")}`,
                  );
                return { ms: served.get(url) ?? NaN, bytes: body.length, image };
              } catch (e) {
                problems.push(`${c.id} z${z} ${spot.id}: ${String(e)}`);
                return { ms: served.get(url) ?? NaN, bytes: 0, image: false };
              }
            }),
          );
          const wall = performance.now() - w0;
          const ms = got.map((g) => g.ms).filter(Number.isFinite);
          out.push(
            `| ${c.label} | ${spot.label} | ${viewZ} | ${z} | ${got.length} | ${Math.round(median(ms))} ms | ${Math.round(Math.max(...ms))} ms | ${ms.filter((m) => m > 1500).length} | ${(wall / 1000).toFixed(1)} s | ${got.filter((g) => !g.image).length} | ${kb(got.reduce((t, g) => t + g.bytes, 0))} |`,
          );
        }
      }
    }
    out.push("");

    // ---------- terms ----------
    out.push("## Terms, as each service states them", "");
    for (const c of candidates.filter((x) => x.about && x.id !== "3dep-slope")) {
      try {
        const j = (await (await get(`${c.about}?f=json`)).json()) as Record<string, unknown>;
        out.push(
          `- **${c.label}** (${c.about}): copyright "${String(j.copyrightText ?? "")
            .replace(/\s+/g, " ")
            .slice(
              0,
              300,
            )}"; exportTilesAllowed ${String(j.exportTilesAllowed ?? "not stated")}; maxExportTilesCount ${String(j.maxExportTilesCount ?? "not stated")}; license "${String(
            j.license ?? j.licenseInfo ?? "",
          )
            .replace(/<[^>]+>/g, " ")
            .slice(0, 200)}"`,
        );
      } catch (e) {
        out.push(`- **${c.label}**: no description (${String(e)})`);
      }
    }
    try {
      const q = new URLSearchParams({ q: 'title:"World Hillshade" AND owner:esri', f: "json", num: "5" });
      const j = (await (await get(`https://www.arcgis.com/sharing/rest/search?${q}`)).json()) as {
        results?: {
          id: string;
          title: string;
          owner: string;
          licenseInfo?: string;
          accessInformation?: string;
        }[];
      };
      for (const it of j.results ?? [])
        out.push(
          `- **ArcGIS item ${it.id}, "${it.title}" (${it.owner})**: licence "${(it.licenseInfo ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 900)}"; credits "${(it.accessInformation ?? "").slice(0, 200)}"`,
        );
    } catch (e) {
      out.push(`- Esri's item search didn't answer (${String(e)})`);
    }
    try {
      const r = await get("https://tiles.mapterhorn.com/tilejson.json");
      out.push(
        `- **Mapterhorn tilejson** (${r.status}): ${(await r.text()).replace(/\s+/g, " ").slice(0, 600)}`,
      );
    } catch (e) {
      out.push(`- Mapterhorn's tilejson didn't answer (${String(e)})`);
    }
    out.push("");

    // ---------- coverage ----------
    out.push("## Coverage across VA, NC and TN", "");
    let oneMeter: { id: number; name: string }[] = [];
    try {
      const j = (await (await get(`${DEP_INDEX}?f=json`)).json()) as {
        layers?: { id: number; name: string }[];
      };
      oneMeter = (j.layers ?? []).filter((l) => /1\s*m(eter)?\b|one meter/i.test(l.name));
      out.push(
        `3DEP index layers saying 1 m: ${oneMeter.map((l) => `${l.id} ${l.name}`).join("; ") || "none found"}.`,
        "",
      );
    } catch (e) {
      out.push(`3DEP's index didn't answer (${String(e)}).`, "");
    }
    out.push(
      `| Point | 3DEP 1 m | ${candidates
        .filter((c) => c.id !== "3dep-slope")
        .map((c) => c.label)
        .join(" | ")} |`,
      `|---|---|${candidates
        .filter((c) => c.id !== "3dep-slope")
        .map(() => "---")
        .join("|")}|`,
    );
    for (const p of COVERAGE_POINTS) {
      let dep = "?";
      try {
        const counts = await Promise.all(
          oneMeter.map(async (l) => {
            const q = new URLSearchParams({
              geometry: `${p.ll[1]},${p.ll[0]}`,
              geometryType: "esriGeometryPoint",
              inSR: "4326",
              spatialRel: "esriSpatialRelIntersects",
              returnCountOnly: "true",
              f: "json",
            });
            const j = (await (await get(`${DEP_INDEX}/${l.id}/query?${q}`)).json()) as { count?: number };
            return j.count ?? 0;
          }),
        );
        dep = counts.some((n) => n > 0) ? "yes" : "no";
      } catch {
        dep = "?";
      }
      const cells: string[] = [];
      for (const c of candidates.filter((x) => x.id !== "3dep-slope")) {
        if (c.covers !== "all" && c.covers !== p.state) {
          cells.push("outside");
          continue;
        }
        // The deepest zoom with a real answer, from its maxzoom down; the bytes say whether it's blank.
        let cell = "none";
        for (let z = c.maxzoom; z >= Math.max(12, c.maxzoom - 4); z--) {
          const [x, y] = tileOf(p.ll[0], p.ll[1], z);
          try {
            const r = await get(c.url(z, x, y) + (c.dynamic ? `&${RUN}` : ""));
            const b = new Uint8Array(await r.arrayBuffer());
            if (r.ok && isImage(b)) {
              cell = `z${z}, ${kb(b.length)}`;
              break;
            }
          } catch {
            // try a zoom out
          }
        }
        cells.push(cell);
      }
      out.push(`| ${p.label}, ${p.state} | ${dep} | ${cells.join(" | ")} |`);
    }
    out.push("");

    out.push(
      problems.length
        ? `## Problems (first 40 of ${problems.length})\n\n${problems.slice(0, 40).join("\n")}`
        : "No problems.",
    );
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/lidar-tiles.md", out.join("\n"));
    console.log(out.join("\n"));
  }, 2_400_000);
});
