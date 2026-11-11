/**
 * The elevation's labels (docs/plans/existing-house.md §3): with 3DEP every string is as it was; with the Terrain Tiles
 * fallback, every label downstream of the elevation names it.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { drivewayView } from "./driveway";
import { DEM_TILES, elevationOf, fallbackNote, relabel } from "./elevation";
import { sunView } from "./sun";
import { terrainView } from "./terrain";
import { SOURCE, BOULDERS, WATER } from "../uses/words";

const tiles = elevationOf({ demSource: DEM_TILES, demResM: 8 });
const lidar = elevationOf({ demSource: "USGS 3DEP", demResM: 3 });

describe("the elevation's labels", () => {
  it("leave every 3DEP string as it was, and an older result's (no source: it was 3DEP)", () => {
    for (const s of [SOURCE.lidar, SOURCE.dem, BOULDERS.honesty, BOULDERS.noGrid, WATER.noFlow])
      for (const e of [lidar, elevationOf({})]) expect(relabel(s, e)).toBe(s);
  });

  it("name the Terrain Tiles when 3DEP fell back", () => {
    expect(relabel(SOURCE.lidar, tiles)).toBe("AWS Terrain Tiles (NED/SRTM), not lidar (our estimate)");
    expect(relabel(SOURCE.dem, tiles)).toBe("AWS Terrain Tiles (NED/SRTM), not lidar");
    expect(relabel(WATER.noFlow, tiles)).toBe(
      "The 8 m Terrain Tiles elevation didn't load: grade again for flow and wet ground",
    );
    expect(relabel(BOULDERS.rough, tiles)).toBe("rough Terrain Tiles elevation texture");
    expect(relabel(BOULDERS.honesty, tiles)).not.toMatch(/\blidar\b/);
  });

  it("reach the Terrain note, the driveway's method and the horizon on a fallback result", () => {
    const r = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
    const plain = { t: terrainView(r), d: drivewayView(r), s: sunView(r, null) };
    r.demSource = DEM_TILES;
    r.demResM = 8;
    const t = terrainView(r)!;
    expect(JSON.stringify(t)).toContain(fallbackNote(DEM_TILES));
    expect(fallbackNote(DEM_TILES)).toBe(
      "from AWS Terrain Tiles (NED/SRTM) — USGS 3DEP was unavailable; grade again to try 3DEP again",
    );
    const words = JSON.stringify([drivewayView(r), sunView(r, null)]);
    expect(words).toContain("over the 8 m Terrain Tiles elevation");
    expect(words).toContain("bare-earth terrain from Terrain Tiles elevation");
    expect(words).not.toMatch(/\blidar\b/);
    // And with 3DEP, as before.
    expect(JSON.stringify(plain)).toContain("lidar");
  });
});
