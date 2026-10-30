/**
 * Tennessee's own-records counties (the parcels mission, docs/plans/tn-counties.md §0): what Hamilton's and Knox's
 * public parcel services are, live, on the runners (tn-counties.yml; this repo's cloud sessions can't reach them).
 *
 *   pnpm exec vitest run test/tools/tn-counties-probe.test.ts --mode tn-counties-probe
 *
 * Round 1 listed the service directories, the parcel layers' fields, limits and CORS, and the terms pages (its findings
 * are the plan's §0). Round 2 compared Live_Parcels' two "Parcels" layers and found the Worley Road and Three Gorges
 * lots. Round 3, kept here, samples each PARCEL_TYP that isn't a plain parcel. Read-only; nothing is written to the repo.
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

describe.runIf(import.meta.env.MODE === "tn-counties-probe")("Tennessee county parcel services", () => {
  it("probes Hamilton's parcel types, round 3", async () => {
    const l = `${HAMILTON}/0`;
    for (const t of [5, 6, 10, 11, 12, 13]) {
      const j = await query(l, {
        where: `PARCEL_TYP=${t}`,
        outFields: SHOWN_FIELDS,
        returnGeometry: "false",
        resultRecordCount: "4",
      });
      const feats = (j?.features as { attributes: Record<string, unknown> }[] | undefined) ?? [];
      say(`## PARCEL_TYP ${t}`, "", ...feats.map((f) => `- ${clip(JSON.stringify(f.attributes), 400)}`), "");
    }
    // Several polygons for one GISLINK among regular parcels (the state layer's two-part tracts)?
    const multi = await query(l, {
      where: "PARCEL_TYP=1 AND GISLINK IN ('033048 04501','033039 01800','033039 02000')",
      outFields: "OBJECTID,GISLINK,PARCEL_TYP,CALCACRES",
      returnGeometry: "false",
    });
    say("## Polygons per GISLINK (three samples)", "", clip(JSON.stringify(multi?.features), 600), "");
    mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
    writeFileSync(join(process.cwd(), "test-results", "tn-counties-probe.md"), out.join("\n") + "\n");
    expect(out.length).toBeGreaterThan(2);
  }, 600_000);
});
