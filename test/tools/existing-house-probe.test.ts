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
const LANDMARKS = DEFAULT_ENDPOINTS.stateParks.find((u) => u.includes("vginmaps"))!;
/** Around Hayters Gap, where VA-80 crosses Clinch Mountain: generous, since the gap's exact point isn't known here. */
const GAP_BOX = { s: 36.74, w: -82.1, n: 36.9, e: -81.85 };
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
    say(`- Overpass ${new URL(url).host}: HTTP ${r.status} ${clip(r.text, 120)}`);
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
  it("010-A-10, live; and the trailhead at Hayters Gap", async () => {
    // ---------- 010-A-10 ----------
    const where = "PTM_ID LIKE '010%A%10' AND (LOCALITY LIKE 'Washington%' OR FIPS LIKE '%191')";
    const pq = new URLSearchParams({
      f: "geojson",
      where,
      outFields: PARCEL_FIELDS,
      returnGeometry: "true",
      outSR: "4326",
    });
    const pr = await get(`${VA_PARCELS}/query?${pq}`);
    const fc = json(pr.text) as { features?: Feature<Polygon>[] } | null;
    const feats = fc?.features ?? [];
    say(
      "## Parcel 010-A-10 (VGIN parcels)",
      "",
      `- HTTP ${pr.status}; ${feats.length} match(es) for \`${where}\``,
      ...feats.map((f) => `- ${clip(JSON.stringify(f.properties), 200)}; ${f.geometry?.type}`),
      "",
    );
    const parcel =
      feats.find((f) => String(f.properties?.PTM_ID).replace(/\s+/g, "") === "010-A-10") ?? feats[0];

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

    // ---------- OpenStreetMap around Hayters Gap ----------
    const bb = `${GAP_BOX.s},${GAP_BOX.w},${GAP_BOX.n},${GAP_BOX.e}`;
    const osm = await overpass(
      `[out:json][timeout:60];(` +
        `nwr["highway"="trailhead"](${bb});nwr["information"="trailhead"](${bb});` +
        `nwr["amenity"="parking"](${bb});` +
        `nwr["name"~"Brumley|Hayters|Channels",i](${bb});` +
        `relation["route"~"hiking|foot"](${bb});` +
        `nwr["boundary"="protected_area"](${bb});nwr["leisure"="nature_reserve"](${bb});` +
        `);out center tags;`,
    );
    const els = ((osm?.elements as OsmEl[] | undefined) ?? []).slice(0, 80);
    say(
      "## OpenStreetMap around Hayters Gap",
      "",
      `Box ${bb}: ${els.length} elements (trailheads, parking, named Brumley/Hayters/Channels, hiking routes, protected areas).`,
      "",
      ...els.map((e) => {
        const c = e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon! } : null);
        return `- ${e.type}/${e.id} ${c ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : ""}: ${clip(JSON.stringify(e.tags), 260)}`;
      }),
      "",
    );
    // A hiking route's members: its trailhead or parking nodes, if it has any.
    for (const rel of els
      .filter((e) => e.type === "relation" && /hiking|foot/.test(e.tags?.route ?? ""))
      .slice(0, 3)) {
      const m = await overpass(
        `[out:json][timeout:60];relation(${rel.id});(node(r);way(r)["highway"];);out tags center 40;`,
      );
      const mem = (m?.elements as OsmEl[] | undefined) ?? [];
      const roles = (rel.members ?? []).reduce<Record<string, number>>(
        (a, x) => ((a[x.role || "(none)"] = (a[x.role || "(none)"] ?? 0) + 1), a),
        {},
      );
      say(
        `### relation/${rel.id} ${rel.tags?.name ?? ""}: member roles ${JSON.stringify(roles)}`,
        "",
        ...mem
          .filter((e) => e.type === "node" || /trailhead|parking/.test(JSON.stringify(e.tags ?? {})))
          .slice(0, 15)
          .map((e) => `- ${e.type}/${e.id}: ${clip(JSON.stringify(e.tags), 200)}`),
        "",
      );
    }
    write();

    // ---------- VGIN's landmarks ----------
    const types = json(
      (
        await get(
          `${LANDMARKS}/query?${new URLSearchParams({
            f: "json",
            where: "1=1",
            outFields: "PlaceType",
            returnDistinctValues: "true",
            returnGeometry: "false",
          })}`,
        )
      ).text,
    );
    const near = json(
      (
        await get(
          `${LANDMARKS}/query?${new URLSearchParams({
            f: "json",
            where: "1=1",
            geometry: `${GAP_BOX.w},${GAP_BOX.s},${GAP_BOX.e},${GAP_BOX.n}`,
            geometryType: "esriGeometryEnvelope",
            inSR: "4326",
            outSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            outFields: "LandmkName,PlaceType",
            returnGeometry: "true",
          })}`,
        )
      ).text,
    );
    const forests = json(
      (
        await get(
          `${LANDMARKS}/query?${new URLSearchParams({
            f: "json",
            where: "UPPER(LandmkName) LIKE '%STATE FOREST%' OR UPPER(LandmkName) LIKE '%TRAILHEAD%'",
            outFields: "LandmkName,PlaceType",
            returnGeometry: "false",
            resultRecordCount: "60",
          })}`,
        )
      ).text,
    );
    say(
      "## VGIN landmarks",
      "",
      `- PlaceTypes: ${clip(JSON.stringify((types?.features as { attributes: unknown }[] | undefined)?.map((f) => f.attributes)), 2000)}`,
      `- Near Hayters Gap: ${clip(JSON.stringify((near?.features as unknown[] | undefined) ?? near), 1500)}`,
      `- Named "state forest" or "trailhead": ${clip(JSON.stringify((forests?.features as { attributes: unknown }[] | undefined)?.map((f) => f.attributes) ?? forests), 2500)}`,
      "",
    );
    write();

    // ---------- Virginia's state forests, published ----------
    for (const q of [
      "Virginia state forest trailhead",
      "Virginia Department of Forestry state forests",
      "Channels State Forest",
    ]) {
      const s = json(
        (
          await get(
            `https://www.arcgis.com/sharing/rest/search?${new URLSearchParams({ f: "json", q, num: "12" })}`,
          )
        ).text,
      );
      const items =
        (s?.results as { title: string; type: string; owner: string; url?: string }[] | undefined) ?? [];
      say(
        `## ArcGIS Online: "${q}"`,
        "",
        ...items.map((i) => `- ${clip(i.title, 100)} (${i.type}, ${i.owner}) ${i.url ?? ""}`),
        "",
      );
    }
    write();
    expect(out.length).toBeGreaterThan(4);
  }, 1_800_000);
});
