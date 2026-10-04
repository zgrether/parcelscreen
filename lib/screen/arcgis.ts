/**
 * Polygon-intersects query against an ArcGIS FeatureServer/MapServer layer, returning GeoJSON features.
 * Used by the flood and public-land steps. Ported verbatim (proto L855–860), including its error text.
 */
import type { Feature, Polygon } from "geojson";
import type { HttpClient } from "../http";

export interface ArcQueryDeps {
  http: HttpClient;
  signal?: AbortSignal;
}

export async function arcQuery(
  url: string,
  parcel: Feature<Polygon>,
  extra: Record<string, string | number>,
  deps: ArcQueryDeps,
): Promise<Feature[]> {
  const params: Record<string, string> = {
    geometry: JSON.stringify({ rings: parcel.geometry.coordinates, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  };
  for (const [k, v] of Object.entries(extra)) params[k] = String(v);
  const r = await deps.http.fetch(`${url}/query`, {
    method: "POST",
    body: new URLSearchParams(params),
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
  const name = url.split("/services/")[1];
  if (!r.ok) {
    let t = "";
    try {
      t = (await r.text())
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 140);
    } catch {
      /* body unreadable: report the status alone */
    }
    throw new Error(`${name} ${r.status}${t ? ": " + t : ""}`);
  }
  const j = (await r.json()) as { features?: Feature[]; error?: { message?: string } };
  if (j.error) throw new Error(`${name}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.features || [];
}
