/**
 * The grade-distribution study (owner, 2026-10-09; report only, no scoring change): docs/studies/grade-distribution.md.
 *
 *   pnpm study:grades          STAGE=screen (default): picks the parcels and screens them live → tmp/study/
 *   STAGE=report pnpm study:grades                      builds the report from tmp/study/ (offline)
 *
 * Selection, reproducible: in each of six counties, points drawn with a fixed seed (the county's FIPS code)
 * inside the Census TIGER county outline; the county parcel record under each point is kept if it's 5–100
 * acres and new, until four are kept. The three fixtures are screened from their recordings (so they equal
 * expected.json); every other parcel is screened live with today's rules and default settings.
 *
 * Run by hand, never in CI: it reaches the public services (a few hundred requests a parcel).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { area, booleanPointInPolygon, point as turfPoint } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { describe, it } from "vitest";
import { createHttpClient, realClock, type HttpClient } from "@/lib/http";
import { pickParcelAt } from "@/lib/geo/parcels";
import { deriveParcel } from "@/lib/geo/recipe";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { screen } from "@/lib/screen/index";
import { defaultName } from "@/lib/screen/summary";
import type { ScreenResult } from "@/lib/screen/types";
import type { LatLon } from "@/lib/screen/util";
import { FIXTURE_SLUGS, loadFixture } from "../support/fixtures";
import { runFixture } from "../support/scenarios";
import { writeReport } from "./gradeStudyDoc";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
export const STUDY_DIR = "tmp/study";
const M2_PER_ACRE = 4046.8564224;

export const COUNTIES = [
  { geoid: "51063", name: "Floyd County, VA" },
  { geoid: "51035", name: "Carroll County, VA" },
  { geoid: "51077", name: "Grayson County, VA" },
  { geoid: "37009", name: "Ashe County, NC" },
  { geoid: "37189", name: "Watauga County, NC" },
  { geoid: "37005", name: "Alleghany County, NC" },
] as const;
const PER_COUNTY = 4;
const MAX_TRIES = 60;
const ACRES = [5, 100] as const;

/** One parcel's soil, beyond what the screen keeps: under site #1, from SDA (for proposing replacements). */
export interface SoilExtra {
  mukey: string | null;
  compname: string | null;
  comppct: number | null;
  slopeR: number | null;
  brockdepmin: number | null;
  restrictionCm: number | null;
  restrictionKind: string | null;
  ksatMinUmS: number | null;
  septicClass: string | null;
  septicFuzzy: number | null;
  dwobClass: string | null;
  dwobFuzzy: number | null;
}

export interface StudyParcel {
  key: string;
  county: string;
  parcelId: string;
  point: LatLon;
  how: string;
  acres: number;
  multiPart: boolean;
  fixture?: string;
  result: Pick<
    ScreenResult,
    | "acres"
    | "verdict"
    | "sites"
    | "excluded"
    | "sky"
    | "terrain"
    | "soils"
    | "flags"
    | "failed"
    | "drives"
    | "driveway"
  >;
  soilExtra: SoilExtra | null;
  /** NRCS's own limiting features behind #1's septic and dwellings ratings (cointerp, ruledepth 1). */
  reasons?: NrcsReason[];
}

export interface NrcsReason {
  rule: string;
  depth: number;
  reason: string;
  value: number | null;
  cls: string | null;
}

