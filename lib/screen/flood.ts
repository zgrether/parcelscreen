/**
 * FEMA NFHL flood zones on the parcel: zones present, Special Flood Hazard Area acreage, and the flag.
 * Ported from the prototype (proto L1092–1098). The SFHA features go to the session: scoring and the house
 * check test points against them.
 *
 * Two queries since Batch A, A2a (owner, 2026-10-08), where the prototype made one: the zones present without
 * geometry, then geometry for the SFHA features only, the ones the step measures. Zone X polygons are vast
 * (8 MB for Grayson Mud Creek) and only their name was ever used. The parcel is its own land when its outline
 * bridges a strip between parts (follow-up 29).
 */
import { area, bbox, booleanPointInPolygon, featureCollection, intersect } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import { arcQuery } from "./arcgis";
import { SCREEN_CONSTANTS } from "./config";
import { llToRC, rcToLL } from "./dem";
import type { Dem, Endpoints, ScreenResult, RawFlag } from "./types";
import { M2_PER_ACRE, type LatLon } from "./util";

export type FloodFeature = Feature<Polygon | MultiPolygon, { FLD_ZONE?: string; SFHA_TF?: string }>;

export async function floodStep(
  parcel: Feature<Polygon | MultiPolygon>,
  parcelAcres: number,
  deps: { http: HttpClient; endpoints: Endpoints; signal?: AbortSignal },
): Promise<{
  flood: NonNullable<ScreenResult["flood"]>;
  sfha: FloodFeature[];
  flags: RawFlag[];
}> {
  // NFHL timed out in two live runs (follow-up 22), and in 18b's live runs its fetch failed outright: one
  // retry, with a longer limit, after a timeout, a network failure or a 5xx. Never after a 4xx.
  const io = {
    ...deps,
    timeoutMs: SCREEN_CONSTANTS.flood.timeoutMs,
    retryTimeoutMs: SCREEN_CONSTANTS.flood.retryTimeoutMs,
    retryTransient: true,
  };
  const all = (await arcQuery(
    deps.endpoints.nfhl,
    parcel,
    { outFields: "FLD_ZONE,SFHA_TF", returnGeometry: "false" },
    io,
  )) as FloodFeature[];
  const zones = [...new Set(all.map((f) => f.properties.FLD_ZONE!))],
    sfha = all.some((f) => f.properties.SFHA_TF === "T");
  const feats = sfha
    ? ((await arcQuery(
        deps.endpoints.nfhl,
        parcel,
        { outFields: "FLD_ZONE,SFHA_TF", where: "SFHA_TF='T'" },
        io,
      )) as FloodFeature[])
    : [];
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
  const flood = { zones, sfha, sfhaAcres, mapped: all.length > 0 };
  return {
    flood,
    sfha: feats.filter((f) => f.properties.SFHA_TF === "T"),
    flags: floodFlags(flood, parcelAcres),
  };
}

/** The flood step's flag (v8: also from a stored result): the SFHA acres, fatal over flood.fatalShare of the parcel. */
export function floodFlags(
  flood: Pick<NonNullable<ScreenResult["flood"]>, "zones" | "sfha" | "sfhaAcres">,
  parcelAcres: number,
): RawFlag[] {
  if (!flood.sfha) return [];
  return [
    {
      lvl: flood.sfhaAcres > parcelAcres * SCREEN_CONSTANTS.flood.fatalShare ? "fatal" : "warn",
      t: `${flood.sfhaAcres.toFixed(1)} of ${parcelAcres.toFixed(1)} acres are in a FEMA Special Flood Hazard Area (${flood.zones.join(", ")}). Post-Helene, treat mapped floodplain as unbuildable and plan the driveway around it.`,
    },
  ];
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

/**
 * The SFHA on a DEM's grid (VR3a): 1 where a cell's centre is inside a Special Flood Hazard Area polygon. A site's
 * cells and a route's path are read against it (owner, #109 review: a flood zone that touches the build footprint
 * or the driveway warns).
 */
export function sfhaMask(d: Dem, sfha: FloodFeature[] | null | undefined): Uint8Array {
  const out = new Uint8Array(d.w * d.h);
  for (const f of sfha ?? []) {
    const [w, s, e, n] = bbox(f);
    const corners = [llToRC(d, s, w), llToRC(d, s, e), llToRC(d, n, w), llToRC(d, n, e)];
    const r0 = Math.max(0, Math.floor(Math.min(...corners.map((x) => x[0])))),
      r1 = Math.min(d.h - 1, Math.ceil(Math.max(...corners.map((x) => x[0])))),
      c0 = Math.max(0, Math.floor(Math.min(...corners.map((x) => x[1])))),
      c1 = Math.min(d.w - 1, Math.ceil(Math.max(...corners.map((x) => x[1]))));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * d.w + c;
        if (out[i]) continue;
        const [lat, lon] = rcToLL(d, r, c);
        try {
          if (booleanPointInPolygon([lon, lat], f)) out[i] = 1;
        } catch {
          /* a malformed feature marks nothing */
        }
      }
  }
  return out;
}
