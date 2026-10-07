"use client";
/**
 * Fetches the screen's wide DEM again when the viewer opens (the same 3DEP request: the parcel plus 6 km at
 * 30 m, through the engine's fetchDEM), and splits the skyline into distance bands (lib/render/ridges.ts).
 * The DEM is used and dropped: DEM rasters are never kept (CLAUDE.md).
 */
import { useEffect, useState } from "react";
import type { Feature, Polygon } from "geojson";
import { browserHttp } from "@/lib/client/http";
import { ridgeBands, type RidgeBands } from "@/lib/render/ridges";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { fetchDEM, parcelBboxes } from "@/lib/screen/dem";
import type { Endpoints } from "@/lib/screen/types";
import type { LatLon } from "@/lib/screen/util";
import { CancelledError } from "@/lib/http";

export type Ridges = { state: "loading" } | { state: "ready"; bands: RidgeBands } | { state: "failed" };

export function useRidges(parcel: Feature<Polygon> | null, ll: LatLon, endpoints: Endpoints): Ridges {
  const [ridges, setRidges] = useState<Ridges>({ state: "loading" });
  const [lat, lon] = ll;
  useEffect(() => {
    if (!parcel) return;
    const abort = new AbortController();
    fetchDEM(parcelBboxes(parcel).wide, SCREEN_CONSTANTS.dem.wideResM, {
      http: browserHttp,
      endpoints,
      signal: abort.signal,
    }).then(
      (dem) => setRidges({ state: "ready", bands: ridgeBands(dem, [lat, lon]) }),
      (e) => !(e instanceof CancelledError) && setRidges({ state: "failed" }),
    );
    return () => abort.abort();
  }, [parcel, lat, lon, endpoints]);
  return parcel ? ridges : { state: "failed" };
}
