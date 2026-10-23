/**
 * Builds lib/areas/data/outlines.json (step 13, docs/plans/step-13-area-catalog.md §2.1): each area's outline from
 * its recipe in lib/areas/catalog.ts. Census county subdivisions (TIGERweb, a U.S. government work) are unioned,
 * trimmed by the recipe's `keep`, less its `minus` towns, simplified to about 50 m and rounded to 5 decimals.
 *
 *   pnpm areas:outlines
 *
 * About 60 requests to TIGERweb, run by hand when a recipe changes; never in CI, and not part of the monthly refresh.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  area,
  bbox,
  bboxPolygon,
  circle,
  difference,
  feature,
  featureCollection,
  intersect,
  kinks,
  simplify,
  truncate,
  union,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { AREAS, type AreaDef } from "../lib/areas/catalog.ts";

const ROOT = resolve(import.meta.dirname, "..");
export const OUT = join(ROOT, "lib", "areas", "data", "outlines.json");
const UA = "parcelscreen-data/1 (area outlines, run by hand; https://github.com/zgrether/parcelscreen)";
const TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer";
/** County subdivisions, and incorporated places. */
const LAYER = { cousub: 22, place: 28 } as const;
/** About 50 m. */
const SIMPLIFY_DEG = 0.0005;
const SQ_M_PER_SQ_MI = 2_589_988;

type Shape = Feature<Polygon | MultiPolygon>;

async function query(layer: number, where: string): Promise<Shape[]> {
  const url =
    `${TIGER}/${layer}/query?where=${encodeURIComponent(where)}` +
    "&outFields=NAME&returnGeometry=true&outSR=4326&f=geojson";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`TIGERweb answered ${res.status} for ${where}`);
  const body = (await res.json()) as { features?: Shape[]; exceededTransferLimit?: boolean };
  if (!body.features) throw new Error(`TIGERweb: no features for ${where}`);
  if (body.exceededTransferLimit) throw new Error(`TIGERweb truncated ${where}`);
  return body.features;
}

const counties = new Map<string, Shape[]>();
/** A county's subdivisions, fetched once. */
async function subdivisions(fips: string): Promise<Shape[]> {
  if (!counties.has(fips))
    counties.set(
      fips,
      await query(LAYER.cousub, `STATE='${fips.slice(0, 2)}' AND COUNTY='${fips.slice(2)}'`),
    );
  return counties.get(fips)!;
}

const unionAll = (shapes: Shape[]): Shape =>
  shapes.slice(1).reduce((a, b) => union(featureCollection([a, b])) as Shape, shapes[0]!);

function keepShape(def: AreaDef, around: Shape): Shape {
  const k = def.keep!;
  if (k.circle) return circle([k.circle[1], k.circle[0]], k.circle[2], { units: "miles", steps: 48 });
  const [w, s, e, n] = bbox(around);
  return bboxPolygon([k.lonMin ?? w - 1, k.latMin ?? s - 1, k.lonMax ?? e + 1, k.latMax ?? n + 1]);
}

async function outline(def: AreaDef): Promise<Shape> {
  const parts: Shape[] = [];
  for (const [fips, names] of Object.entries(def.units)) {
    const all = await subdivisions(fips);
    const less = def.unitsLess?.[fips] ?? [];
    if (names !== "*")
      for (const n of names)
        if (!all.some((f) => f.properties?.NAME === n)) throw new Error(`${def.id}: no "${n}" in ${fips}`);
    parts.push(
      ...all.filter(
        (f) => (names === "*" || names.includes(f.properties!.NAME)) && !less.includes(f.properties!.NAME),
      ),
    );
  }
  let g = unionAll(parts);
  if (def.keep) g = intersect(featureCollection([g, keepShape(def, g)])) as Shape;
  for (const [state, name] of def.minus ?? []) {
    const [town] = await query(LAYER.place, `STATE='${state}' AND BASENAME='${name}'`);
    if (!town) throw new Error(`${def.id}: no town "${name}" in ${state}`);
    g = (difference(featureCollection([g, town])) as Shape | null) ?? g;
  }
  // Simplifying can fold a narrow neck over itself: halve the tolerance until the outline is clean.
  for (let tolerance = SIMPLIFY_DEG; tolerance > SIMPLIFY_DEG / 16; tolerance /= 2) {
    const out = truncate(simplify(g, { tolerance, highQuality: true }), { precision: 5 });
    if (kinks(out).features.length === 0) return out;
  }
  throw new Error(`${def.id}: the outline crosses itself however it's simplified`);
}

const features = [];
for (const def of AREAS) {
  const g = await outline(def);
  const mi2 = Math.round(area(g) / SQ_M_PER_SQ_MI);
  features.push(feature(g.geometry, { id: def.id, mi2 }));
  console.log(`${def.id}: ${mi2} mi², ${g.geometry.type}`);
}
writeFileSync(
  OUT,
  JSON.stringify({
    source: "US Census Bureau TIGERweb county subdivisions and places, current vintage",
    checked: new Date().toLocaleDateString("en-CA"),
    ...featureCollection(features),
  }) + "\n",
);
console.log(`${OUT}: ${features.length} outlines`);