/** The septic and dwellings (no basement) ratings of a component, with the limiting features under them. */
export async function nrcsReasons(http: HttpClient, mukey: string, compname: string): Promise<NrcsReason[]> {
  const query = `SELECT ci.mrulename, ci.ruledepth, ci.rulename, ci.interphr, ci.interphrc
    FROM cointerp ci INNER JOIN component c ON c.cokey = ci.cokey
    WHERE c.mukey = '${mukey}' AND c.compname = '${compname.replace(/'/g, "''")}' AND c.majcompflag = 'Yes'
      AND ci.mrulename IN ('ENG - Septic Tank Absorption Fields', 'ENG - Dwellings W/O Basements')
      AND (ci.ruledepth = 0 OR (ci.ruledepth = 1 AND ci.interphr > 0))
    ORDER BY ci.mrulename, ci.ruledepth, ci.interphr DESC`;
  const r = await http.fetch(DEFAULT_ENDPOINTS.sda, {
    method: "POST",
    body: new URLSearchParams({ query, format: "JSON+COLUMNNAME" }),
    timeoutMs: 60_000,
  });
  if (!r.ok) throw new Error(`SDA ${r.status}`);
  const t = ((await r.json()) as { Table?: unknown[][] }).Table ?? [];
  return t.slice(1).map((row) => ({
    rule: String(row[0]),
    depth: Number(row[1]),
    reason: String(row[2]),
    value: row[3] == null ? null : Number(row[3]),
    cls: row[4] == null ? null : String(row[4]),
  }));
}

/** mulberry32: a small seeded generator, so the draw is the same every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function countyOutline(http: HttpClient, geoid: string): Promise<Feature<Polygon | MultiPolygon>> {
  const q = new URLSearchParams({
    where: `GEOID='${geoid}'`,
    outFields: "NAME,GEOID",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "5",
    f: "geojson",
  });
  const r = await http.fetch(
    `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?${q}`,
    { timeoutMs: 60_000 },
  );
  const j = (await r.json()) as { features: Feature<Polygon | MultiPolygon>[] };
  if (!j.features[0]) throw new Error(`no outline for ${geoid}`);
  return j.features[0];
}

const bbox = (f: Feature<Polygon | MultiPolygon>): [number, number, number, number] => {
  const rings = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let w = 180,
    s = 90,
    e = -180,
    n = -90;
  for (const poly of rings)
    for (const [x, y] of poly[0]!) {
      w = Math.min(w, x!);
      e = Math.max(e, x!);
      s = Math.min(s, y!);
      n = Math.max(n, y!);
    }
  return [w, s, e, n];
};

/** The extra soil properties under a point, from SDA. Null when SDA has nothing there. */
export async function soilUnder(http: HttpClient, ll: LatLon): Promise<SoilExtra | null> {
  const wkt = `point(${ll[1]} ${ll[0]})`;
  const septic = "ENG - Septic Tank Absorption Fields";
  const dwob = "ENG - Dwellings W/O Basements"; // NRCS's own spelling
  const interp = (rule: string, col: "interphr" | "interphrc") =>
    `(SELECT TOP 1 ci.${col} FROM cointerp ci WHERE ci.cokey = c.cokey AND ci.mrulename = '${rule}' AND ci.ruledepth = 0)`;
  const query = `SELECT TOP 1 m.mukey, c.compname, c.comppct_r, c.slope_r, a.brockdepmin,
    (SELECT MIN(cr.resdept_r) FROM corestrictions cr WHERE cr.cokey = c.cokey) AS restr_cm,
    (SELECT TOP 1 cr.reskind FROM corestrictions cr WHERE cr.cokey = c.cokey ORDER BY cr.resdept_r) AS restr_kind,
    (SELECT MIN(ch.ksat_r) FROM chorizon ch WHERE ch.cokey = c.cokey AND ch.hzdept_r < 150) AS ksat_min,
    ${interp(septic, "interphrc")} AS septic_class, ${interp(septic, "interphr")} AS septic_fuzzy,
    ${interp(dwob, "interphrc")} AS dwob_class, ${interp(dwob, "interphr")} AS dwob_fuzzy
    FROM mapunit m
    INNER JOIN component c ON c.mukey = m.mukey AND c.majcompflag = 'Yes'
    LEFT OUTER JOIN muaggatt a ON a.mukey = m.mukey
    WHERE m.mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}'))
    ORDER BY c.comppct_r DESC`;
  const r = await http.fetch(DEFAULT_ENDPOINTS.sda, {
    method: "POST",
    body: new URLSearchParams({ query, format: "JSON+COLUMNNAME" }),
    timeoutMs: 60_000,
  });
  if (!r.ok) throw new Error(`SDA ${r.status}`);
  const t = ((await r.json()) as { Table?: unknown[][] }).Table ?? [];
  if (t.length < 2) return null;
  const row = Object.fromEntries((t[0] as string[]).map((c, i) => [c, t[1]![i]])) as Record<
    string,
    string | null
  >;
  const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));
  return {
    mukey: row.mukey ?? null,
    compname: row.compname ?? null,
    comppct: num(row.comppct_r),
    slopeR: num(row.slope_r),
    brockdepmin: num(row.brockdepmin),
    restrictionCm: num(row.restr_cm),
    restrictionKind: row.restr_kind ?? null,
    ksatMinUmS: num(row.ksat_min),
    septicClass: row.septic_class ?? null,
    septicFuzzy: num(row.septic_fuzzy),
    dwobClass: row.dwob_class ?? null,
    dwobFuzzy: num(row.dwob_fuzzy),
  };
}

