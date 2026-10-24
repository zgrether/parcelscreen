/**
 * GET /api/places/overpass?lat=…&lon=… — the places step's Overpass fallback, run on the server because no
 * Overpass mirror answers a browser (step 13 CORS check; see lib/screen/places.ts). It takes a point, never
 * Overpass QL, and asks only the default mirrors, so it can't be used as an open relay. With `kind=roads` (VR3a),
 * the OSM tracks and service roads near the point instead (lib/screen/osmRoads.ts). With `kind=parking` (follow-up
 * 54) and `pts=lat,lon;…` (one to five points) in place of lat and lon, the parking near each trailhead
 * (lib/screen/trailheadParking.ts). With `kind=power` (step 14), the OSM power lines near the point (lib/screen/power.ts).
 */
import { z } from "zod";
import { CancelledError, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "../screen/config";
import { osmRoadsQuery } from "../screen/osmRoads";
import { osmPowerQuery } from "../screen/power";
import { OverpassMirrors, overpassPlaces } from "../screen/places";
import { parkingQuery } from "../screen/trailheadParking";

const coord = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(min).max(max));

const Query = z.object({
  lat: coord(-90, 90),
  lon: coord(-180, 180),
  kind: z.enum(["places", "roads", "power"]).default("places"),
});

/** `pts=lat,lon;lat,lon`: one to SCREEN_CONSTANTS.drive.trailheadCandidates points. */
const POINT = /^(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)$/;
const Points = z
  .string()
  .transform((v) => v.split(";").map((p) => POINT.exec(p)))
  .pipe(
    z
      .array(z.custom<RegExpExecArray>((m) => m !== null))
      .min(1)
      .max(SCREEN_CONSTANTS.drive.trailheadCandidates),
  )
  .transform((ms) => ms.map((m) => [Number(m[1]), Number(m[3])] as [number, number]))
  .refine((ps) => ps.every(([lat, lon]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180));

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
  if (params.get("kind") === "parking") return parking(params.get("pts"), req, http);
  const q = Query.safeParse({
    lat: params.get("lat") ?? undefined,
    lon: params.get("lon") ?? undefined,
    kind: params.get("kind") ?? undefined,
  });
  if (!q.success)
    return Response.json(
      { error: "lat and lon are required, in degrees; kind is places, roads or power" },
      { status: 400 },
    );
  try {
    const deps = { http, endpoints: DEFAULT_ENDPOINTS, signal: req.signal };
    const centre: [number, number] = [q.data.lat, q.data.lon];
    const elements =
      q.data.kind === "roads"
        ? await new OverpassMirrors().query(osmRoadsQuery(centre), deps)
        : q.data.kind === "power"
          ? await new OverpassMirrors().query(osmPowerQuery(centre), deps)
          : await overpassPlaces(centre, deps, new OverpassMirrors());
    // OSM places change slowly; a re-run of the same parcel shouldn't ask the volunteer mirrors again.
    return Response.json({ elements }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (e) {
    if (e instanceof CancelledError) return new Response(null, { status: 499 });
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** The parking near up to five trailheads (follow-up 54): one query, the same mirrors and caching. */
async function parking(pts: string | null, req: Request, http: HttpClient): Promise<Response> {
  const q = Points.safeParse(pts ?? undefined);
  if (!q.success)
    return Response.json(
      {
        error: `pts is required: one to ${SCREEN_CONSTANTS.drive.trailheadCandidates} lat,lon pairs, ;-separated`,
      },
      { status: 400 },
    );
  try {
    const deps = { http, endpoints: DEFAULT_ENDPOINTS, signal: req.signal };
    const elements = await new OverpassMirrors().query(parkingQuery(q.data), deps);
    return Response.json({ elements }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (e) {
    if (e instanceof CancelledError) return new Response(null, { status: 499 });
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
