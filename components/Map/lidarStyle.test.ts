import { describe, expect, it } from "vitest";
import { SLOPE_BANDS } from "@/lib/render/surface";
import { slopeBandLabels } from "./LidarControls";
import {
  LIDAR_ATTRIBUTION,
  LIDAR_MIN_ZOOM,
  LIDAR_SERVICE,
  lidarLayers,
  lidarSources,
  lidarTiles,
  renderingRule,
  slopeBreaks,
} from "./lidarStyle";

describe("lidar terrain's tiles (step 14c)", () => {
  it("asks USGS's exportImage for each tile's own Web Mercator box, as a 256 px PNG", () => {
    const url = lidarTiles("relief");
    expect(url.startsWith(`${LIDAR_SERVICE}?`)).toBe(true);
    expect(url).toContain("bbox={bbox-epsg-3857}");
    const q = new URL(url.replace("{bbox-epsg-3857}", "0,0,1,1")).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      bboxSR: "3857",
      imageSR: "3857",
      size: "256,256",
      format: "png",
      f: "image",
    });
    expect(JSON.parse(q.get("renderingRule")!)).toEqual({ rasterFunction: "Hillshade Multidirectional" });
  });

  it("classes Slope by the app's own bands, as degrees, in their colours", () => {
    expect(slopeBreaks()).toEqual([8.53, 14.04, 21.8]);
    const rule = renderingRule("slope") as {
      rasterFunction: string;
      rasterFunctionArguments: {
        Colormap: number[][];
        Raster: {
          rasterFunctionArguments: { InputRanges: number[]; OutputValues: number[]; Raster: unknown };
        };
      };
    };
    expect(rule.rasterFunction).toBe("Colormap");
    expect(rule.rasterFunctionArguments.Colormap).toEqual(
      SLOPE_BANDS.map((b, i) => [i + 1, b.rgba[0], b.rgba[1], b.rgba[2]]),
    );
    const remap = rule.rasterFunctionArguments.Raster.rasterFunctionArguments;
    expect(remap.InputRanges).toEqual([0, 8.53, 8.53, 14.04, 14.04, 21.8, 21.8, 90]);
    expect(remap.OutputValues).toEqual([1, 2, 3, 4]);
    expect(remap.Raster).toEqual({ rasterFunction: "Slope Degrees" });
    expect(slopeBandLabels()).toEqual(["up to 15%", "15–25%", "25–40%", "over 40%"]);
  });

  it("has a source and a hidden layer per style, from zoom 13, credited to USGS", () => {
    const sources = lidarSources();
    expect(Object.keys(sources)).toEqual(["lidar-relief", "lidar-slope"]);
    for (const s of Object.values(sources)) {
      expect(s.minzoom).toBe(LIDAR_MIN_ZOOM);
      expect(s.attribution).toBe(LIDAR_ATTRIBUTION);
    }
    for (const l of lidarLayers()) {
      expect(l.layout).toEqual({ visibility: "none" });
      expect((l.paint as Record<string, number>)["raster-opacity"]).toBe(0.6);
    }
  });
});
