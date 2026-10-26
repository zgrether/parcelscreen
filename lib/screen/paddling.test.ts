/** Paddling's launches (step 14d plan §4.1): one put-in mapped twice is listed once. */
import { describe, expect, it } from "vitest";
import { SCREEN_CONSTANTS } from "./config";
import { distinctLaunches } from "./paddling";
import type { BakedLaunch } from "./placeData";

const launch = (id: string, ll: [number, number]): BakedLaunch => ({
  kind: "launch",
  id,
  ll,
  src: "osm",
  name: "New River access",
  water: "river",
  waterName: "New River",
});
/** About 1 m in latitude, in degrees. */
const M = 1 / 111_195;

describe("distinctLaunches", () => {
  it(`keeps the nearer of two launches within ${SCREEN_CONSTANTS.paddling.sameWithinM} m, and both when farther apart`, () => {
    const near = { l: launch("osm:node/1", [36.7, -80.9]), km: 24.5 };
    const twin = { l: launch("osm:way/2", [36.7 + 120 * M, -80.9]), km: 24.5 };
    const apart = { l: launch("osm:node/3", [36.7 + 400 * M, -80.9]), km: 24.9 };
    expect(distinctLaunches([near, twin, apart]).map((x) => x.l.id)).toEqual(["osm:node/1", "osm:node/3"]);
  });
});
