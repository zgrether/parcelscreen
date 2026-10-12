/**
 * Which states each fixture's trailhead search reaches (follow-up 53, #122 review): a state's parks are asked only when
 * its outline comes within near.trailheadKm (36 km) of the parcel's centre, plus the outline's margin.
 */
import { centroid } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { FIXTURE_SLUGS, loadFixture } from "@/test/support/fixtures";
import { SCREEN_CONSTANTS } from "./config";
import { kmToState, stateWithinKm, type StateCode } from "./states";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.near;
const REACH = K.trailheadKm + K.stateOutlineMarginKm;
const STATES: StateCode[] = ["VA", "NC", "TN"];
const reached = (ll: LatLon) => STATES.filter((s) => stateWithinKm(s, ll, REACH));

/** The screen's centre: the parcel's centroid (screen(), lib/screen/index.ts). */
function centreOf(slug: (typeof FIXTURE_SLUGS)[number]): LatLon {
  const [lon, lat] = centroid(loadFixture(slug).input.polygon).geometry.coordinates;
  return [lat!, lon!];
}

describe("the states a trailhead search reaches", () => {
  it("each fixture: Ferney and Macks (Floyd County VA) reach only Virginia; Grayson, at the state line, all three", () => {
    expect(Object.fromEntries(FIXTURE_SLUGS.map((slug) => [slug, reached(centreOf(slug))]))).toEqual({
      "ferney-creek-52-47A": ["VA"],
      "grayson-mud-creek-6273": ["VA", "NC", "TN"],
      "macks-mountain-35-3": ["VA"],
    });
  });

  it("Ferney is why it's an outline: North Carolina's border is 37 km away, its bounding box 33", () => {
    // NC's box (33.84–36.59 N) reaches 36.59 N, the far west end of its northern line; at Ferney's longitude the line
    // runs at about 36.54 N. A box would ask NC for Ferney's trailheads, where none can be within 36 km.
    const km = kmToState("NC", centreOf("ferney-creek-52-47A"));
    expect(km).toBeGreaterThan(REACH);
    expect(km).toBeLessThan(40);
  });

  it("deep in a state, only that state; inside one, 0 or less", () => {
    expect(reached([35.78, -78.64])).toEqual(["NC"]); // Raleigh
    expect(reached([36.16, -86.78])).toEqual(["TN"]); // Nashville
    expect(reached([37.54, -77.44])).toEqual(["VA"]); // Richmond
    expect(kmToState("VA", [37.54, -77.44])).toBeLessThanOrEqual(0);
  });
});
