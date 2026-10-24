/**
 * The parcel's county, and its zoning district where the county publishes a zoning map (step 14,
 * docs/plans/step-14-land-uses.md §2.6). The county from the Census Bureau's TIGERweb counties layer at the parcel's
 * centre; the district from the county's own layer (lib/config/counties.ts zoningLayer), for every district the parcel
 * touches. Divide reads them: which county's rules, and whether the rural default is assumed.
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { z } from "zod";
import { CancelledError, type HttpClient } from "../http";
import { countyByFips } from "../config/counties";
import { arcQuery } from "./arcgis";
import type { LatLon } from "./util";

/** TIGERweb's counties layer (State_County, layer 1). */
export const TIGER_COUNTIES =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1";

/** State FIPS to the two letters, for the states around Zach's search. */
const STATES: Record<string, string> = {
  "51": "VA",
  "37": "NC",
  "47": "TN",
  "54": "WV",
  "21": "KY",
  "45": "SC",
  "13": "GA",
};

export interface County {
  fips: string;
  name: string;
  state: string;
  /** The districts the parcel touches on the county's zoning map, or null when the county has no map we read. */
  zoning: { districts: { code: string; name: string | null }[] } | null;
}

const AnswerSchema = z.looseObject({
  features: z.array(
    z.looseObject({ attributes: z.looseObject({ GEOID: z.string(), BASENAME: z.string() }) }),
  ),
});

/** The county at a point, from TIGERweb; null when the point is in none (offshore). */
export async function countyAt(
  ll: LatLon,
  deps: { http: HttpClient; signal?: AbortSignal },
  url: string = TIGER_COUNTIES,
): Promise<{ fips: string; name: string; state: string } | null> {
  const q = new URLSearchParams({
    geometry: `${ll[1]},${ll[0]}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "GEOID,BASENAME",
    returnGeometry: "false",
    f: "json",
  });
  const r = await deps.http.fetch(`${url}/query?${q}`, { ...(deps.signal ? { signal: deps.signal } : {}) });
  if (!r.ok) throw new Error(`TIGERweb counties ${r.status}`);
  const a = AnswerSchema.parse(await r.json()).features[0]?.attributes;
  if (!a) return null;
  return { fips: a.GEOID, name: a.BASENAME, state: STATES[a.GEOID.slice(0, 2)] ?? a.GEOID.slice(0, 2) };
}

/** The county, and the districts on its zoning map the parcel touches (when it has one in lib/config/counties.ts). */
export async function findCounty(
  ll: LatLon,
  parcel: Feature<Polygon | MultiPolygon>,
  deps: { http: HttpClient; signal?: AbortSignal },
  url: string = TIGER_COUNTIES,
): Promise<(County & { zoningFailed?: true }) | null> {
  const c = await countyAt(ll, deps, url);
  if (!c) return null;
  const layer = countyByFips(c.fips)?.zoningLayer;
  if (!layer) return { ...c, zoning: null };
  // The county stands when its zoning map doesn't answer: the district is then unknown (Divide assumes the default).
  let features;
  try {
    features = await arcQuery(
      layer.url,
      parcel,
      { outFields: `${layer.codeField},${layer.nameField}`, returnGeometry: "false" },
      deps,
    );
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return { ...c, zoning: null, zoningFailed: true };
  }
  const seen = new Map<string, string | null>();
  for (const f of features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const code = p[layer.codeField];
    if (typeof code !== "string" || !code) continue;
    const name = p[layer.nameField];
    seen.set(code, typeof name === "string" && name ? name : null);
  }
  return {
    ...c,
    zoning: {
      districts: [...seen.entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    },
  };
}
