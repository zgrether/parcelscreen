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
  it("with the hospital snapshot: groceries and trailheads only", async () => {
    const p = photon({ "shop:supermarket": [shop] });
    const r = await findPlaces(
      [36.5856, -81.5631],
      { http: p.http, endpoints: DEFAULT_ENDPOINTS },
      new OverpassMirrors(),
    );
    expect(tagsAsked(p.asked)).toEqual([
      ["/reverse", null, "shop:supermarket", "40"],
      ["/reverse", null, "highway:trailhead", "20"],
    ]);
    expect(r.near.hospitals.length).toBeGreaterThan(0); // from the snapshot
    expect(r.hospitalPool.every((h) => typeof h.er === "boolean")).toBe(true);
  });

  it("without it: hospitals by both tags, one element found by both counted once, status unknown", async () => {
    const twinCounty: Feature = {
      coordinates: [-80.92, 36.67],
      name: "Twin County Regional Hospital",
      osm: ["W", 517484622],
    };
    const hughChatham: Feature = {
      coordinates: [-80.86, 36.24],
      name: "Hugh Chatham Memorial Hosital",
      osm: ["N", 12431788914],
    };
    const p = photon({
      "shop:supermarket": [shop],
      "amenity:hospital": [twinCounty],
      "healthcare:hospital": [hughChatham, twinCounty],
    });
    const r = await findPlaces(
      [36.5856, -81.5631],
      { http: p.http, endpoints: DEFAULT_ENDPOINTS, hospitals: async () => null },
      new OverpassMirrors(),
    );
    expect(tagsAsked(p.asked)).toEqual([
      ["/reverse", null, "shop:supermarket", "40"],
      ["/reverse", null, "highway:trailhead", "20"],
      ["/reverse", null, "amenity:hospital", "60"],
      ["/reverse", null, "healthcare:hospital", "60"],
    ]);
    expect(r.hospitalPool.map((h) => [h.name, h.er])).toEqual([
      ["Twin County Regional Hospital", undefined],
      ["Hugh Chatham Memorial Hosital", undefined],
    ]);
  });
});
