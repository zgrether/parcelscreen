/**
 * The steep-landing flag (B2b; owner, PR B decisions, 2026-10-10, and #101): a switchback the router refused on a
 * side slope over landingMaxSideSlopeDeg, found by searching again with that limit lifted. On a 30% plane a 10%
 * road can only climb by switching back; the side slope the router reads is set per cell.
 */
import { describe, expect, it } from "vitest";
import { drivewayFeatures } from "../render/resultGeo";
import { drivewayView, steepLandingLine } from "../report/driveway";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "./config";
import { rcToLL } from "./dem";
import { routeDriveway, steepLanding, type Entrance, type RouteContext, type SiteDriveway } from "./driveway";
import type { Dem, PartialScreenResult } from "./types";

const K = SCREEN_CONSTANTS.driveway;
const W = 90,
  H = 90;

/** A 30% plane rising north, every cell inside, with the side slope `sideDeg(c)` by column. */
function hillside(sideDeg: (c: number) => number): RouteContext {
  const d: Dem = {
    z: new Float32Array(W * H),
    w: W,
    h: H,
    x0: 500000,
    y0: 4080000,
    res: 3,
    resY: 3,
    source: "USGS 3DEP",
  };
  const slope = new Float32Array(W * H);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      d.z[r * W + c] = 0.3 * (H - r) * 3;
      slope[r * W + c] = sideDeg(c);
    }
  return {
    dFine: d,
    inside: new Uint8Array(W * H).fill(1),
    slope,
    soilMask: () => new Uint8Array(W * H),
    flowAcc: () => new Float32Array(W * H),
    dw: DEFAULT_USER_CONFIG.dw,
  };
}

const STEEP = K.landingMaxSideSlopeDeg + 5; // 40°: no landing
const ends = (ctx: RouteContext) => ({
  entrances: [{ ll: rcToLL(ctx.dFine, H - 3, 30) } as unknown as Entrance],
  to: rcToLL(ctx.dFine, 6, 30),
});
const none: SiteDriveway = { route: null, legal: false, entranceIndex: null };

describe("the steep-landing flag (B2b)", () => {
  it("no route avoids it: every switchback would sit on 40°, so none is found, and the flag says so", () => {
    const ctx = hillside(() => STEEP);
    const { entrances, to } = ends(ctx);
    expect(routeDriveway(ctx, entrances[0]!.ll, to, { maxGrade: 0.1, wGrade: 1, label: "x" })).toBeNull();
    const s = steepLanding(ctx, entrances, to, none, 10);
    expect(s).toMatchObject({ avoided: false });
    expect(s!.sideSlopeDeg).toBeCloseTo(STEEP, 3);
    expect(s!.atFt).toBeGreaterThan(0);
  });

  it("a route found anyway: the refused landing is flagged as gone around", () => {
    // Terrain where a route goes around a refused landing can't be built from one slope layer: the router's
    // cross-slope cost reads the same field, so steep ground is avoided whether a landing is allowed there or not.
    // So: the 40° hillside again, with a scored route from the same entrance (its grade, a switchback, on the parcel).
    const ctx = hillside(() => STEEP);
    const { entrances, to } = ends(ctx);
    const found = {
      metrics: { switchbacks: 2 },
      maxGrade: 0.1,
      needsEasement: false,
    } as unknown as NonNullable<SiteDriveway["route"]>;
    const s = steepLanding(ctx, entrances, to, { route: found, legal: true, entranceIndex: 0 }, 10);
    expect(s).toMatchObject({ avoided: true });
    expect(s!.sideSlopeDeg).toBeCloseTo(STEEP, 3);
  });

  it("a scored route with no switchback isn't searched again (owner, #101 Q3)", () => {
    const ctx = hillside(() => STEEP);
    const flat = { metrics: { switchbacks: 0 } } as unknown as NonNullable<SiteDriveway["route"]>;
    expect(steepLanding(ctx, [], [0, 0], { route: flat, legal: true, entranceIndex: 0 }, 10)).toBeNull();
  });

  it("the card's line and the map's flag, in the owner's words", () => {
    const at = { ll: [36.6, -81.5] as [number, number], atFt: 1234, sideSlopeDeg: 38.6 };
    expect(steepLandingLine({ ...at, avoided: true })).toBe(
      "A switchback near 1,230 ft would sit on a 39° side slope — too steep without retaining walls; route goes around it",
    );
    expect(steepLandingLine({ ...at, avoided: false })).toBe(
      "A switchback near 1,230 ft would sit on a 39° side slope — too steep without retaining walls; no route avoids it",
    );
    const r = {
      driveway: {
        toLabel: "site #1",
        entrances: [],
        routes: [],
        note: null,
        roadsNearestFt: null,
        practical: null,
        steepLanding: { ...at, avoided: false },
      },
    } as unknown as PartialScreenResult;
    expect(drivewayView(r)!.steepLanding).toBe(steepLandingLine({ ...at, avoided: false }));
    const pins = drivewayFeatures(r).entrances;
    expect(pins).toEqual([
      {
        key: "steep-landing",
        ll: at.ll,
        text: "!",
        tip: steepLandingLine({ ...at, avoided: false }),
        warn: true,
      },
    ]);
  });
});
