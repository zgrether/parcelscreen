/**
 * The existing-house mission's probe (docs/plans/existing-house.md §2, §5 PR 1), live on the runners
 * (existing-house.yml; this repo's cloud sessions can't reach these hosts):
 *   - parcel 010-A-10 (Washington Co., VA) from VGIN's parcels, graded live with no house mark: its trailheads, its
 *     elevation source, and the default rubric's verdict and rows (the "before");
 *   - why the trailhead at Hayters Gap (the Brumley Mountain Trail, to The Channels) isn't among the baked places: what
 *     OpenStreetMap has there, VGIN's landmark types, and whether Virginia publishes state forest access points.
 *
 *   pnpm exec vitest run test/tools/existing-house-probe.test.ts --mode existing-house-probe
 *
 * Round 1 (#417) found the trailhead lot at Hayters Gap tagged only amenity=parking, and VGIN's "State Forest Points";
 * its parcel lookup matched nothing. Round 2, kept here, finds the parcel and tries the bake rule the plan proposes.
 * Read-only; nothing is written to the repo. No owner or address field is asked for (CLAUDE.md, owner fields).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { reportCard } from "@/lib/report/card";
import { defaultNamedRubric } from "@/lib/rubric/default";
import { screen } from "@/lib/screen";
import { trailLotQuery, trailLots, type OsmElement } from "@/lib/places/bake";
import { BAKE_DIR, placesFromDir } from "@/lib/places/disk";
import { driveTable } from "@/lib/screen/drive";
import { paddlingNear } from "@/lib/screen/paddling";
import { cellsWithin, type BakedLaunch } from "@/lib/screen/placeData";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { ProgressEvent } from "@/lib/screen/types";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const UA = "parcelscreen-data/1 (existing-house probe; https://github.com/zgrether/parcelscreen)";

const out: string[] = ["# The existing-house mission's probe", ""];
const say = (...l: string[]) => {
  out.push(...l);
  console.log(l.join("\n"));
};
const write = () => {
  mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
  writeFileSync(join(process.cwd(), "test-results", "existing-house-probe.md"), out.join("\n") + "\n");
};

async function get(url: string, init?: RequestInit): Promise<{ status: number; text: string }> {
  try {
    const r = await live()(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: String(e) };
  }
}
const json = (t: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const clip = (s: unknown, n = 300) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .slice(0, n);

const VA_PARCELS = DEFAULT_ENDPOINTS.parcels[1]!;
/** Only these fields: no owner, mailing or site address. */
const PARCEL_FIELDS = "OBJECTID,PARCELID,PTM_ID,FIPS,LOCALITY";
/** Around Hayters Gap, where VA-80 crosses Clinch Mountain: generous, since the gap's exact point isn't known here. */
const GAP_BOX = { s: 36.74, w: -82.1, n: 36.9, e: -81.85 };
/** How near a lot must be to the trail for the proposed rule (round 2). */
const RULE_M = 60;
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function overpass(q: string): Promise<Record<string, unknown> | null> {
  for (const url of OVERPASS) {
    const r = await get(url, {
      method: "POST",
      body: new URLSearchParams({ data: q }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const j = r.status === 200 ? json(r.text) : null;
    if (j) return j;
    // Overpass's error is in the page's <p>s ("Error: line 1: parse error: …").
    const why = [...r.text.matchAll(/<p>(?:<strong[^>]*>)?([^<]*)(?:<\/strong>)?([^<]*)<\/p>/g)]
      .map((m) => m[1]! + m[2]!)
      .join(" ");
    say(`- Overpass ${new URL(url).host}: HTTP ${r.status} ${clip(why || r.text, 400)}`);
  }
  return null;
}

type OsmEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
};

describe.runIf(import.meta.env.MODE === "existing-house-probe")("the existing-house probe", () => {
  // Round 3 (#420): bake 2 kept 594 lots, but none at Hayters Gap. The bake's own query, for the gap's cell and for a
  // small box, with Overpass's remark (a runtime error comes back as HTTP 200 with partial elements).
  it("round 3: the bake's trail-lot query for the gap's cell", async () => {
    say("## Round 3: the bake's trail-lot query at Hayters Gap", "");
    const bb = `${GAP_BOX.s},${GAP_BOX.w},${GAP_BOX.n},${GAP_BOX.e}`;
    const cellQ = trailLotQuery("36_-82");
    // Round 4: the routes' members of any highway, the trail rule applied in trailLots.
    const variants: [string, string][] = [
      ["the bake's, cell 36_-82", cellQ],
      ["the bake's, the gap's box", cellQ.replace(/\[bbox:[^\]]+\]/, `[bbox:${bb}]`)],
    ];
    for (const [name, q] of variants) {
      const t0 = Date.now();
      const j = await overpass(q);
      const els = (j?.elements as OsmElement[] | undefined) ?? [];
      const lots = els.filter((e) => e.tags?.amenity === "parking");
      const gap = lots.filter((e) => [808088841, 808088844].includes(e.id));
      const nullGeom = els.filter((e) => e.geometry?.some((g) => g == null)).length;
      let named: string[] = [];
      try {
        named = trailLots(els)
          .filter((l) => /80808884[14]/.test(l.id))
          .map((l) => `${l.id} "${l.name}"`);
      } catch (e) {
        named = [`trailLots threw: ${String(e)}`];
      }
      say(
        `### ${name}`,
        "",
        `- ${((Date.now() - t0) / 1000).toFixed(0)} s; remark: ${clip(j?.remark ?? "none", 300)}`,
        `- ${els.length} elements: ${lots.length} lots, ${els.filter((e) => e.type === "way" && e.tags?.highway).length} trail ways, ${els.filter((e) => e.type === "relation").length} routes; ${nullGeom} ways with null points`,
        `- the gap's lots: ${gap.map((e) => `${e.type}/${e.id}`).join(", ") || "none"}; named: ${named.join("; ") || "none"}`,
        "",
      );
      write();
    }
    // The gap's trail and its route, as OSM has them.
    const near = await overpass(
      `[out:json][timeout:60];way(808088841);out center tags;way(around:300)["highway"]->.w;.w out tags center;rel(bw.w)["route"];out tags;`,
    );
    say(
      "### Within 300 m of the gap's lot",
      "",
      ...((near?.elements as OsmEl[] | undefined) ?? []).map(
        (e) => `- ${e.type}/${e.id}: ${clip(JSON.stringify(e.tags), 220)}`,
      ),
      "",
    );
    write();
    expect(out.length).toBeGreaterThan(4);
  }, 1_800_000);

  // Round 4 (Zach, 11/11): grading 010-A-10, Paddling found South Holston Lake (42 min) and missed Hidden Valley Lake
  // and Laurel Bed Lake, both baked as flatwater launches. The six nearest flatwater launches from the house, each one's
  // OSRM table leg and where OSRM snaps it, and paddlingNear's own answer, from the repo's bake.
  it("round 4: the paddling launches from 010-A-10", async () => {
    const from: [number, number] = [36.86562, -81.922];
    const http = createHttpClient({
      env: "node",
      fetchImpl: live(),
      userAgent: "ParcelScreen/1.0 (existing-house probe)",
    });
    const deps = { http, endpoints: DEFAULT_ENDPOINTS };
    const places = placesFromDir(BAKE_DIR);
    const cells = cellsWithin(from, 100);
    const all = [...(await places("osm", cells)), ...(await places("official", cells))].filter(
      (p): p is BakedLaunch => p.kind === "launch" && p.water === "flat",
    );
    const km = (ll: [number, number]) =>
      Math.hypot((ll[0] - from[0]) * 111.2, (ll[1] - from[1]) * 111.2 * Math.cos((from[0] * Math.PI) / 180));
    const near = all
      .map((l) => ({ l, km: km(l.ll) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 10);
    const table = await driveTable(
      from,
      near.map((x) => x.l.ll),
      deps,
    );
    say(
      "## Round 4: paddling from 010-A-10 (the house point)",
      "",
      `- table snap at the start: ${table?.snapM ?? "?"} m`,
      "",
    );
    for (const [i, x] of near.entries()) {
      const nr = await get(
        `https://router.project-osrm.org/nearest/v1/driving/${x.l.ll[1]},${x.l.ll[0]}?number=1`,
      );
      const w = (json(nr.text)?.waypoints as { name?: string; distance?: number }[] | undefined)?.[0];
      const leg = table?.legs[i];
      say(
        `- ${x.l.id} "${x.l.name}" on ${x.l.waterName ?? "?"} (${x.l.waterAc ?? "?"} ac), ${x.km.toFixed(1)} km: ` +
          `${leg ? `${leg.min} min, ${leg.mi} mi` : "no leg"}; snaps to "${w?.name ?? "?"}" ${w?.distance?.toFixed(0) ?? "?"} m off`,
      );
    }
    const pd = await paddlingNear(from, undefined, places, deps);
    say("", `- paddlingNear: ${clip(JSON.stringify(pd?.flat ?? pd), 300)}`, "");
    write();
    expect(out.length).toBeGreaterThan(4);
  }, 600_000);

  // Round 5 (Zach, 11/11): Google Maps has both WMA lakes at 20 to 30 minutes; OSRM, 51 and 52. Each route's steps:
  // the roads it takes, their miles and minutes, so the slow part shows.
  it("round 5: the routes to the WMA lakes", async () => {
    const from: [number, number] = [36.86562, -81.922];
    const to: [string, [number, number]][] = [
      ["Laurel Bed Lake access", [36.957494, -81.813332]],
      ["Hidden Valley Lake access", [36.846513, -82.079744]],
      ["South Holston Lake access", [36.6, -81.97]],
    ];
    say("## Round 5: the routes OSRM takes", "");
    for (const [name, ll] of to) {
      const r = await get(
        `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${ll[1]},${ll[0]}?steps=true&overview=false&alternatives=true`,
      );
      const j = json(r.text) as {
        routes?: {
          duration: number;
          distance: number;
          legs: {
            steps: { name: string; ref?: string; distance: number; duration: number; mode: string }[];
          }[];
        }[];
        waypoints?: { name: string; distance: number }[];
      } | null;
      if (!j?.routes?.length) {
        say(`- ${name}: HTTP ${r.status} ${clip(r.text, 200)}`);
        continue;
      }
      say(
        `### ${name}: ends on "${j.waypoints?.[1]?.name ?? "?"}" ${j.waypoints?.[1]?.distance?.toFixed(0) ?? "?"} m off`,
        "",
      );
      for (const [ri, rt] of j.routes.entries()) {
        say(
          `- route ${ri + 1}: ${(rt.duration / 60).toFixed(0)} min, ${(rt.distance / 1609.34).toFixed(1)} mi`,
        );
        // The steps merged by road, in order.
        const roads: { name: string; mi: number; min: number }[] = [];
        for (const st of rt.legs[0]!.steps) {
          const n = st.name || st.ref || "(unnamed)";
          const last = roads[roads.length - 1];
          if (last && last.name === n) {
            last.mi += st.distance / 1609.34;
            last.min += st.duration / 60;
          } else roads.push({ name: n, mi: st.distance / 1609.34, min: st.duration / 60 });
        }
        for (const x of roads)
          if (x.mi >= 0.1)
            say(
              `  - ${x.name}: ${x.mi.toFixed(1)} mi, ${x.min.toFixed(1)} min (${(x.mi / (x.min / 60)).toFixed(0)} mph)`,
            );
      }
      say("");
    }
    write();
    expect(out.length).toBeGreaterThan(2);
  }, 300_000);

  // Round 6 (Zach, 11/11): Virginia's high-resolution aerial doesn't show at 010-A-10. VBMP's service metadata, and
  // the app's own export request (components/Map/style.ts VA_ORTHO) over the parcel at zooms 14 to 19: the HTTP status,
  // the type and size, and whether the PNG is blank (every pixel transparent).
  it("round 6: Virginia's aerial at 010-A-10", async () => {
    const base =
      "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VBMP_Imagery/MostRecentImagery_WGS/MapServer";
    say("## Round 6: VBMP imagery at 010-A-10", "");
    const meta = await get(`${base}?f=json`);
    const mj = json(meta.text) as Record<string, unknown> | null;
    say(
      `- metadata: HTTP ${meta.status}; ${clip(
        mj
          ? JSON.stringify({
              minScale: mj.minScale,
              maxScale: mj.maxScale,
              layers: (
                mj.layers as { id: number; name: string; minScale?: number; maxScale?: number }[] | undefined
              )?.map((l) => `${l.id} ${l.name} (${l.minScale ?? "?"}–${l.maxScale ?? "?"})`),
              singleFusedMapCache: mj.singleFusedMapCache,
              capabilities: mj.capabilities,
              maxImageWidth: mj.maxImageWidth,
            })
          : meta.text,
        1200,
      )}`,
    );
    const lat = 36.86562,
      lon = -81.922;
    const merc = (lo: number, la: number): [number, number] => [
      (lo * 20037508.34) / 180,
      (Math.log(Math.tan(((90 + la) * Math.PI) / 360)) * 20037508.34) / Math.PI,
    ];
    for (const z of [14, 15, 16, 17, 18, 19]) {
      const n = 2 ** z;
      const x = Math.floor(((lon + 180) / 360) * n);
      const y = Math.floor(
        ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
          2) *
          n,
      );
      const tlon = (xx: number) => (xx / n) * 360 - 180;
      const tlat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
      const [w, s] = merc(tlon(x), tlat(y + 1));
      const [e, nn] = merc(tlon(x + 1), tlat(y));
      const url = `${base}/export?bbox=${w},${s},${e},${nn}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`;
      const t0 = Date.now();
      try {
        // As a browser asks from the deployed app: CORS needs Access-Control-Allow-Origin back.
        const r = await live()(url, {
          headers: { "User-Agent": UA, Origin: "https://parcelscreen.vercel.app" },
        });
        say(
          `- z${z} headers: access-control-allow-origin=${r.headers.get("access-control-allow-origin") ?? "(none)"}, cache-control=${r.headers.get("cache-control") ?? "(none)"}`,
        );
        const buf = new Uint8Array(await r.arrayBuffer());
        const type = r.headers.get("content-type") ?? "?";
        let blank = "?";
        if (type.includes("png")) {
          const { decode } = await import("fast-png");
          const img = decode(buf);
          const ch = img.channels;
          let opaque = 0;
          for (let i = ch - 1; i < img.data.length; i += ch) if ((img.data[i] as number) > 0) opaque++;
          blank =
            ch === 4 ? `${((opaque / (img.width * img.height)) * 100).toFixed(0)}% opaque` : `${ch} channels`;
        }
        say(`- z${z}: HTTP ${r.status}, ${type}, ${buf.length} bytes, ${blank}, ${Date.now() - t0} ms`);
        if (!type.includes("image")) say(`  - ${clip(new TextDecoder().decode(buf), 300)}`);
      } catch (e) {
        say(`- z${z}: ${String(e)} after ${Date.now() - t0} ms`);
      }
    }
    // What imagery covers the point, if the service says (an identify on its layers).
    const id = await get(
      `${base}/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=1&mapExtent=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}&imageDisplay=400,400,96&returnGeometry=false&f=json`,
    );
    say(`- identify: HTTP ${id.status} ${clip(id.text, 800)}`, "");
    write();
    expect(out.length).toBeGreaterThan(2);
  }, 300_000);

  // Round 7: the tiles themselves, as base64 in the log, to look at: VBMP's export at 256 px (the app's request) and
  // at 512 px for the same box (what a 2x screen draws), and Esri's tile, all at z19 over the house. Public imagery of a
  // roof from the air; no owner field.
  it("round 7: VBMP tiles to look at", async () => {
    const lat = 36.86562,
      lon = -81.922,
      z = 19;
    const n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
        n,
    );
    const tlon = (xx: number) => (xx / n) * 360 - 180;
    const tlat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
    const m = (lo: number, la: number) => [
      (lo * 20037508.34) / 180,
      (Math.log(Math.tan(((90 + la) * Math.PI) / 360)) * 20037508.34) / Math.PI,
    ];
    const [w, s] = m(tlon(x), tlat(y + 1));
    const [e, nn] = m(tlon(x + 1), tlat(y));
    const base =
      "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VBMP_Imagery/MostRecentImagery_WGS/MapServer";
    const urls: [string, string][] = [
      [
        "vbmp256",
        `${base}/export?bbox=${w},${s},${e},${nn}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image`,
      ],
      [
        "vbmp512",
        `${base}/export?bbox=${w},${s},${e},${nn}&bboxSR=3857&imageSR=3857&size=512,512&format=jpg&f=image`,
      ],
      [
        "esri",
        `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      ],
    ];
    for (const [name, url] of urls) {
      const r = await live()(url, { headers: { "User-Agent": UA } });
      const b = Buffer.from(await r.arrayBuffer());
      console.log(
        `TILE ${name} ${r.status} ${r.headers.get("content-type")} ${b.length} ${b.toString("base64")}`,
      );
    }
    expect(true).toBe(true);
  }, 120_000);

  // Round 8 (Zach, 11/12): the Virginia Department of Forestry's page for the Brumley Mountain Trail, to cite in the
  // trailhead overrides: its URL, and what it says about the trailhead at Hayters Gap.
  it("round 9: 010-A-10 graded live on the step's code: Trails and Paddling's other lakes", async () => {
    const ids = (
      (json(
        (
          await get(
            `${VA_PARCELS}/query?${new URLSearchParams({
              f: "json",
              where: "1=1",
              geometry: "-81.97,36.80,-81.90,36.87",
              geometryType: "esriGeometryEnvelope",
              inSR: "4326",
              spatialRel: "esriSpatialRelIntersects",
              outFields: "PTM_ID,LOCALITY",
              returnGeometry: "false",
              resultRecordCount: "60",
            })}`,
          )
        ).text,
      )?.features as { attributes: Record<string, unknown> }[] | undefined) ?? []
    ).map((f) => f.attributes);
    const norm = (id: unknown) =>
      String(id ?? "")
        .replace(/[^0-9A-Z]/gi, "")
        .toUpperCase();
    const hit = ids.find((a) => norm(a.PTM_ID) === "010A10" || norm(a.PTM_ID) === "10A10");
    say("## Round 9: 010-A-10 graded live on the step's code (no house mark)", "");
    if (!hit) {
      say("- 010-A-10 not found near the gap.", "");
      write();
      return;
    }
    const fc = json(
      (
        await get(
          `${VA_PARCELS}/query?${new URLSearchParams({
            f: "geojson",
            where: `PTM_ID='${String(hit.PTM_ID)}' AND LOCALITY='${String(hit.LOCALITY)}'`,
            outFields: PARCEL_FIELDS,
            returnGeometry: "true",
            outSR: "4326",
          })}`,
        )
      ).text,
    ) as { features?: Feature<Polygon>[] } | null;
    const parcel = fc?.features?.[0];
    if (!parcel?.geometry) {
      say("- No outline came back.", "");
      write();
      return;
    }
    const t0 = performance.now();
    const { result } = await screen(
      { polygon: parcel.geometry, config: DEFAULT_USER_CONFIG },
      () => undefined,
      {
        http: createHttpClient({
          env: "node",
          fetchImpl: live(),
          userAgent: "ParcelScreen/1.0 (existing-house probe)",
        }),
        // The step's places, as its preview serves them (the live site serves main's).
        places: placesFromDir(BAKE_DIR),
      } as Parameters<typeof screen>[2],
    );
    const card = reportCard(result, defaultNamedRubric());
    const th = result.near?.trailheads ?? [];
    const p = result.paddling;
    say(
      `- Graded in ${((performance.now() - t0) / 1000).toFixed(0)} s; failed ${JSON.stringify(result.failed)}`,
      `- Trailheads (${result.near?.trailheadCount ?? 0}): ${
        th
          .slice(0, 6)
          .map(
            (t) =>
              `${t.name} (${t.source}, ${t.drive ? `${Math.round(t.drive.min)} min, ${t.drive.mi.toFixed(1)} mi` : "no drive"})`,
          )
          .join("; ") || "none"
      }`,
      `- Paddling: nearest ${p?.flat ? `${p.flat.name} ${Math.round(p.flat.min)} min` : "none"}; other lakes: ${
        p?.others?.map((o) => `${o.name} ${Math.round(o.min)} min (${o.mi.toFixed(1)} mi)`).join("; ") || "none"
      }`,
      "",
      `- ${card.verdict} · ${card.grade ?? "–"} (${card.points ?? "–"} points): ${clip(card.reason, 300)}`,
      ...card.gates.map((g) => `- Must ${g.label}: ${g.status}`),
      ...card.rows.map((r) => `- ${r.label}: ${r.grade ?? "–"}: ${clip(r.detail, 160)}`),
      "",
    );
    write();
    expect(card.rows.length).toBeGreaterThan(0);
  }, 900_000);

  it("round 8: VDOF's Brumley Mountain Trail page", async () => {
    say("## Round 8: VDOF's Brumley Mountain Trail page", "");
    const pages = [
      "https://dof.virginia.gov/?s=brumley",
      "https://dof.virginia.gov/?s=channels+state+forest",
      "https://dof.virginia.gov/state-forests/",
      "https://dof.virginia.gov/state-forests/channels-state-forest/",
      "https://dof.virginia.gov/wp-json/wp/v2/search?search=brumley",
      "https://dof.virginia.gov/wp-json/wp/v2/search?search=channels",
    ];
    const found = new Set<string>();
    for (const u of pages) {
      const r = await get(u);
      const links = [
        ...r.text.matchAll(/https?:\/\/dof\.virginia\.gov\/[^"'\s<>\\]*(?:brumley|channels)[^"'\s<>\\]*/gi),
      ].map((m) => m[0]);
      links.forEach((l) => found.add(l));
      say(`- ${u}: HTTP ${r.status}, ${r.text.length} chars, ${links.length} links`);
    }
    say("", "Links:", ...[...found].map((l) => `- ${l}`), "");
    found.add("https://dof.virginia.gov/state-forests/channels-state-forest/");
    for (const l of [...found].filter((x) => !/\?s=|wp-json|\/feed|\.(jpg|png|pdf)$/i.test(x)).slice(0, 4)) {
      const r = await get(l);
      const text = r.text
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
      const hits = [
        ...text.matchAll(/[^.]{0,200}(Hayters|Brumley|Route 80|Rt\. 80|trailhead|parking)[^.]{0,200}\./gi),
      ]
        .map((m) => m[0].trim())
        .slice(0, 6);
      say(`### ${l} (HTTP ${r.status})`, "", ...hits.map((h) => `> ${clip(h, 400)}`), "");
    }
    write();
    expect(out.length).toBeGreaterThan(2);
  }, 300_000);

  it("round 2: 010-A-10 found and graded live; the trailhead rule tried at Hayters Gap", async () => {
    // ---------- 010-A-10: round 1's LIKE matched nothing, so the format is read from the parcels near the gap ----------
    const sample = json(
      (
        await get(
          `${VA_PARCELS}/query?${new URLSearchParams({
            f: "json",
            where: "1=1",
            geometry: "-81.97,36.80,-81.90,36.87",
            geometryType: "esriGeometryEnvelope",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            outFields: "PTM_ID,LOCALITY,FIPS",
            returnGeometry: "false",
            resultRecordCount: "60",
          })}`,
        )
      ).text,
    );
    const ids = ((sample?.features as { attributes: Record<string, unknown> }[] | undefined) ?? []).map(
      (f) => f.attributes,
    );
    say(
      "## Parcel 010-A-10 (VGIN parcels)",
      "",
      `- Near Hayters Gap: ${ids.length} records${sample?.error ? `; error ${clip(JSON.stringify(sample.error))}` : ""}`,
      `- Their ids: ${clip(ids.map((a) => `${String(a.PTM_ID)} (${String(a.LOCALITY)}, ${String(a.FIPS)})`).join("; "), 1500)}`,
      "",
    );
    const want = (id: unknown) =>
      String(id ?? "")
        .replace(/[^0-9A-Z]/gi, "")
        .toUpperCase();
    const hit = ids.find((a) => want(a.PTM_ID) === "010A10" || want(a.PTM_ID) === "10A10");
    const locality = String(hit?.LOCALITY ?? ids[0]?.LOCALITY ?? "");
    const tries = [
      ...(hit ? [`PTM_ID='${String(hit.PTM_ID)}' AND LOCALITY='${locality}'`] : []),
      `PTM_ID='010-A-10' AND LOCALITY='${locality}'`,
      `PTM_ID='010 A 10' AND LOCALITY='${locality}'`,
      `PTM_ID LIKE '010%A%10%' AND LOCALITY='${locality}'`,
    ];
    let feats: Feature<Polygon>[] = [];
    for (const where of tries) {
      const pr = await get(
        `${VA_PARCELS}/query?${new URLSearchParams({
          f: "geojson",
          where,
          outFields: PARCEL_FIELDS,
          returnGeometry: "true",
          outSR: "4326",
        })}`,
      );
      const fc = json(pr.text) as { features?: Feature<Polygon>[]; error?: unknown } | null;
      feats = fc?.features ?? [];
      say(
        `- \`${where}\`: HTTP ${pr.status}, ${feats.length} match(es)${fc?.error ? `, error ${clip(JSON.stringify(fc.error))}` : ""}`,
        ...feats.map((f) => `  - ${clip(JSON.stringify(f.properties), 200)}; ${f.geometry?.type}`),
      );
      if (feats.length) break;
    }
    say("");
    const parcel = feats[0];

    if (parcel?.geometry) {
      const ring = parcel.geometry.coordinates[0]!;
      const cx = ring.reduce((a, p) => a + p[0]!, 0) / ring.length,
        cy = ring.reduce((a, p) => a + p[1]!, 0) / ring.length;
      say(`- Its outline's mean vertex: ${cy.toFixed(3)}, ${cx.toFixed(3)}`, "");
      const steps = new Map<string, string>();
      const t0 = performance.now();
      const { result } = await screen(
        { polygon: parcel.geometry, config: DEFAULT_USER_CONFIG },
        (e: ProgressEvent) => {
          if (e.status !== "run") steps.set(e.step, e.status);
        },
        {
          http: createHttpClient({
            env: "node",
            fetchImpl: live(),
            userAgent: "ParcelScreen/1.0 (existing-house probe)",
          }),
        } as Parameters<typeof screen>[2],
      );
      const card = reportCard(result, defaultNamedRubric());
      const th = result.near?.trailheads ?? [];
      say(
        `## 010-A-10 graded live, no house mark (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
        "",
        `- Steps: ${[...steps].map(([s, st]) => `${s} ${st}`).join(", ")}`,
        `- Failed: ${JSON.stringify(result.failed)}; no response: ${JSON.stringify(result.noResponse)}`,
        `- Elevation: ${result.demSource ?? "?"} at ${result.demResM ?? "?"} m`,
        `- ${result.acres.toFixed(2)} ac; house sites ${result.sites?.length ?? 0}, benches ${result.benches?.length ?? 0}`,
        `- Trailheads (${result.near?.trailheadCount ?? 0}): ${
          th
            .slice(0, 6)
            .map((t) => `${t.name} (${t.source}, ${t.drive ? `${Math.round(t.drive.min)} min` : "no drive"})`)
            .join("; ") || "none"
        }`,
        "",
        "### The default rubric's card",
        "",
        `- ${card.verdict} · ${card.grade ?? "–"}: ${clip(card.reason, 300)}`,
        ...card.gates.map((g) => `- Must ${g.label}: ${g.status}: ${clip(g.reason, 200)}`),
        ...card.rows.map((r) => `- ${r.label}: ${r.grade ?? "–"}: ${clip(r.detail, 160)}`),
        "",
      );
    } else say("- No parcel found: the grade is skipped.", "");
    write();

    // ---------- The proposed rule: a parking lot by a hiking route, or by a named path an agency runs ----------
    const bb = `${GAP_BOX.s},${GAP_BOX.w},${GAP_BOX.n},${GAP_BOX.e}`;
    const rule = await overpass(
      `[out:json][timeout:120][bbox:${bb}];` +
        `(rel["route"~"^(hiking|foot)$"];)->.hr;way(r.hr)->.rw;` +
        `way["highway"~"^(path|footway)$"]["name"]["operator"~"forest|park|conservation|wildlife",i]->.aw;` +
        `(.rw;.aw;)->.tw;node(w.tw)->.tn;` +
        `nwr["amenity"="parking"](around.tn:${RULE_M})->.p;` +
        `foreach.p(out center tags;(way.tw(around:${RULE_M});)->.near;rel(bw.near)["route"~"^(hiking|foot)$"]->.nr;.nr out tags;.near out tags 3;);`,
    );
    const rel = (rule?.elements as OsmEl[] | undefined) ?? [];
    say(
      `## The rule at Hayters Gap: parking within ${RULE_M} m of a hiking route or an agency's named path`,
      "",
      `Box ${bb}: ${rel.filter((e) => e.tags?.amenity === "parking").length} lots.`,
      "",
      ...rel.map((e) => {
        const c = e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon! } : null);
        return `${e.tags?.amenity === "parking" ? "- " : "  - "}${e.type}/${e.id} ${c ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : ""}: ${clip(JSON.stringify(e.tags), 200)}`;
      }),
      "",
    );
    write();
    expect(out.length).toBeGreaterThan(4);
  }, 1_800_000);
});
