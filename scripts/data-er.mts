/**
 * Regenerates lib/screen/data/er.json: the hospitals with an emergency department that parcel screens and the area
 * profiler time drives to (step 13 §3.4; one list for both since the ER follow-up, phase-0.md §9.69). From CMS Hospital General Information (a U.S.
 * government work), which records whether each Medicare-registered hospital offers emergency services:
 * - kept: Emergency Services "Yes", in the states the parcel screen's extent touches, and not a psychiatric, children's,
 *   Veterans Administration or Department of Defense hospital (their emergency rooms aren't open to everyone);
 * - placed: CMS gives addresses only, so they're geocoded with the Census Geocoder's batch service (public domain); an
 *   address it can't match is placed from the OSM snapshot (lib/screen/data/hospitals.json) by name, else listed
 *   under `unplaced` and left out;
 * - within SCREEN_BOX, the parcel screen's extent (the OSM snapshot's: VA, NC and TN widened by near.hospitalKm).
 *
 *   pnpm data:er
 *
 * data.cms.gov refuses scripted requests (Akamai answers "Access Denied" to Node's fetch and to curl), so the file is
 * read through a headless Chromium (Playwright, already a dev dependency). Run by hand and by the monthly refresh; a
 * change is a numbers change for parcel screens (regenerate expected.json and declare it).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
export const OUT = join(ROOT, "lib", "screen", "data", "er.json");
const OSM = join(ROOT, "lib", "screen", "data", "hospitals.json");
const UA = "parcelscreen-data/1 (ER snapshot for the area catalog; https://github.com/zgrether/parcelscreen)";
const META = "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/xubh-q36u";
const GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";

/**
 * The parcel screen's extent, [south, west, north, east]: the OSM snapshot's box (scripts/data-hospitals.mts, VA, NC and
 * TN widened by near.hospitalKm; a test holds it to hospitals.json's source line). It holds the area catalog's too.
 */
export const SCREEN_BOX = [33.3, -90.959, 40.01, -74.591] as const;
/** Every state SCREEN_BOX touches. */
const STATES = new Set("VA NC TN KY WV SC GA AL MS AR MO IL IN OH PA MD DE NJ DC".split(" "));
const NOT_OPEN_TO_ALL = /psychiatric|childrens|veterans|department of defense/i;

/** A CSV line's fields, with quoted fields and doubled quotes. */
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// 1. CMS's file, through a browser.
const browser = await chromium.launch();
const page = await browser.newPage();
type Meta = { modified: string; distribution: { downloadURL: string }[] };
/** CMS's dataset record; Akamai sometimes answers a first visit with a page of its own, so it's tried three times. */
async function readMeta(): Promise<Meta> {
  for (let attempt = 1; ; attempt++) {
    await page.goto(META);
    const text = await page.locator("body").innerText();
    try {
      const meta = JSON.parse(text) as Meta;
      if (meta.distribution?.[0]?.downloadURL) return meta;
    } catch {
      // not JSON: Akamai's page
    }
    if (attempt === 3) throw new Error(`CMS's dataset record didn't load: ${text.slice(0, 200)}`);
    await page.waitForTimeout(5000 * attempt);
  }
}
const meta = await readMeta();
const csv = await page.evaluate(async (u) => (await fetch(u)).text(), meta.distribution[0]!.downloadURL);
await browser.close();

const [head, ...lines] = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
const h = fields(head!);
const col = (name: string) => {
  const i = h.indexOf(name);
  if (i < 0) throw new Error(`CMS's file has no "${name}" column`);
  return i;
};
const [ID, NAME, ADDR, CITY, STATE, ZIP, TYPE, ER] = [
  "Facility ID",
  "Facility Name",
  "Address",
  "City/Town",
  "State",
  "ZIP Code",
  "Hospital Type",
  "Emergency Services",
].map(col) as number[];
const kept = lines
  .map(fields)
  .filter((v) => STATES.has(v[STATE!]!) && v[ER!] === "Yes" && !NOT_OPEN_TO_ALL.test(v[TYPE!]!));
console.log(`CMS ${meta.modified}: ${kept.length} hospitals with an ER in ${[...STATES].join(", ")}`);

