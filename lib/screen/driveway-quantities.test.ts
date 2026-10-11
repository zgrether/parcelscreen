/**
 * The driveway quantity corrections, relief culverts and "no practical drive" (owner, #99 decisions, 2026-10-11).
 * The fixture routes before and after: docs/studies/driveway-quantities.md (pnpm dw:quant).
 */
import { describe, expect, it } from "vitest";
import { runFixture } from "../../test/support/scenarios";
import { SCREEN_CONSTANTS } from "./config";
import {
  practicalAlternatives,
  reliefCulverts,
  roadCut,
  siteDriveways,
  type PracticalAlternatives,
  type SiteDriveway,
} from "./driveway";
import { routeContext } from "./index";
import {
  drivewayPoints,
  impracticalLine,
  isImpractical,
  overLimitPoints,
  practicalDriveway,
  practicalOutcome,
  withoutVetoed,
} from "./score";
import { M2FT } from "./util";

const K = SCREEN_CONSTANTS.driveway;
const W = K.benchWidthM;
const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);

/** A profile every 3 m over `ft` at a steady `pct` grade. */
const steady = (ft: number, pct: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let s = 0; s <= ft / M2FT + 1e-9; s += K.profileStepM) out.push([s, (s * pct) / 100]);
  return out;
};

/** A driveway candidate at a cost, length and 30 m grade; `limitPct` makes it one over the limit. */
const dwOf = (o: {
  mid: number;
  ft: number;
  pct: number;
  switchbacks?: number;
  easement?: boolean;
  limitPct?: number;
}): SiteDriveway =>
  ({
    route: {
      cost: { low: o.mid * 0.7, mid: o.mid, high: o.mid * 1.3 },
      metrics: { lengthFt: o.ft, maxGradePct: o.pct, switchbacks: o.switchbacks ?? 0 },
      profile: steady(o.ft, o.pct),
      needsEasement: !!o.easement,
      maxGrade: o.pct / 100,
      ...(o.limitPct != null ? { limitPct: o.limitPct } : {}),
    },
    legal: o.limitPct == null,
    entranceIndex: 0,
  }) as unknown as SiteDriveway;

describe("the road's cut (correction 1 and 2)", () => {
  it("is a balanced half bench under 30°, a full bench steeper", () => {
    expect(K.fullBenchSlopeDeg).toBe(30);
    expect(roadCut(20, NaN).m2).toBeCloseTo((W * W * tan(20)) / 8, 12);
    expect(roadCut(29.9, NaN).m2).toBeCloseTo((W * W * tan(29.9)) / 8, 12);
    expect(roadCut(30, NaN).m2).toBeCloseTo((W * W * tan(30)) / 2, 12);
    expect(roadCut(0, NaN)).toEqual({ m2: 0, rockM2: 0 });
  });

  it("is rock only below the bedrock: the triangle's share ((H − b) / H)², never more than the cut", () => {
    const H = (W / 2) * tan(20); // 0.666 m at the hillside edge
    expect(roadCut(20, NaN).rockM2).toBe(0); // no bedrock reported
    expect(roadCut(20, 100).rockM2).toBe(0); // deeper than the cut
    const c = roadCut(20, 50);
    expect(c.rockM2 / c.m2).toBeCloseTo(((H - 0.5) / H) ** 2, 12);
    // The prototype's share could top 100% (the cost check's §4); bedrock at the surface is all rock, no more.
    expect(roadCut(20, 0).rockM2).toBeCloseTo(roadCut(20, 0).m2, 12);
    for (const deg of [5, 15, 25, 35, 45])
      for (const cm of [0, 20, 38, 94, 200]) {
        const x = roadCut(deg, cm);
        expect(x.rockM2).toBeGreaterThanOrEqual(0);
        expect(x.rockM2).toBeLessThanOrEqual(x.m2 + 1e-12);
      }
  });
});

describe("relief culverts", () => {
  it("one per 400, 300, 200 or 150 ft by the grade over 30 m, rounded", () => {
    expect(reliefCulverts([])).toBe(0);
    expect(reliefCulverts(steady(1200, 0))).toBe(3);
    expect(reliefCulverts(steady(1200, 5))).toBe(3); // ≤ 5%: every 400 ft
    expect(reliefCulverts(steady(1200, 8))).toBe(4); // 5–10%: every 300 ft
    expect(reliefCulverts(steady(2000, 12))).toBe(10); // 10–15%: every 200 ft
    expect(reliefCulverts(steady(1500, 18))).toBe(10); // steeper: every 150 ft
    expect(reliefCulverts(steady(100, 12))).toBe(0); // half a culvert rounds down
  });

  it("reads the grade where it is: a flat run then a steep one", () => {
    const flat = steady(1200, 0);
    const end = flat[flat.length - 1]!;
    const steep = steady(600, 12)
      .slice(1)
      .map(([s, z]): [number, number] => [end[0] + s, end[1] + z]);
    // 3 on the flat, 3 on the steep part, give or take the 30 m where the windows straddle the bend.
    expect(reliefCulverts([...flat, ...steep])).toBe(6);
  });
});

