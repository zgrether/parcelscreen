/**
 * Tennessee's own-records counties (the parcels mission, docs/plans/tn-counties.md §0): what Hamilton's and Knox's
 * public parcel services are, live, on the runners (tn-counties.yml; this repo's cloud sessions can't reach them).
 *
 *   pnpm exec vitest run test/tools/tn-counties-probe.test.ts --mode tn-counties-probe
 *
 * Round 1 listed the service directories, the parcel layers' fields, limits and CORS, and the terms pages (its findings
 * are the plan's §0). Round 2 compares Live_Parcels' two "Parcels" layers and finds the Worley Road and Three Gorges
 * lots in the county's own data, with a point query as the app asks it. Read-only; nothing is written to the repo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const UA = "parcelscreen-data/1 (Tennessee county parcels probe; https://github.com/zgrether/parcelscreen)";
const ORIGIN = "https://parcelscreen.vercel.app";

const out: string[] = ["# Tennessee county parcel services (probe)", ""];
const say = (...l: string[]) => {
  out.push(...l);
  console.log(l.join("\n"));
};

async function get(url: string): Promise<{ status: number; acao: string | null; text: string }> {
  try {
    const r = await live()(url, { headers: { "User-Agent": UA, Origin: ORIGIN } });
    return { status: r.status, acao: r.headers.get("access-control-allow-origin"), text: await r.text() };
  } catch (e) {
    return { status: 0, acao: null, text: String(e) };
  }
}
const json = (t: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const clip = (s: unknown, n = 400) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .slice(0, n);

/** Hamilton's parcel layers (round 2: the first round found Live_Parcels' two "Parcels" layers). */
const HAMILTON = "https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Parcels/MapServer";
/** The fields a sample prints (no owner or mailing fields). */
const SHOWN_FIELDS =
  "OBJECTID,PARCEL_TYP,GISLINK,MAP,GROUP_,PARCEL,TAX_MAP_NO,STNUM,STNAME,ADDRESS,LEGALDESC1,CALCACRES,RecordsOnl";

async function query(layer: string, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const q = new URLSearchParams({ f: "json", ...params });
  return json((await get(`${layer}/query?${q}`)).text);
}
const centre = (g: { rings?: number[][][] } | undefined): string => {
  const ring = g?.rings?.[0] ?? [];
  if (!ring.length) return "?";
  const [x, y] = ring.reduce(([a, b], [c, d]) => [a! + c!, b! + d!], [0, 0]);
  return `${(y! / ring.length).toFixed(5)}, ${(x! / ring.length).toFixed(5)}`;
};

describe.runIf(import.meta.env.MODE === "tn-counties-probe")("Tennessee county parcel services", () => {
  it("probes Hamilton's parcel layers, round 2", async () => {
    for (const id of [0, 1]) {
      const l = `${HAMILTON}/${id}`;
      const meta = json((await get(`${l}?f=pjson`)).text);
      const count = await query(l, { where: "1=1", returnCountOnly: "true" });
      const types = await query(l, {
        where: "1=1",
        groupByFieldsForStatistics: "PARCEL_TYP",
        outStatistics: JSON.stringify([
          { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
        ]),
      });
      say(
        `## Layer ${id}`,
        "",
        `- minScale ${String(meta?.minScale)}, maxScale ${String(meta?.maxScale)}, defaultVisibility ${String(meta?.defaultVisibility)}, definitionExpression ${clip(meta?.definitionExpression, 120)}`,
        `- count ${String(count?.count)}`,
        `- PARCEL_TYP: ${clip(JSON.stringify((types?.features as { attributes: unknown }[] | undefined)?.map((f) => f.attributes)), 600)}`,
        "",
      );
    }
    const l = `${HAMILTON}/0`;
    for (const [label, where] of [
      ["Worley Road", "UPPER(STNAME) LIKE '%WORLEY%'"],
      ["Three Gorges (legal description)", "UPPER(LEGALDESC1) LIKE '%GORGE%'"],
    ] as const) {
      const j = await query(l, {
        where,
        outFields: SHOWN_FIELDS,
        returnGeometry: "true",
        outSR: "4326",
        resultRecordCount: "25",
      });
      type Feat = { attributes: Record<string, unknown>; geometry?: { rings?: number[][][] } };
      const feats = (j?.features as Feat[] | undefined) ?? [];
      say(
        `## ${label}: ${feats.length} parcels${j?.error ? `, error ${clip(JSON.stringify(j.error))}` : ""}`,
        "",
      );
      for (const f of feats) say(`- at ${centre(f.geometry)}: ${clip(JSON.stringify(f.attributes), 500)}`);
      say("");
    }
    // A point query at the first Three Gorges lot, as the app asks it (f=geojson).
    const first = await query(l, {
      where: "UPPER(LEGALDESC1) LIKE '%GORGE%'",
      outFields: "OBJECTID",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "1",
    });
    const g = (first?.features as { geometry?: { rings?: number[][][] } }[] | undefined)?.[0]?.geometry;
    if (g) {
      const [lat, lon] = centre(g).split(", ").map(Number);
      const q = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: SHOWN_FIELDS,
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson",
      });
      const r = await get(`${l}/query?${q}`);
      say(
        `## Point query at ${lat}, ${lon} (f=geojson)`,
        "",
        `- HTTP ${r.status}, ACAO ${r.acao ?? "(none)"}: ${clip(r.text, 700)}`,
        "",
      );
    }
    mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
    writeFileSync(join(process.cwd(), "test-results", "tn-counties-probe.md"), out.join("\n") + "\n");
    expect(out.length).toBeGreaterThan(2);
  }, 600_000);
});