// 2. The Census Geocoder, one batch (its limit is 10,000).
const batch = kept.map((v) =>
  [v[ID!], v[ADDR!], v[CITY!], v[STATE!], v[ZIP!]].map((x) => `"${x}"`).join(","),
);
const form = new FormData();
form.append("addressFile", new Blob([batch.join("\n")], { type: "text/csv" }), "er.csv");
form.append("benchmark", "Public_AR_Current");
const geo = await fetch(GEOCODER, { method: "POST", body: form, headers: { "User-Agent": UA } });
if (!geo.ok) throw new Error(`the Census Geocoder answered ${geo.status}`);
const placed = new Map<string, [number, number]>();
for (const line of (await geo.text()).split(/\r?\n/)) {
  const v = fields(line);
  if (v[2] !== "Match" || !v[5]) continue;
  const [lon, lat] = v[5].split(",").map(Number);
  placed.set(v[0]!, [+lat!.toFixed(5), +lon!.toFixed(5)]);
}

// 3. What the geocoder couldn't match ("One Medical Park Blvd"), by name from the OSM snapshot: every word of the OSM
// name (less the generic ones) is in CMS's, and the OSM point is within NEAR_ZIP_KM of the address's ZIP area.
const osm = (
  JSON.parse(readFileSync(OSM, "utf8")) as {
    hospitals: { name?: string; lat: number; lon: number; tags?: Record<string, string> }[];
  }
).hospitals;
const NEAR_ZIP_KM = 20;
const ZCTA =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/query";
/** The centre of a ZIP code's area (the Census Bureau's ZCTA), or null. */
async function zipCentre(zip: string): Promise<[number, number] | null> {
  const q = `${ZCTA}?where=${encodeURIComponent(`ZCTA5='${zip.slice(0, 5)}'`)}&outFields=CENTLAT,CENTLON&returnGeometry=false&f=json`;
  const r = await fetch(q, { headers: { "User-Agent": UA } });
  const a = r.ok
    ? ((await r.json()) as { features?: { attributes: Record<string, string> }[] }).features?.[0]
    : null;
  return a ? [Number(a.attributes.CENTLAT), Number(a.attributes.CENTLON)] : null;
}
const km = ([a, b]: [number, number], [c, d]: [number, number]) => {
  const dy = (c - a) * 111.2;
  const dx = (d - b) * 111.32 * Math.cos((a * Math.PI) / 180);
  return Math.hypot(dx, dy);
};
const bare = (x: string) =>
  x
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(hospital|medical|center|centre|regional|health|inc|the|of)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Words too common to say two names are one hospital: places, directions and corporate words. */
const COMMON = new Set(
  "north south east west carolina virginia tennessee kentucky georgia county community saint st inc llc system campus university hospitals and".split(
    " ",
  ),
);
const osmWords = (o: { name?: string }) =>
  o.name ? bare(o.name.split(";").at(-1)!).split(" ").filter(Boolean) : [];
/**
 * CMS hospitals neither the geocoder nor a name match can place, placed by hand from the OSM snapshot (checked
 * 2026-10-23): CMS's name, city and state → [lat, lon]. Both have a ZIP with no Census ZIP area to match near (27157 is
 * the hospital's own; 42135 is post-office boxes). Only those within reach of a VA, NC or TN parcel.
 */
const BY_HAND: Record<string, [number, number]> = {
  // OSM's "Wake Forest Baptist Medical Center".
  "NORTH CAROLINA BAPTIST HOSPITAL, WINSTON-SALEM, NC": [36.08967, -80.26763],
  // OSM's "The Medical Center at Franklin", 8 km north of the Tennessee line.
  "THE MEDICAL CENTER AT FRANKLIN, FRANKLIN, KY": [36.6999, -86.57696],
};
const unplaced: string[] = [];
const loose: string[] = [];
for (const v of kept) {
  if (placed.has(v[ID!]!)) continue;
  const want = new Set(bare(v[NAME!]!).split(" "));
  const zip = await zipCentre(v[ZIP!]!);
  const near = zip ? osm.filter((o) => km(zip, [o.lat, o.lon]) <= NEAR_ZIP_KM) : [];
  let hit = near.find((o) => {
    const words = osmWords(o);
    return words.length >= 1 && words.every((x) => want.has(x));
  });
  // Else the OSM hospital near the ZIP area sharing distinctive words with CMS's name ("Southside Community
  // Hospital" is OSM's "Centra Southside Community Hospital"): two words, or one that no other hospital near shares.
  if (!hit && zip) {
    const scored = near
      .map((o) => ({ o, n: osmWords(o).filter((x) => want.has(x) && !COMMON.has(x) && x.length > 2).length }))
      .filter((x) => x.n >= 1)
      .sort((a, b) => b.n - a.n || km(zip, [a.o.lat, a.o.lon]) - km(zip, [b.o.lat, b.o.lon]));
    const best = scored[0];
    if (best && (best.n >= 2 || scored.length === 1)) {
      hit = best.o;
      loose.push(`${v[NAME!]}, ${v[CITY!]}, ${v[STATE!]} → ${hit.name}`);
    }
  }
  const key = `${v[NAME!]}, ${v[CITY!]}, ${v[STATE!]}`;
  if (hit) placed.set(v[ID!]!, [+hit.lat.toFixed(5), +hit.lon.toFixed(5)]);
  else if (BY_HAND[key]) placed.set(v[ID!]!, BY_HAND[key]);
  else unplaced.push(key);
}

