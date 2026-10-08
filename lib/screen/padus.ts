/**
 * Protected land within a mile (USGS PAD-US): whether each unit adjoins the parcel, how far it is if not,
 * and the public-access flags. Ported from the prototype (proto L1099–1110), with two changes (follow-up 23,
 * owner 2026-10-08):
 * - a unit's distance is to the nearest of its parts and rings (the prototype measured its first ring only:
 *   112,947 ft for a 43-part unit whose nearest part was about 3,400 ft away);
 * - a second, wider query finds land open to visitors beyond the mile, appended after the mile's units. It
 *   feeds only the report's "beyond a mile" line, and never the adjoins flags.
 */
import {
  booleanIntersects,
  buffer,
  centroid,
  lineString,
  nearestPointOnLine,
  pointToLineDistance,
  polygonToLine,
} from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import { arcQuery } from "./arcgis";
import { SCREEN_CONSTANTS } from "./config";
import type { Endpoints, ScreenResult } from "./types";
import { M2FT } from "./util";

const K = SCREEN_CONSTANTS.padus;

type Line = Feature<LineString | MultiLineString>;
/** polygonToLine gives a FeatureCollection for multi-polygons; the parcel (one polygon) has one line. */
const firstLine = (l: Line | FeatureCollection<LineString | MultiLineString>): Line =>
  l.type === "FeatureCollection" ? l.features[0]! : l;

/** Every ring of every part, each as its own line. */
function rings(f: Feature<Polygon | MultiPolygon>): Feature<LineString>[] {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polys.flatMap((p) => p.map((ring) => lineString(ring)));
}

/**
 * How far a unit is, ft: the prototype's measure (the unit's point nearest the parcel's centre, to the
 * parcel's edge), taken for each ring of each part, the least of them. Null when no ring will measure.
 */
function distanceFt(f: Feature<Polygon | MultiPolygon>, parcel: Feature<Polygon>, edge: Line): number | null {
  const c = centroid(parcel);
  let best: number | null = null;
  for (const ring of rings(f)) {
    try {
      const np = nearestPointOnLine(ring, c);
      const d = pointToLineDistance(np, edge as Feature<LineString>, { units: "feet" });
      if (best === null || d < best) best = d;
    } catch {
      /* a ring that won't measure leaves the others */
    }
  }
  return best;
}

const OUT_FIELDS = "Unit_Nm,Mang_Name,Mang_Type,Pub_Access,GAP_Sts,Des_Tp";
const sameUnit = (a: PadusProps, b: PadusProps) =>
  a.Unit_Nm === b.Unit_Nm &&
  a.Mang_Name === b.Mang_Name &&
  a.Des_Tp === b.Des_Tp &&
  a.Pub_Access === b.Pub_Access &&
  a.GAP_Sts === b.GAP_Sts;

interface PadusProps {
  Unit_Nm?: string | null;
  Mang_Name?: string | null;
  Des_Tp?: string | null;
  Pub_Access?: string | null;
  GAP_Sts?: string | null;
}

export async function padusStep(
  parcel: Feature<Polygon>,
  deps: { http: HttpClient; endpoints: Endpoints; signal?: AbortSignal },
): Promise<{ protected: NonNullable<ScreenResult["protected"]>; flags: ScreenResult["flags"] }> {
  let feats: Feature<Polygon | MultiPolygon, PadusProps>[] | null = null;
  const errs: string[] = [];
  for (const u of deps.endpoints.padus) {
    try {
      feats = (await arcQuery(
        u,
        parcel,
        {
          distance: K.searchM,
          units: "esriSRUnit_Meter",
          outFields: OUT_FIELDS,
        },
        deps,
      )) as Feature<Polygon | MultiPolygon, PadusProps>[];
      break;
    } catch (e) {
      errs.push((e as Error).message);
    }
  }
  if (!feats) throw new Error(errs.join(" | "));
  const near = feats;
  const wide = await openBeyond(parcel, deps);
  const buffered = buffer(parcel, K.adjoinsBufferKm, { units: "kilometers" })!;
  const edge = firstLine(polygonToLine(parcel));
  const unit = (p: PadusProps, adjoins: boolean, distFt: number | null) => ({
    name: p.Unit_Nm ?? null,
    manager: p.Mang_Name ?? null,
    type: p.Des_Tp ?? null,
    access: p.Pub_Access ?? null,
    gap: p.GAP_Sts ?? null,
    adjoins,
    distFt,
  });
  const units = near.map((f) => {
    let adj = false,
      distFt: number | null = null;
    try {
      adj = booleanIntersects(buffered, f);
      if (!adj) distFt = distanceFt(f, parcel, edge);
    } catch {
      /* geometry trouble leaves adjoins false and distance unknown, as in the prototype */
    }
    return unit(f.properties, adj, distFt);
  });
  // Beyond the mile, open to visitors, from the wider query: never a unit the mile's query found (its
  // full-geometry copy stands), and only ones measured beyond the mile, nearest first.
  const beyondFt = K.searchM * M2FT;
  const farther = wide
    .filter((f) => !near.some((g) => sameUnit(f.properties, g.properties)))
    .map((f) => ({ p: f.properties, d: distanceFt(f, parcel, edge) }))
    .filter((x): x is { p: PadusProps; d: number } => x.d !== null && x.d > beyondFt)
    .sort((a, b) => a.d - b.d)
    .map((x) => unit(x.p, false, x.d));
  const flags: ScreenResult["flags"] = [];
  const adjOpen = units.filter((u) => u.access === "OA" && u.adjoins);
  if (adjOpen.length)
    flags.push({
      lvl: "good",
      t: `Adjoins publicly accessible protected land: ${adjOpen.map((u) => u.name).join("; ")}. That's the acre you never pay for.`,
    });
  else if (units.some((u) => u.adjoins))
    flags.push({
      lvl: "warn",
      t: "Adjoins protected land, but it's restricted or closed to the public — a buffer, not a backyard.",
    });
  return { protected: [...units, ...farther], flags };
}

/**
 * The wider query (follow-up 23): land open to visitors within padus.nearestOpenKm, outlines simplified. A
 * failure here never fails the step: the mile's units and flags stand, and the report has no "beyond" line.
 */
async function openBeyond(
  parcel: Feature<Polygon>,
  deps: { http: HttpClient; endpoints: Endpoints; signal?: AbortSignal },
): Promise<Feature<Polygon | MultiPolygon, PadusProps>[]> {
  for (const u of deps.endpoints.padus) {
    try {
      return (await arcQuery(
        u,
        parcel,
        {
          distance: K.nearestOpenKm * 1000,
          units: "esriSRUnit_Meter",
          where: "Pub_Access='OA'",
          maxAllowableOffset: K.openSimplifyDeg,
          outFields: OUT_FIELDS,
        },
        deps,
      )) as Feature<Polygon | MultiPolygon, PadusProps>[];
    } catch (e) {
      if (deps.signal?.aborted) throw e;
    }
  }
  return [];
}
