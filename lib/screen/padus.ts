/**
 * Protected land within a mile (USGS PAD-US): whether each unit adjoins the parcel, how far it is if not,
 * and the public-access flags. Ported verbatim (proto L1099–1110).
 */
import {
  booleanIntersects,
  buffer,
  centroid,
  nearestPointOnLine,
  pointToLineDistance,
  polygonToLine,
} from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import { arcQuery } from "./arcgis";
import { SCREEN_CONSTANTS } from "./config";
import type { Endpoints, ScreenResult } from "./types";

const K = SCREEN_CONSTANTS.padus;

type Line = Feature<LineString | MultiLineString>;
/** polygonToLine gives a FeatureCollection for multi-polygons; the prototype used its first line. */
const firstLine = (l: Line | FeatureCollection<LineString | MultiLineString>): Line =>
  l.type === "FeatureCollection" ? l.features[0]! : l;

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
          outFields: "Unit_Nm,Mang_Name,Mang_Type,Pub_Access,GAP_Sts,Des_Tp",
        },
        deps,
      )) as Feature<Polygon | MultiPolygon, PadusProps>[];
      break;
    } catch (e) {
      errs.push((e as Error).message);
    }
  }
  if (!feats) throw new Error(errs.join(" | "));
  const buffered = buffer(parcel, K.adjoinsBufferKm, { units: "kilometers" })!;
  const line = polygonToLine(parcel);
  const units = feats.map((f) => {
    const p = f.properties;
    let adj = false,
      distFt: number | null = null;
    try {
      adj = booleanIntersects(buffered, f);
      if (!adj) {
        const edge = polygonToLine(f);
        const np = nearestPointOnLine(firstLine(edge), centroid(parcel));
        distFt = pointToLineDistance(np, firstLine(line) as Feature<LineString>, { units: "feet" });
      }
    } catch {
      /* geometry trouble leaves adjoins false and distance unknown, as in the prototype */
    }
    return {
      name: p.Unit_Nm ?? null,
      manager: p.Mang_Name ?? null,
      type: p.Des_Tp ?? null,
      access: p.Pub_Access ?? null,
      gap: p.GAP_Sts ?? null,
      adjoins: adj,
      distFt,
    };
  });
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
  return { protected: units, flags };
}
