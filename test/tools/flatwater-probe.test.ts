/**
 * A read-only probe for #348's flatwater spot-check (the places workflow's `probe` job): what NHD has at the New River's
 * dammed pools and at a few launches the bake called river that are named for a lake; what Recreation.gov's public
 * export (RIDB, downloaded by the job to tmp/ridb/) has for the Corps' and TVA's launches near the region's lakes; and
 * what ArcGIS Online lists for TVA's boat ramps. It prints; it writes nothing.
 *
 *   pnpm exec vitest run test/tools/flatwater-probe.test.ts --mode flatwater-probe
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { point, pointToPolygonDistance } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { describe, it } from "vitest";
import { createHttpClient } from "@/lib/http";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

/** Launches to test, [lat, lon]: the New River's pools, and launches the bake called river that are named for a lake. */
const SPOTS: [string, number, number][] = [
  ["New River access (Byllesby pool?)", 36.773668, -80.936668],
  ["Fries dam pool, above the dam", 36.7175, -80.9775],
  ["Buck dam pool", 36.7985, -80.9365],
  ["Claytor Lake (control)", 37.0577, -80.6233],
  ["Panel Branch Lake Access (Fontana)", 35.445725, -83.815798],
  ["Lewellyn Branch Lake Access (Fontana)", 35.451003, -83.819263],
  ["Old 228 Fontana Lake Boat Ramp", 35.430559, -83.486993],
  ["Boat launch by W Kerr Scott dam", 36.130217, -81.229201],
  ["Suck Creek Boat Ramp (TN River)", 35.109761, -85.365606],
  ["Ross's Landing (TN River)", 35.055105, -85.318847],
];

/** The lakes whose public launches the check asks about, [lat, lon, km]. */
const LAKES: [string, number, number, number][] = [
  ["Philpott Lake", 36.79, -80.06, 15],
  ["W. Kerr Scott Reservoir", 36.12, -81.26, 12],
  ["Smith Mountain Lake", 37.08, -79.62, 25],
  ["Lake Moomaw", 37.96, -79.96, 15],
  ["John W. Flannagan Reservoir", 37.23, -82.34, 12],
  ["North Fork of Pound Lake", 37.12, -82.63, 8],
  ["South Holston Lake", 36.56, -82.02, 20],
  ["Boone Lake", 36.44, -82.42, 15],
  ["Watauga Lake", 36.33, -82.05, 15],
  ["Fontana Lake", 35.45, -83.65, 30],
];

