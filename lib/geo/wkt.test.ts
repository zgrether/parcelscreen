import { area } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { M2_PER_ACRE } from "./types";
import { wktToGeo } from "./wkt";

describe("wktToGeo", () => {
  it("parses a POLYGON, keeping only x and y", () => {
    const g = wktToGeo("POLYGON ((0 0 5, 1 0 5, 1 1 5, 0 0 5))");
    expect(g?.geometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    });
  });

  it("keeps holes", () => {
    const g = wktToGeo("POLYGON ((0 0, 10 0, 10 10, 0 0), (1 1, 2 1, 2 2, 1 1))");
    expect(g?.geometry.coordinates).toHaveLength(2);
  });

  it("parses a MULTIPOLYGON into a MultiPolygon", () => {
    const g = wktToGeo("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))");
    expect(g?.geometry.type).toBe("MultiPolygon");
    expect(g?.geometry.coordinates).toHaveLength(2);
  });

  it("takes only the polygons from a GEOMETRYCOLLECTION", () => {
    const g = wktToGeo(
      "GEOMETRYCOLLECTION (POLYGON ((0 0, 1 0, 1 1, 0 0)), LINESTRING (0 0, 1 1), POLYGON ((5 5, 6 5, 6 6, 5 5)))",
    );
    expect(g?.geometry.type).toBe("MultiPolygon");
    expect(g?.geometry.coordinates).toHaveLength(2);
  });

  it("drops rings with fewer than four positions and returns null when nothing is left", () => {
    expect(wktToGeo("POLYGON ((0 0, 1 0, 0 0))")).toBeNull();
    expect(wktToGeo("GEOMETRYCOLLECTION EMPTY")).toBeNull();
    expect(wktToGeo("")).toBeNull();
  });

  // Real SDA output: every clipped map-unit polygon the prototype kept must come out identical.
  it.each(FIXTURE_SLUGS)(
    "reproduces the prototype's map-unit polygons from the recorded SDA response (%s)",
    (slug) => {
      const fx = loadFixture(slug);
      const sda = fx.har.log.entries.find(
        (e) => /sdmdataaccess/i.test(e.request.url) && /STIntersection/.test(e.request.postData?.text ?? ""),
      );
      expect(sda, "recorded SDA map-unit polygon query").toBeDefined();
      const [cols, ...rows] = (JSON.parse(sda!.response.content.text!) as { Table: string[][] }).Table;
      const w = cols!.indexOf("wkt");
      const parsed = rows
        .map((r) => wktToGeo(r[w] || ""))
        .filter((g) => g && area(g) / M2_PER_ACRE >= 0.02) // the prototype's sliver cut-off
        .map((g) => JSON.stringify(g));
      const golden = (fx.goldens.run.soilUnits as { geos: unknown[] }[]).flatMap((u) =>
        u.geos.map((g) => JSON.stringify(g)),
      );
      expect(golden.length).toBeGreaterThan(0);
      expect(parsed.sort()).toEqual(golden.sort());
    },
  );
});
