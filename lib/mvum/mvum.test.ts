import { describe, expect, it } from "vitest";
import { tileOfBbox, tileUrl } from "../offline/tiles";
import { datesInWords, isSeasonal, routeClass, routeLines, MVUM_WORDS as W } from "./card";
import { MVUM_FALLBACK_URL, MVUM_PAGES, mvumPage } from "./forests";
import { mvumTemplate, parseRoutes, type RouteProps } from "./source";

/** Routes as the MVUM returned them near Mount Rogers and Pond Mountain (the step 16 probe). */
const BALD_KNOB: RouteProps = {
  objectid: 16937715,
  id: "60061",
  name: "BALD KNOB",
  symbol: "4",
  seasonal: "seasonal",
  passengervehicle: "open",
  passengervehicle_datesopen: "09/12-01/18",
  highclearancevehicle: "open",
  highclearancevehicle_datesopen: "09/12-01/18",
  forestname: "Cherokee National Forest",
  districtname: "Watauga Ranger District",
};
const IRON_MOUNTAIN: RouteProps = {
  objectid: 1,
  id: "301",
  name: "IRON MOUNTAIN",
  symbol: "9",
  seasonal: "yearlong",
  motorcycle: "open",
  motorcycle_datesopen: "01/01-12/31",
  forestname: "George Washington and Jefferson National Forest",
  districtname: "Mount Rogers National Recreation Area",
};

describe("Motor-vehicle routes' classes (step 16, plan §3.2)", () => {
  it("names what each MVUM symbol allows", () => {
    expect(["1", "2"].map((s) => routeClass("roads", s))).toEqual(["all", "all"]);
    expect(["3", "4"].map((s) => routeClass("roads", s))).toEqual(["highway", "highway"]);
    expect(["11", "12"].map((s) => routeClass("roads", s))).toEqual(["special", "special"]);
    expect(["5", "6"].map((s) => routeClass("trails", s))).toEqual(["all", "all"]);
    expect(["7", "8", "16", "17"].map((s) => routeClass("trails", s))).toEqual(["atv", "atv", "atv", "atv"]);
    expect(["9", "10"].map((s) => routeClass("trails", s))).toEqual(["motorcycle", "motorcycle"]);
    expect(routeClass("trails", "12")).toBe("special");
  });

  it("dashes the seasonal ones", () => {
    expect(isSeasonal(BALD_KNOB)).toBe(true);
    expect(isSeasonal(IRON_MOUNTAIN)).toBe(false);
  });
});

describe("the route card (plan §4)", () => {
  it("reads MVUM's dates in words, one range or several", () => {
    expect(datesInWords("04/01-01/10")).toBe("Apr 1 – Jan 10");
    expect(datesInWords("01/01-01/10,04/01-05/21,09/01-12/31")).toBe(
      "Jan 1 – Jan 10, Apr 1 – May 21, Sep 1 – Dec 31",
    );
    expect(datesInWords("")).toBeNull();
    expect(datesInWords("spring")).toBeNull();
  });

  it("says the route's name and number, what's allowed, its season, its forest and when the data was read", () => {
    expect(routeLines("roads", BALD_KNOB, "2026-10-28")).toEqual([
      "Bald Knob (FS 60061)",
      "Highway-legal vehicles only",
      "Open to passenger vehicles, high-clearance vehicles",
      "Seasonal: open Sep 12 – Jan 18",
      "Cherokee National Forest, Watauga Ranger District",
      "Forest Service MVUM data, read 2026-10-28.",
    ]);
    expect(routeLines("trails", IRON_MOUNTAIN, "2026-10-28").slice(0, 4)).toEqual([
      "Iron Mountain (FS 301)",
      "Motorcycles only",
      "Open to motorcycles",
      W.allYear,
    ]);
  });

  it("asks one fixed box a tile, Forest Service system routes only", () => {
    const url = new URL(tileUrl(mvumTemplate("trails"), { z: 11, x: 560, y: 801 }));
    expect(url.pathname).toBe("/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/2/query");
    expect(url.searchParams.get("where")).toBe("symbol IN ('5','6','7','8','9','10','11','12','16','17')");
    expect(tileOfBbox(url.searchParams.get("geometry")!)).toEqual({ z: 11, x: 560, y: 801 });
    expect(new URL(tileUrl(mvumTemplate("roads"), { z: 11, x: 1, y: 1 })).searchParams.get("where")).toBe(
      "symbol IN ('1','2','3','4','11','12')",
    );
  });

  it("reads an answer's routes, and an error as no answer", () => {
    const line = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-81.75, 36.52],
          [-81.74, 36.53],
        ],
      },
      properties: { ...BALD_KNOB, symbol: 4 },
    };
    expect(parseRoutes({ type: "FeatureCollection", features: [line] })?.[0]?.properties.symbol).toBe("4");
    expect(parseRoutes({ error: { code: 500 } })).toBeNull();
  });

  it("links each route to its forest's own MVUM page, and any other forest to the Forest Service's", () => {
    expect(mvumPage(IRON_MOUNTAIN.forestname)).toBe(
      "https://www.fs.usda.gov/r08/gwj/maps-guides/motor-vehicle-use-map",
    );
    expect(mvumPage(BALD_KNOB.forestname)).toBe("https://www.fs.usda.gov/r08/cherokee/maps-guides");
    expect(mvumPage("National Forests in North Carolina")).toBe(
      "https://www.fs.usda.gov/r08/northcarolina/maps-guides",
    );
    expect(mvumPage("Pisgah National Forest")).toBe(mvumPage("National Forests in North Carolina"));
    expect(mvumPage("White Mountain National Forest")).toBe(MVUM_FALLBACK_URL);
    expect(mvumPage(null)).toBe(MVUM_FALLBACK_URL);
    // No forest matches another's pattern.
    for (const p of MVUM_PAGES)
      expect(
        MVUM_PAGES.filter((q) => q.match.test(`${p.forest} National Forest`)).map((q) => q.forest),
      ).toEqual([p.forest]);
  });
});
