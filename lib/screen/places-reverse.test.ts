/**
 * Everything by tag through Photon's reverse geocoder, nothing by name: groceries and trailheads (follow-ups 25
 * and 24, Batch A A2b), and hospitals when the snapshot can't be loaded (A2c).
 */
import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import { findPlaces, OverpassMirrors } from "./places";

type Feature = { coordinates: [number, number]; name: string; osm: [string, number] };
/** Photon answering each tag with the features given; the URLs asked kept. */
function photon(byTag: Record<string, Feature[]>) {
  const asked: URL[] = [];
  const http: HttpClient = {
    fetch: async (url) => {
      const u = new URL(url);
      asked.push(u);
      const fs = byTag[u.searchParams.get("osm_tag")!] ?? [];
      return Response.json({
        features: fs.map((f) => ({
          geometry: { coordinates: f.coordinates },
          properties: { name: f.name, osm_type: f.osm[0], osm_id: f.osm[1] },
        })),
      });
    },
  };
  return { http, asked };
}
const shop: Feature = { coordinates: [-81.5, 36.6], name: "X", osm: ["N", 1] };
const tagsAsked = (asked: URL[]) =>
  asked.map((u) => [
    u.pathname,
    u.searchParams.get("q"),
    u.searchParams.get("osm_tag"),
    u.searchParams.get("radius"),
  ]);

describe("findPlaces asks Photon by tag, never by name", () => {
  it("groceries and trailheads only: the hospitals are the ER list's (§9.69)", async () => {
    const p = photon({ "shop:supermarket": [shop] });
    const r = await findPlaces(
      [36.5856, -81.5631],
      { http: p.http, endpoints: DEFAULT_ENDPOINTS },
      new OverpassMirrors(),
    );
    expect(tagsAsked(p.asked)).toEqual([
      ["/reverse", null, "shop:supermarket", "40"],
      ["/reverse", null, "highway:trailhead", "36"],
    ]);
    expect(r.near.hospitals.length).toBeGreaterThan(0); // from the list
    expect(r.hospitalPool.every((h) => h.er === true)).toBe(true);
  });

  it("without the list: no hospital, and still none asked of Photon (OpenStreetMap's are never timed)", async () => {
    const p = photon({ "shop:supermarket": [shop] });
    const r = await findPlaces(
      [36.5856, -81.5631],
      { http: p.http, endpoints: DEFAULT_ENDPOINTS, hospitals: async () => null },
      new OverpassMirrors(),
    );
    expect(tagsAsked(p.asked)).toEqual([
      ["/reverse", null, "shop:supermarket", "40"],
      ["/reverse", null, "highway:trailhead", "36"],
    ]);
    expect(r.hospitalPool).toEqual([]);
    expect(r.near.hospitals).toEqual([]);
  });
});
