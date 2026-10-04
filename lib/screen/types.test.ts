import { describe, expect, it } from "vitest";
import { fromPrototype } from "../../test/support/fromPrototype";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { DEFAULT_USER_CONFIG } from "./config";
import { PartialScreenResultSchema, ScreenInputSchema, ScreenResultSchema, UserConfigSchema } from "./types";

const scenarios = FIXTURE_SLUGS.flatMap((slug) =>
  Object.entries(loadFixture(slug).goldens).map(([name, R]) => ({ label: `${slug} ${name}`, R: R! })),
);

describe("ScreenResult schema against the prototype goldens", () => {
  it.each(scenarios)("$label maps onto a valid ScreenResult (every field accounted for)", ({ R }) => {
    const parsed = ScreenResultSchema.safeParse(fromPrototype(R));
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it.each(scenarios)("$label survives a JSON round trip unchanged", ({ R }) => {
    const once = ScreenResultSchema.parse(fromPrototype(R));
    const twice = ScreenResultSchema.parse(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it("maps the prototype's renames", () => {
    const R = loadFixture("macks-mountain-35-3").goldens.run;
    const r = fromPrototype(R);
    expect(r.runAt).toBe(R.when);
    expect(r.terrain?.valleyFloorFt).toBe(R.valleyFloorFt);
    expect(r.terrain?.diag).toEqual(R.benchDiag);
    expect(r.soilUnits?.[0]?.geometries).toEqual((R.soilUnits as { geos: unknown[] }[])[0]!.geos);
    expect(r.failed).toEqual([]);
  });

  it("turns each route's shared entrance into an index", () => {
    const r = fromPrototype(loadFixture("ferney-creek-52-47A").goldens.run);
    const dw = r.driveway!;
    expect(dw.routes).toHaveLength(2);
    for (const rt of dw.routes) expect(dw.entrances[rt.entranceIndex]).toBeDefined();
    expect(dw.roadsNearestFt).toBeGreaterThan(0);
  });

  it("rejects fields it doesn't know (strict)", () => {
    const r = fromPrototype(loadFixture("macks-mountain-35-3").goldens.run);
    expect(ScreenResultSchema.safeParse({ ...r, surprise: 1 }).success).toBe(false);
    expect(ScreenResultSchema.safeParse({ ...r, sites: [{ ...r.sites![0], extra: true }] }).success).toBe(
      false,
    );
  });

  it("accepts a partial result mid-run (no verdict yet)", () => {
    const mid: Partial<ReturnType<typeof fromPrototype>> = {
      ...fromPrototype(loadFixture("macks-mountain-35-3").goldens.run),
    };
    delete mid.verdict;
    delete mid.cancelled;
    expect(PartialScreenResultSchema.safeParse(mid).success).toBe(true);
    expect(ScreenResultSchema.safeParse(mid).success).toBe(false);
  });
});

describe("UserConfig and ScreenInput", () => {
  it("the defaults are a valid UserConfig", () => {
    expect(UserConfigSchema.parse(DEFAULT_USER_CONFIG)).toEqual(DEFAULT_USER_CONFIG);
  });

  it("a fixture parcel with the defaults is a valid ScreenInput", () => {
    const { input } = loadFixture("ferney-creek-52-47A");
    const parsed = ScreenInputSchema.safeParse({
      polygon: input.polygon.geometry,
      config: DEFAULT_USER_CONFIG,
      house: input.house!.ll,
    });
    expect(parsed.success).toBe(true);
  });
});
