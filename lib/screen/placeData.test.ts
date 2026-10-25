import { describe, expect, it } from "vitest";
import { createHttpClient } from "../http";
import { cellOf, cellsWithin, placesFromHttp } from "./placeData";

describe("cells", () => {
  it("names a cell by its south-west corner, west longitudes rounding down", () => {
    expect(cellOf([36.598, -81.303])).toBe("36_-82");
    expect(cellOf([36.0, -82.0])).toBe("36_-82");
    expect(cellOf([35.999, -81.999])).toBe("35_-82");
  });

  it("lists the cells a radius touches: one in the middle of a cell, four at a corner", () => {
    expect(cellsWithin([36.5, -81.5], 30)).toEqual(["36_-82"]);
    expect(cellsWithin([36.01, -81.99], 30)).toEqual(["35_-83", "35_-82", "36_-83", "36_-82"]);
    // Mud Creek's 40 km grocery search reaches east into the next column.
    expect(cellsWithin([36.598, -81.303], 40)).toEqual(["36_-82", "36_-81"]);
  });
});

describe("placesFromHttp", () => {
  const cell = {
    version: 1,
    folder: "osm",
    cell: "36_-82",
    baked: "2026-10-25",
    places: [
      { kind: "grocer", id: "osm:node/1", name: "Food Lion", ll: [36.6, -81.3], src: "osm", big: true },
    ],
  };
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/osm/36_-82.json")) return new Response(JSON.stringify(cell), { status: 200 });
    if (url.endsWith("/osm/36_-81.json")) return new Response("oops", { status: 500 });
    return new Response("not found", { status: 404 });
  };
  const http = createHttpClient({ env: "node", fetchImpl, hostPolicies: {}, maxRetries: 0 });

  it("reads each cell, a missing one as empty", async () => {
    const read = placesFromHttp(http, "https://app.test/places/v1");
    expect(await read("osm", ["36_-82", "37_-82"])).toEqual(cell.places);
  });

  it("rejects when a cell fails otherwise", async () => {
    const read = placesFromHttp(http, "https://app.test/places/v1");
    await expect(read("osm", ["36_-82", "36_-81"])).rejects.toThrow(/36_-81: 500/);
  });
});