const km = (a: [number, number], b: [number, number]): number => {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

describe.runIf(import.meta.env.MODE === "flatwater-probe")("the flatwater probe", () => {
  const http = createHttpClient({
    env: "node",
    fetchImpl: live(),
    userAgent: "parcelscreen-data/1 (flatwater probe; https://github.com/zgrether/parcelscreen)",
  });
  const getJson = async (url: string): Promise<unknown> => {
    const r = await http.fetch(url, { timeoutMs: 120_000 });
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
    return r.json();
  };

  it("NHD at the pools", { timeout: 1_800_000 }, async () => {
    const base = DEFAULT_ENDPOINTS.nhdWaterbody.replace(/\/\d+$/, "");
    const info = (await getJson(`${base}?f=json`)) as { layers?: { id: number; name: string }[] };
    console.log("NHD layers:", JSON.stringify(info.layers?.map((l) => `${l.id} ${l.name}`)));
    const polyLayers = (info.layers ?? []).filter((l) => /waterbody|area/i.test(l.name));
    for (const [name, lat, lon] of SPOTS) {
      console.log(`\n## ${name} (${lat}, ${lon})`);
      for (const layer of polyLayers) {
        const q = new URLSearchParams({
          geometry: `${lon},${lat}`,
          geometryType: "esriGeometryPoint",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          distance: "1500",
          units: "esriSRUnit_Meter",
          outFields: "*",
          returnGeometry: "true",
          outSR: "4326",
          maxAllowableOffset: "0.0001",
          f: "geojson",
        });
        try {
          const j = (await getJson(`${base}/${layer.id}/query?${q}`)) as {
            features?: { properties: Record<string, unknown>; geometry: Polygon | MultiPolygon | null }[];
          };
          for (const f of j.features ?? []) {
            const p = f.properties;
            const m =
              f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
                ? Math.max(0, pointToPolygonDistance(point([lon, lat]), f.geometry, { units: "meters" }))
                : NaN;
            console.log(
              `  layer ${layer.id} ${layer.name}: ${String(p.GNIS_NAME ?? p.gnis_name ?? "")} FTYPE ${String(p.FTYPE ?? p.ftype)} FCODE ${String(p.FCODE ?? p.fcode)} ${Number(p.AREASQKM ?? p.areasqkm ?? 0).toFixed(3)} km² at ${Math.round(m)} m`,
            );
          }
        } catch (e) {
          console.log(`  layer ${layer.id} ${layer.name}: ${String(e)}`);
        }
      }
    }
  });

  it("RIDB: the Corps' and TVA's launches near the lakes", { timeout: 600_000 }, () => {
    const dir = join(process.cwd(), "tmp", "ridb");
    if (!existsSync(dir)) return console.log("No tmp/ridb: the download failed.");
    const files = readdirSync(dir, { recursive: true }).map(String);
    console.log("RIDB files:", files.join(", "));
    const load = (re: RegExp): Record<string, unknown>[] => {
      const f = files.find((x) => re.test(x));
      if (!f) return [];
      const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown;
      const rows = Array.isArray(j) ? j : ((j as { RECDATA?: unknown[] }).RECDATA ?? []);
      console.log(`${f}: ${rows.length} rows; first: ${JSON.stringify(rows[0]).slice(0, 600)}`);
      return rows as Record<string, unknown>[];
    };
    const orgs = load(/^Organizations/i);
    const ours = orgs.filter((o) => /USACE|Corps of Engineers|TVA|Tennessee Valley/i.test(JSON.stringify(o)));
    console.log("Orgs:", JSON.stringify(ours).slice(0, 2000));
    const orgIds = new Set(ours.map((o) => String(o.OrgID)));
    const facilities = load(/^Facilities_API/i);
    const recAreas = load(/^RecAreas_API/i);
    const activities = load(/^Activities_API/i);
    const entityActivities = load(/^EntityActivities/i);
    const boating = new Set(
      activities.filter((a) => /boat/i.test(String(a.ActivityName))).map((a) => String(a.ActivityID)),
    );
    const boatingEntities = new Set(
      entityActivities.filter((e) => boating.has(String(e.ActivityID))).map((e) => String(e.EntityID)),
    );
    const areaOrg = new Map(recAreas.map((r) => [String(r.RecAreaID), String(r.ParentOrgID)]));
    const rows = [
      ...facilities.map((f) => ({
        kind: "facility",
        id: String(f.FacilityID),
        name: String(f.FacilityName),
        type: String(f.FacilityTypeDescription ?? ""),
        org: String(f.ParentOrgID ?? areaOrg.get(String(f.ParentRecAreaID)) ?? ""),
        ll: [Number(f.FacilityLatitude), Number(f.FacilityLongitude)] as [number, number],
      })),
      ...recAreas.map((r) => ({
        kind: "recarea",
        id: String(r.RecAreaID),
        name: String(r.RecAreaName),
        type: "",
        org: String(r.ParentOrgID ?? ""),
        ll: [Number(r.RecAreaLatitude), Number(r.RecAreaLongitude)] as [number, number],
      })),
    ];
    for (const [lake, lat, lon, r] of LAKES) {
      const near = rows
        .filter((x) => x.ll[0] && x.ll[1] && km([lat, lon], x.ll) <= r)
        .sort((a, b) => km([lat, lon], a.ll) - km([lat, lon], b.ll));
      console.log(`\n## ${lake}: ${near.length} RIDB rows within ${r} km`);
      for (const x of near.slice(0, 40))
        console.log(
          `  ${km([lat, lon], x.ll).toFixed(1)} km ${x.kind} ${x.id} org ${x.org}${orgIds.has(x.org) ? " (ours)" : ""} ${boatingEntities.has(x.id) ? "BOATING " : ""}${x.type} | ${x.name} ${x.ll.join(",")}`,
        );
    }
  });

  it("ArcGIS Online: TVA's and the Corps' boat ramps", { timeout: 300_000 }, async () => {
    for (const q of [
      "TVA boat ramps",
      "TVA recreation areas",
      "USACE recreation areas boat ramp",
      "Corps lakes recreation",
    ]) {
      try {
        const j = (await getJson(
          `https://www.arcgis.com/sharing/rest/search?${new URLSearchParams({ q, f: "json", num: "15" })}`,
        )) as {
          results?: { title: string; owner: string; type: string; url?: string; licenseInfo?: string }[];
        };
        console.log(`\n## "${q}"`);
        for (const r of j.results ?? [])
          console.log(
            `  ${r.type} | ${r.title} | ${r.owner} | ${r.url ?? ""} | ${String(r.licenseInfo ?? "").slice(0, 120)}`,
          );
      } catch (e) {
        console.log(`"${q}": ${String(e)}`);
      }
    }
  });
});
