/**
 * GET /api/places/overpass?lat=…&lon=… — the places step's Overpass fallback, run on the server because no
 * Overpass mirror answers a browser (step 13 CORS check; see lib/screen/places.ts). It takes a point, never
 * Overpass QL, and asks only the default mirrors, so it can't be used as an open relay.
 */
import { z } from "zod";
import { CancelledError, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "../screen/config";
import { OverpassMirrors, overpassPlaces } from "../screen/places";

const coord = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(min).max(max));

const Query = z.object({ lat: coord(-90, 90), lon: coord(-180, 180) });

export async function handleOverpass(req: Request, http: HttpClient): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const q = Query.safeParse({ lat: params.get("lat") ?? undefined, lon: params.get("lon") ?? undefined });
  if (!q.success) return Response.json({ error: "lat and lon are required, in degrees" }, { status: 400 });
  try {
    const elements = await overpassPlaces(
      [q.data.lat, q.data.lon],
      { http, endpoints: DEFAULT_ENDPOINTS, signal: req.signal },
      new OverpassMirrors(),
    );
    // OSM places change slowly; a re-run of the same parcel shouldn't ask the volunteer mirrors again.
    return Response.json({ elements }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (e) {
    if (e instanceof CancelledError) return new Response(null, { status: 499 });
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