const keep = (r: ScreenResult): StudyParcel["result"] => ({
  acres: r.acres,
  verdict: r.verdict,
  sites: r.sites,
  excluded: r.excluded,
  sky: r.sky,
  terrain: r.terrain,
  soils: r.soils,
  flags: r.flags,
  failed: r.failed,
  drives: r.drives,
  driveway: r.driveway,
});

const polyAcres = (g: Feature<Polygon>[]): number => g.reduce((s, p) => s + area(p), 0) / M2_PER_ACRE;

describe.runIf(import.meta.env.MODE === "grade-study" && (process.env.STAGE ?? "screen") === "screen")(
  "grade study: pick and screen",
  () => {
    it(
      "screens the study parcels",
      async () => {
        const live = (globalThis as unknown as Record<symbol, typeof fetch>)[
          Symbol.for("parcelscreen.liveFetch")
        ]!;
        const withUA: typeof fetch = (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set("User-Agent", BROWSER_UA);
          return live(input, { ...init, headers });
        };
        const http = createHttpClient({ env: "node", fetchImpl: withUA, clock: realClock });
        mkdirSync(STUDY_DIR, { recursive: true });
        const outPath = `${STUDY_DIR}/parcels.json`;
        const done: StudyParcel[] = existsSync(outPath)
          ? (JSON.parse(readFileSync(outPath, "utf8")) as StudyParcel[])
          : [];
        const save = () => writeFileSync(outPath, JSON.stringify(done));
        const log: string[] = [];
        const say = (s: string) => {
          log.push(s);
          console.log(s);
          writeFileSync(`${STUDY_DIR}/selection-log.txt`, log.join("\n") + "\n");
        };

        const outlines = new Map<string, Feature<Polygon | MultiPolygon>>();
        for (const c of COUNTIES) outlines.set(c.geoid, await countyOutline(http, c.geoid));
        const countyOf = (ll: LatLon) =>
          COUNTIES.find((c) => booleanPointInPolygon(turfPoint([ll[1], ll[0]]), outlines.get(c.geoid)!))
            ?.name ?? "outside the six counties";

        // The fixtures, from their recordings.
        for (const slug of FIXTURE_SLUGS) {
          if (done.some((p) => p.key === slug)) continue;
          const { point } = loadFixture(slug).input;
          const ll: LatLon = [point.lat, point.lon];
          const { result } = await runFixture(slug);
          done.push({
            key: slug,
            county: countyOf(ll),
            parcelId: slug,
            point: ll,
            how: "a reference fixture (screened from its recordings; equals expected.json)",
            acres: result.acres,
            multiPart: slug.startsWith("grayson"),
            fixture: slug,
            result: keep(result),
            soilExtra: null,
          });
          save();
          say(`fixture ${slug}: ${result.acres.toFixed(2)} ac`);
        }

        for (const c of COUNTIES) {
          const outline = outlines.get(c.geoid)!;
          const [w, s, e, n] = bbox(outline);
          const next = rng(Number(c.geoid));
          let kept = done.filter((p) => !p.fixture && p.county === c.name).length;
          for (let attempt = 1; attempt <= MAX_TRIES && kept < PER_COUNTY; attempt++) {
            const ll: LatLon = [+(s + next() * (n - s)).toFixed(5), +(w + next() * (e - w)).toFixed(5)];
            const key = `${c.geoid}-${attempt}`;
            if (done.some((p) => p.key === key)) {
              continue;
            }
            if (!booleanPointInPolygon(turfPoint([ll[1], ll[0]]), outline)) {
              say(`${c.name} #${attempt} ${ll}: outside the county outline`);
              continue;
            }
            const pick = await pickParcelAt(http, DEFAULT_ENDPOINTS.parcels, ll);
            if (!pick.parcel) {
              say(`${c.name} #${attempt} ${ll}: no parcel (${pick.report.join("; ")})`);
              continue;
            }
            const parts = pick.parcel.parts ?? [pick.parcel.geo];
            const acres = polyAcres(parts);
            const id = defaultName(pick.parcel.props, { point: { ll } } as never);
            if (acres < ACRES[0] || acres > ACRES[1]) {
              say(
                `${c.name} #${attempt} ${ll}: parcel ${id}, ${acres.toFixed(1)} ac, outside ${ACRES[0]}–${ACRES[1]} ac`,
              );
              continue;
            }
            if (done.some((p) => p.parcelId === id && p.county === c.name)) {
              say(`${c.name} #${attempt} ${ll}: parcel ${id} already kept`);
              continue;
            }
            const d = deriveParcel({ parts: [pick.parcel] }, SCREEN_CONSTANTS.combine);
            if (!d.ok) {
              say(`${c.name} #${attempt} ${ll}: parcel ${id}, the recipe failed (${d.reason})`);
              continue;
            }
            const t0 = Date.now();
            const out = await screen(
              {
                polygon: d.record.geo.geometry,
                ...(d.bridgeAcres > 0 ? { ownLand: d.own.geometry } : {}),
                config: DEFAULT_USER_CONFIG,
              },
              undefined,
              { http },
            );
            const best = out.result.sites?.[0];
            let soilExtra: SoilExtra | null = null;
            try {
              soilExtra = best ? await soilUnder(http, best.ll) : null;
            } catch (e) {
              say(`  soil extra failed: ${(e as Error).message}`);
            }
            done.push({
              key,
              county: c.name,
              parcelId: id,
              point: ll,
              how: `random point #${attempt} (seed ${c.geoid}) inside the county; the parcel under it is ${acres.toFixed(1)} ac`,
              acres,
              multiPart: pick.parcel.multiPart,
              result: keep(out.result),
              soilExtra,
            });
            kept++;
            save();
            say(
              `${c.name} #${attempt} ${ll}: KEPT parcel ${id}, ${acres.toFixed(1)} ac; ${out.result.sites?.length ?? 0} sites, #1 ${best ? `${best.grade} ${best.score}` : "none"}; failed [${out.result.failed?.join(", ") ?? ""}]; ${Math.round((Date.now() - t0) / 1000)} s`,
            );
          }
          if (kept < PER_COUNTY) say(`${c.name}: only ${kept} kept in ${MAX_TRIES} tries`);
        }

        // Soil extras for the fixtures' #1 sites too (live SDA), and NRCS's limiting features for every #1.
        for (const p of done.filter((x) => x.fixture && !x.soilExtra)) {
          const best = p.result.sites?.[0];
          if (best) p.soilExtra = await soilUnder(http, best.ll);
        }
        for (const p of done.filter((x) => !x.reasons && x.soilExtra?.mukey && x.soilExtra.compname))
          p.reasons = await nrcsReasons(http, p.soilExtra!.mukey!, p.soilExtra!.compname!);
        save();
      },
      6 * 3600_000,
    );
  },
);

describe.runIf(import.meta.env.MODE === "grade-study" && process.env.STAGE === "report")(
  "grade study: report",
  () => {
    it("writes docs/studies/grade-distribution.md", () => {
      const parcels = JSON.parse(readFileSync(`${STUDY_DIR}/parcels.json`, "utf8")) as StudyParcel[];
      writeReport(parcels, readFileSync(`${STUDY_DIR}/selection-log.txt`, "utf8"));
    });
  },
);
