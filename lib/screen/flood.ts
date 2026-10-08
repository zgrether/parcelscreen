/**
 * FEMA NFHL flood zones on the parcel: zones present, Special Flood Hazard Area acreage, and the flag.
 * Ported verbatim (proto L1092–1098). The SFHA features go to the session: scoring and the house check
 * test points against them.
 */
import { area, booleanPointInPolygon, featureCollection, intersect } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import { arcQuery } from "./arcgis";
import { SCREEN_CONSTANTS } from "./config";
import type { Endpoints, ScreenResult } from "./types";
import { M2_PER_ACRE, type LatLon } from "./util";

export type FloodFeature = Feature<Polygon | MultiPolygon, { FLD_ZONE?: string; SFHA_TF?: string }>;

export async function floodStep(
  parcel: Feature<Polygon>,
  parcelAcres: number,
  deps: { http: HttpClient; endpoints: Endpoints; signal?: AbortSignal },
): Promise<{
  flood: NonNullable<ScreenResult["flood"]>;
  sfha: FloodFeature[];
  flags: ScreenResult["flags"];
}> {
  const feats = (await arcQuery(
    deps.endpoints.nfhl,
    parcel,
    { outFields: "FLD_ZONE,SFHA_TF,ZONE_SUBTY" },
    // NFHL timed out in two live runs (follow-up 22), and in 18b's live runs its fetch failed outright: one
    // retry, with a longer limit, after a timeout, a network failure or a 5xx. Never after a 4xx.
    {
      ...deps,
      timeoutMs: SCREEN_CONSTANTS.flood.timeoutMs,
      retryTimeoutMs: SCREEN_CONSTANTS.flood.retryTimeoutMs,
      retryTransient: true,
    },
  )) as FloodFeature[];
  const zones = [...new Set(feats.map((f) => f.properties.FLD_ZONE!))],
    sfha = feats.some((f) => f.properties.SFHA_TF === "T");
  let sfhaAcres = 0;
  for (const f of feats) {
    if (f.properties.SFHA_TF === "T") {
      try {
        const ix = intersect(featureCollection<Polygon | MultiPolygon>([parcel, f]));
        if (ix) sfhaAcres += area(ix) / M2_PER_ACRE;
      } catch {
        /* a bad FEMA geometry contributes nothing, as in the prototype */
      }
    }
  }
  const flags: ScreenResult["flags"] = [];
  if (sfha)
    flags.push({
      lvl: sfhaAcres > parcelAcres * SCREEN_CONSTANTS.flood.fatalShare ? "fatal" : "warn",
      t: `${sfhaAcres.toFixed(1)} of ${parcelAcres.toFixed(1)} acres are in a FEMA Special Flood Hazard Area (${zones.join(", ")}). Post-Helene, treat mapped floodplain as unbuildable and plan the driveway around it.`,
    });
  return {
    flood: { zones, sfha, sfhaAcres, mapped: feats.length > 0 },
    sfha: feats.filter((f) => f.properties.SFHA_TF === "T"),
    flags,
  };
}

/** Whether a point is inside any SFHA polygon (site scoring and the existing-house check). */
export function inSfha(sfha: FloodFeature[] | null | undefined, ll: LatLon): boolean {
  return !!sfha?.some((f) => {
    try {
      return booleanPointInPolygon([ll[1], ll[0]], f);
    } catch {
      return false;
    }
  });
}
