/** Groceries and trailheads by tag through Photon's reverse geocoder (follow-ups 25 and 24, Batch A A2b). */
import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import { findPlaces, OverpassMirrors } from "./places";

describe("findPlaces asks Photon", () => {
  it("for hospitals by name as before, and for groceries and trailheads by tag within their radius", async () => {
    const asked: string[] = [];
    const http: HttpClient = {
      fetch: async (url) => {
        asked.push(url);
        return new Response(
          JSON.stringify({
            features: [{ geometry: { coordinates: [-81.5, 36.6] }, properties: { name: "X" } }],
          }),
        );
      },
    };
    await findPlaces([36.5856, -81.5631], { http, endpoints: DEFAULT_ENDPOINTS }, new OverpassMirrors());
    const [hosp, groc, trail] = asked.map((u) => new URL(u));
    expect(hosp!.pathname).toBe("/api/");
    expect(hosp!.searchParams.get("q")).toBe("hospital");
    for (const [u, tag, km] of [
      [groc!, "shop:supermarket", "40"],
      [trail!, "highway:trailhead", "20"],
    ] as const) {
      expect(u.pathname).toBe("/reverse");
      expect(u.searchParams.get("q")).toBeNull(); // no name to match
      expect([u.searchParams.get("osm_tag"), u.searchParams.get("radius")]).toEqual([tag, km]);
    }
  });
});
