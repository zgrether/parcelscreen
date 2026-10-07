import { describe, expect, it } from "vitest";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import { UserConfigSchema } from "../screen/types";
import { freshness, runKeys } from "./screenKeys";

const square = (x: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [x, 36.88],
      [x + 0.002, 36.88],
      [x + 0.002, 36.882],
      [x, 36.882],
      [x, 36.88],
    ],
  ],
});

describe("run keys and freshness (14d)", () => {
  const run = runKeys(square(-80.455), null, DEFAULT_USER_CONFIG);

  it("the same inputs are fresh", () => {
    expect(freshness(run, runKeys(square(-80.455), null, DEFAULT_USER_CONFIG))).toEqual({
      boundary: false,
      house: false,
      settings: false,
    });
  });

  it("tells the three cases apart: boundary, house, settings", () => {
    expect(freshness(run, runKeys(square(-80.454), null, DEFAULT_USER_CONFIG))).toMatchObject({
      boundary: true,
      house: false,
      settings: false,
    });
    expect(freshness(run, runKeys(square(-80.455), [36.881, -80.4545], DEFAULT_USER_CONFIG))).toMatchObject({
      boundary: false,
      house: true,
      settings: false,
    });
    const stricter = { ...DEFAULT_USER_CONFIG, houseMin: DEFAULT_USER_CONFIG.houseMin + 5 };
    expect(freshness(run, runKeys(square(-80.455), null, stricter))).toMatchObject({
      boundary: false,
      house: false,
      settings: true,
    });
  });

  it("settings ignore the service endpoints and the order of keys", () => {
    const moved = {
      ...DEFAULT_USER_CONFIG,
      endpoints: { ...DEFAULT_USER_CONFIG.endpoints, photon: "https://x/" },
    };
    expect(runKeys(square(-80.455), null, moved).settings).toBe(run.settings);
    const reordered = Object.fromEntries(
      Object.entries(DEFAULT_USER_CONFIG).reverse(),
    ) as typeof DEFAULT_USER_CONFIG;
    expect(runKeys(square(-80.455), null, reordered).settings).toBe(run.settings);
  });

  it("can't see the terrain preview (13g): it isn't part of the settings a run records", () => {
    // UserConfig is strict, so the preview's UI prefs can't ride along in it into the run keys.
    expect(UserConfigSchema.safeParse({ ...DEFAULT_USER_CONFIG, terrain: true }).success).toBe(false);
    expect(Object.keys(DEFAULT_USER_CONFIG).filter((k) => /terrain|hillshade|contour/i.test(k))).toEqual([]);
  });
});