describe('"no practical drive"', () => {
  const ready = 300_000;
  it("is a scored route over 75% of the ready-to-build budget", () => {
    expect(K.impracticalShareOfReadyToBuild).toBe(0.75);
    expect(isImpractical(dwOf({ mid: 225_000, ft: 3000, pct: 10 }), ready)).toBe(false);
    expect(isImpractical(dwOf({ mid: 225_001, ft: 3000, pct: 10 }), ready)).toBe(true);
    expect(isImpractical(dwOf({ mid: 250_000, ft: 3000, pct: 10 }), 400_000)).toBe(false);
    expect(isImpractical({ route: null, legal: false, entranceIndex: null }, ready)).toBe(false);
  });

  const chosen = dwOf({ mid: 375_000, ft: 5940, pct: 11, limitPct: 10, switchbacks: 12 });
  const steeper = dwOf({ mid: 166_000, ft: 2888, pct: 15, limitPct: 10, switchbacks: 5 });
  const easement = dwOf({ mid: 314_000, ft: 6233, pct: 10, easement: true, switchbacks: 14 });

  it("scores the alternative with fewer points, whatever the chosen route's", () => {
    expect(drivewayPoints(steeper)).toBeLessThan(drivewayPoints(easement));
    expect(practicalDriveway(chosen, { steeper, easement })).toBe(steeper);
    expect(practicalDriveway(chosen, { steeper: null, easement })).toBe(easement);
    expect(practicalDriveway(chosen, { steeper: null, easement: null })).toBe(chosen);
    expect(practicalDriveway(chosen, null)).toBe(chosen);
  });

  it("the 15% alternative's over-limit term reads its design limit, not the ground (option C)", () => {
    // Grayson's 15% route reads about 17.9% over 30 m on the ungraded ground: +13.7 by the ground, +5 by design.
    const ground = dwOf({ mid: 166_000, ft: 2888, pct: 17.9, limitPct: 10 });
    expect(overLimitPoints(ground)).toBeCloseTo(5 + (2.9 / 5) * 15, 9);
    expect(overLimitPoints({ ...ground, designPct: K.practicalMaxPct })).toBe(5);
    // The veto still reads the ground.
    const steep = { ...dwOf({ mid: 120_000, ft: 2000, pct: 21, limitPct: 10 }), designPct: 15 };
    expect(withoutVetoed({ steeper: steep, easement: null }, 20).steeper).toBeNull();
  });

  it("drops an alternative the veto (20%) rules out", () => {
    const steep = dwOf({ mid: 120_000, ft: 2000, pct: 21, limitPct: 10 });
    expect(withoutVetoed({ steeper: steep, easement }, 20)).toEqual({ steeper: null, easement });
  });

  it("reads: the limit, why, the alternatives, the one scored", () => {
    const alt: PracticalAlternatives = { steeper, easement };
    const p = practicalOutcome(chosen, alt, 10, ready);
    expect(p).toMatchObject({
      limitPct: 10,
      steeperPct: 15,
      readyToBuild: ready,
      share: 0.75,
      scoredOn: "steeper",
    });
    expect(p.easement!.pavedFt).toBe(0);
    expect(impracticalLine(p)).toBe(
      "No practical drive at your 10% limit: the best route found costs about $263–488k, more than 75% of your " +
        "$300k ready-to-build budget. At 15%: 2,888 ft on your land, 5 switchbacks, about $116–216k of gravel " +
        "work, paving on ~2,884 ft (cost TBD); county limit to check (follow-up 46). Within 10% via neighbouring " +
        "land (needs an easement): 6,233 ft, about $220–408k. Scored on the route at 15%.",
    );
    // A gentler steep route needs no paving; no alternatives at all says so.
    const gentle = dwOf({ mid: 166_000, ft: 2888, pct: 11, limitPct: 10, switchbacks: 1 });
    expect(
      impracticalLine(practicalOutcome(chosen, { steeper: gentle, easement: null }, 10, ready)),
    ).toContain(
      "1 switchback, about $116–216k of gravel work; county limit to check (follow-up 46). Scored on the route at 15%.",
    );
    expect(impracticalLine(practicalOutcome(chosen, { steeper: null, easement: null }, 10, ready))).toMatch(
      /budget\. No route at 15% on your land, or within 10% through the neighbours, was found\.$/,
    );
    // At a limit of practicalMaxPct or more there's no steeper alternative to look for (#103 decisions).
    expect(impracticalLine(practicalOutcome(chosen, { steeper: null, easement: null }, 15, ready))).toMatch(
      /budget\. No route within 15% through the neighbours was found\.$/,
    );
  });

  it("at the 15% default there's no steeper alternative: the rule offers the route through the neighbours (#103)", async () => {
    expect(SCREEN_CONSTANTS.driveway.practicalMaxPct).toBe(15);
    const { result, session: s } = await runFixture("grayson-mud-creek-6273");
    expect(s.config.roadMaxGradePct).toBe(15);
    const ctx = routeContext(s);
    const lls = result.sites!.map((x) => x.ll);
    const routes = siteDriveways(ctx, s.roads ?? [], s.parcel, lls, 15);
    const at15 = practicalAlternatives(ctx, s.roads ?? [], s.parcel, lls, routes, 15);
    expect(at15.every((a) => a.steeper === null)).toBe(true);
    // Under a 10% limit it's still looked for.
    const at10 = practicalAlternatives(ctx, s.roads ?? [], s.parcel, lls.slice(0, 1), routes.slice(0, 1), 10);
    expect(at10[0]!.steeper?.designPct).toBe(15);
  }, 120_000);
});

describe("geotextile only on bottomland and poorly drained soils (correction 4)", () => {
  it("Grayson's poorly drained soils are masked, inside the outline only", async () => {
    const { session: s } = await runFixture("grayson-mud-creek-6273");
    const ctx = routeContext(s);
    const wet = ctx.wetSoil!();
    let n = 0;
    for (let i = 0; i < wet.length; i++)
      if (wet[i]) {
        n++;
        expect(ctx.inside[i]).toBe(1);
      }
    expect(n).toBeGreaterThan(0);
    // Macks has none: Ramsey, Berks–Gilpin and Marbleyard–Unicoi are well drained or better.
    const macks = routeContext((await runFixture("macks-mountain-35-3")).session);
    expect(macks.wetSoil!().some((x) => x === 1)).toBe(false);
  }, 120_000);
});
