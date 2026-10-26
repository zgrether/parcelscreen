/**
 * GET /api/places/overpass?lat=…&lon=…&kind=… — Overpass, run on the server because no Overpass mirror answers a
 * browser (step 13 CORS check; see lib/screen/places.ts). It takes a point, never Overpass QL, and asks only the
 * default mirrors, so it can't be used as an open relay. `kind=roads` (VR3a): the OSM tracks and service roads near
 * the point (lib/screen/osmRoads.ts); `kind=power` (step 14): the OSM power lines near it (lib/screen/power.ts).
 * Step 14d removed the places and parking kinds: a grade reads those from the baked places.
 */
import { z } from "zod";
import { CancelledError, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "../screen/config";
import { osmRoadsQuery } from "../screen/osmRoads";
import { osmPowerQuery } from "../screen/power";
import { OverpassMirrors } from "../screen/places";

const coord = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(min).max(max));

const Query = z.object({
  lat: coord(-90, 90),
  lon: coord(-180, 180),
  kind: z.enum(["roads", "power"]),
});

/**
 * The e2e server's switch (PS_OVERPASS=off): the browser's recordings can't answer a request the server makes, so a test
 * run must never reach the live mirrors; it answers as the mirrors do when none answers, at once and every time.
 */
export const OVERPASS_OFF = "Overpass is off on this server";

export async function handleOverpass(
  req: Request,
  http: HttpClient,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Response> {
  if (env.PS_OVERPASS === "off") return Response.json({ error: OVERPASS_OFF }, { status: 503 });
  const params = new URL(req.url).searchParams;
  const q = Query.safeParse({
    lat: params.get("lat") ?? undefined,
    lon: params.get("lon") ?? undefined,
    kind: params.get("kind") ?? undefined,
  });
  if (!q.success)
    return Response.json(
      { error: "lat and lon are required, in degrees; kind is roads or power" },
      { status: 400 },
    );
  try {
    const deps = { http, endpoints: DEFAULT_ENDPOINTS, signal: req.signal };
    const centre: [number, number] = [q.data.lat, q.data.lon];
    const elements = await new OverpassMirrors().query(
      q.data.kind === "roads" ? osmRoadsQuery(centre) : osmPowerQuery(centre),
      deps,
    );
    // OSM changes slowly; a re-run of the same parcel shouldn't ask the volunteer mirrors again.
    return Response.json({ elements }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (e) {
    if (e instanceof CancelledError) return new Response(null, { status: 499 });
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