// 4. Within the parcel screen's extent only.
const [s, w, n, e] = SCREEN_BOX;
const inBox = ([lat, lon]: [number, number], m: number) =>
  lat > s - m && lat < n + m && lon > w - m && lon < e + m;
const near = (ll: [number, number]) => inBox(ll, 0);
/** Initialisms in CMS's names, kept in capitals. */
const INITIALS = new Set(
  "arh hca musc unc uva vcu wvu uab ssm hshs ngmc ecu upmc amc chi osf ut va uk ii iii iv cmc ttuhsc".split(
    " ",
  ),
);
const SMALL = new Set("of and at the an for in on by".split(" "));
/** Health systems whose names CMS runs together in capitals: "LEWISGALE" is LewisGale. */
const BRANDS: Record<string, string> = {
  lewisgale: "LewisGale",
  tidalhealth: "TidalHealth",
  medstar: "MedStar",
  wellstar: "WellStar",
  adventhealth: "AdventHealth",
  firsthealth: "FirstHealth",
};
/**
 * CMS's capitals as a name: "SAINT JOSEPH'S HOSPITAL OF ATLANTA, INC" → "Saint Joseph's Hospital of Atlanta". Small
 * words lower-case after the first, initialisms in capitals, and the company's "Inc" or "LLC" left off.
 */
const title = (x: string) =>
  x
    .replace(/,?\s+(inc|llc)\.?$/i, "")
    .toLowerCase()
    .split(/(\s+|-|\/|\()/)
    .map((w, i) =>
      INITIALS.has(w)
        ? w.toUpperCase()
        : (BRANDS[w] ?? (i > 0 && SMALL.has(w) ? w : w.replace(/^[a-z]/, (c) => c.toUpperCase()))),
    )
    .join("")
    .replace(/^Uofl\b/, "UofL");
const hospitals = kept
  .filter((v) => placed.has(v[ID!]!) && near(placed.get(v[ID!]!)!))
  .map((v) => ({
    id: v[ID!]!,
    name: title(v[NAME!]!),
    city: title(v[CITY!]!),
    state: v[STATE!]!,
    type: v[TYPE!]!,
    ll: placed.get(v[ID!]!)!,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

// 5. OSM's emergency=yes hospitals in the extent that no CMS entry lies within OSM_MATCH_KM of: CMS lags a reopening
// (Stuart Community, January 2026). Listed for review in the monthly refresh PR (lib/areas/data.ts ersToConfirm), never
// timed: one confirmed goes into lib/screen/data/er-additions.json.
const OSM_MATCH_KM = 1.5;
const osmOnly = osm
  .filter((o) => o.tags?.emergency === "yes" && near([o.lat, o.lon]))
  .filter((o) => !hospitals.some((h) => km(h.ll, [o.lat, o.lon]) <= OSM_MATCH_KM))
  .map((o) => ({ name: o.name?.split(";").at(-1) ?? "unnamed", ll: [+o.lat.toFixed(5), +o.lon.toFixed(5)] }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "CMS Hospital General Information (Emergency Services = Yes), geocoded by the Census Geocoder",
      released: meta.modified,
      checked: new Date().toLocaleDateString("en-CA"),
      hospitals,
      unplaced: unplaced.sort(),
      osmOnly,
    },
    null,
    1,
  ) + "\n",
);
console.log(
  `${OUT}: ${hospitals.length} in the parcel screen's extent; ${unplaced.length} unplaced; ${osmOnly.length} OSM-only`,
);
for (const l of loose) console.log(`  placed by a shared word: ${l}`);
for (const u of unplaced) console.log(`  unplaced: ${u}`);
