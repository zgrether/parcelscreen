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
      settingsChanged: [],
      lines: false,
    });
  });

  it("names the settings that changed (polish #10), and none for a run kept without them", () => {
    const changed = { ...DEFAULT_USER_CONFIG, roadVetoGradePct: 31, budget: { readyToBuild: 1 } };
    const now = runKeys(square(-80.455), null, changed);
    expect(freshness(run, now).settingsChanged).toEqual(["roadVetoGradePct", "budget"]);
    const { settingsBy: _gone, ...older } = run;
    expect(freshness(older, now)).toMatchObject({ settings: true, settingsChanged: [] });
    // The endpoints aren't settings here: a moved service changes nothing.
    const moved = { ...DEFAULT_USER_CONFIG, endpoints: { ...DEFAULT_USER_CONFIG.endpoints, osrm: "https://x" } };
    expect(freshness(run, runKeys(square(-80.455), null, moved)).settingsChanged).toEqual([]);
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

  it("tells drawn lines apart (follow-up 34): a line added, moved or widened; none drawn is the empty key", () => {
    const track = {
      id: "a",
      kind: "track" as const,
      line: [
        [36.88, -80.455],
        [36.881, -80.454],
      ] as [number, number][],
      widthFt: null,
    };
    expect(run.lines).toBe("");
    const drawn = runKeys(square(-80.455), null, DEFAULT_USER_CONFIG, [track]);
    expect(freshness(run, drawn)).toMatchObject({ boundary: false, settings: false, lines: true });
    const easement = { ...track, kind: "easement" as const, widthFt: 30 };
    const wider = runKeys(square(-80.455), null, DEFAULT_USER_CONFIG, [{ ...easement, widthFt: 40 }]);
    expect(freshness(runKeys(square(-80.455), null, DEFAULT_USER_CONFIG, [easement]), wider).lines).toBe(
      true,
    );
    // A key kept before follow-up 34 has no lines: the same as none drawn.
    const { lines: _lines, ...older } = run;
    expect(freshness(older as typeof run, run).lines).toBe(false);
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
