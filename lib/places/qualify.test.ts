/**
 * Which trail lots are trailheads (Zach, #425): on a hiking route of trailLotRouteMi, or within trailLotPublicM of public
 * land of trailLotPublicAc. The figures are probe round 10's (11/12): the Brumley Mountain Trail's lot at Hayters Gap
 * (a 13.5 mi route; The Channels State Forest, 4,836 ac) and Skymart's in Morristown (a 0.5 mi route; a 12 ac park).
 */
import { describe, expect, it } from "vitest";
import { createHttpClient } from "../http";
import type { LatLon } from "../geo/types";
import type { OsmElement } from "./bake";
import { evidenceOf, evidenceQuery, qualifyTrailLots, QUALIFY_BATCH, verdictOf } from "./qualify";

const http = (f: typeof fetch) =>
  createHttpClient({
    env: "node",
    fetchImpl: f,
    hostPolicies: {},
    defaultPolicy: { maxConcurrent: 8, minIntervalMs: 0 },
  });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const BRUMLEY = {
  id: "osm:way/808088841",
  name: "Brumley Mountain Trail (parking)",
  ll: [36.8646, -81.9469] as LatLon,
};
const SKYMART = { id: "osm:way/896001424", name: "Skymart (parking)", ll: [36.213, -83.2944] as LatLon };
const TAGGED = { id: "osm:node/5", name: "Elk Garden", ll: [36.65, -81.5] as LatLon };

const MI = 1609.344;
/** The evidence query's answer: each lot, then its routes (convert's "route" elements). */
const ANSWER: OsmElement[] = [
  { type: "way", id: 808088841, tags: { amenity: "parking" } },
  { type: "route", id: 19562221, tags: { name: "Brumley Mountain Trail", len: String(13.5 * MI) } },
  { type: "route", id: 1, tags: { name: "A spur", len: String(0.3 * MI) } },
  { type: "way", id: 896001424, tags: { amenity: "parking" } },
  { type: "route", id: 12787659, tags: { name: "Skymart", len: String(0.5 * MI) } },
  { type: "node", id: 5, tags: { highway: "trailhead", name: "Elk Garden" } },
];

describe("trail lots as trailheads (Zach, #425)", () => {
  it("asks each lot's tags and the routes on the trails within 60 m, with their lengths", () => {
    const q = evidenceQuery([BRUMLEY.id, SKYMART.id, TAGGED.id, "osm:relation/9"]);
    expect(q).toContain("(node(id:5);way(id:808088841,896001424);rel(id:9);)->.l;");
    expect(q).toContain(
      'foreach.l->.x(.x out tags;way(around.x:60)["highway"~"^(path|footway|track|bridleway|service)$"]->.n;',
    );
    expect(q).toContain('.r convert route ::id=id(),name=t["name"],len=length();out;);');
  });

  it("reads each lot's longest route, and whether OSM tags it a trailhead", () => {
    const ev = evidenceOf(ANSWER);
    expect(ev.get(BRUMLEY.id)?.route?.name).toBe("Brumley Mountain Trail");
    expect(ev.get(BRUMLEY.id)?.route?.mi).toBeCloseTo(13.5, 5);
    expect(ev.get(SKYMART.id)?.route?.mi).toBeCloseTo(0.5, 5);
    expect(ev.get(TAGGED.id)).toEqual({ tagged: true, route: null });
  });

  it("keeps a lot on a long route or by large public land; drops a town lot", () => {
    expect(
      verdictOf({ tagged: false, route: { name: "Brumley Mountain Trail", mi: 13.5 }, publicLand: null }),
    ).toEqual({
      keep: true,
      why: "on Brumley Mountain Trail, 13.5 mi",
    });
    expect(
      verdictOf({ tagged: false, route: null, publicLand: { name: "The Channels State Forest", ac: 4836 } }),
    ).toEqual({ keep: true, why: "The Channels State Forest, 4,836 ac, within 400 m" });
    expect(
      verdictOf({
        tagged: false,
        route: { name: "Skymart", mi: 0.5 },
        publicLand: { name: "Fred Miller Park", ac: 12 },
      }),
    ).toEqual({ keep: false, why: "Skymart, 0.5 mi; Fred Miller Park, 12 ac within 400 m" });
    expect(verdictOf({ tagged: false, route: null, publicLand: null })).toEqual({
      keep: false,
      why: "no hiking route; no public land within 400 m",
    });
    expect(verdictOf({ tagged: true, route: null, publicLand: null }).keep).toBe(true);
  });

  it("asks PAD-US only when the route didn't decide, and keeps what won't load", async () => {
    const asked: string[] = [];
    const f: typeof fetch = async (input, init) => {
      const at = new URLSearchParams(String(init?.body)).get("geometry")!;
      asked.push(at);
      if (at.startsWith("-83.2944"))
        return json({ features: [{ attributes: { Unit_Nm: "Fred Miller Park", GIS_Acres: 12 } }] });
      return json({}, 400);
    };
    const NOWHERE = { id: "osm:way/7", name: "Somewhere (parking)", ll: [35, -80] as LatLon };
    const verdicts = await qualifyTrailLots([BRUMLEY, SKYMART, TAGGED, NOWHERE], {
      http: http(f),
      ask: async () => [...ANSWER, { type: "way", id: 7, tags: { amenity: "parking" } }],
    });
    expect(verdicts.map((v) => [v.lot.id, v.keep])).toEqual([
      [BRUMLEY.id, true],
      [SKYMART.id, false],
      [TAGGED.id, true],
      [NOWHERE.id, true],
    ]);
    // Brumley's route decided it, and the tagged trailhead isn't judged: PAD-US was asked for Skymart and the last.
    expect(asked).toEqual(["-83.2944,36.213", "-80,35"]);
    expect(verdicts[3]!.why).toMatch(/^public land didn't load/);
  });

  it("keeps a batch whose evidence won't load, unchecked", async () => {
    const lots = Array.from({ length: QUALIFY_BATCH + 1 }, (_, i) => ({
      id: `osm:way/${i + 1}`,
      name: `Lot ${i + 1}`,
      ll: [35, -80] as LatLon,
    }));
    let n = 0;
    const verdicts = await qualifyTrailLots(lots, {
      http: http(async () => json({ features: [] })),
      ask: async () => {
        if (n++ === 0) throw new Error("504");
        return [{ type: "way", id: QUALIFY_BATCH + 1, tags: {} }];
      },
    });
    expect(verdicts.slice(0, QUALIFY_BATCH).every((v) => v.keep && /didn't load/.test(v.why))).toBe(true);
    // The second batch answered: no route, no public land.
    expect(verdicts[QUALIFY_BATCH]).toMatchObject({ keep: false });
  });
});
