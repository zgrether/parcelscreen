/**
 * A4 (owner, #87 review and re-scope, 2026-10-09): the driveway. The gentlest style's cap under a lower grade limit,
 * the over-limit term scaled by the grade needed, and the scored route chosen by fewer points between the one within
 * the limit and the one kept to the parcel, with both shown on the site when they differ.
 */
import { describe, expect, it } from "vitest";
import { runFixture } from "../../test/support/scenarios";
import { SCREEN_CONSTANTS } from "./config";
import { buildDriveway, entranceCandidates, leastSteep, siteDriveways, type SiteDriveway } from "./driveway";
import { routeContext } from "./index";
import { chooseDriveway, drivewayChoiceLines, drivewayPoints } from "./score";

const C = SCREEN_CONSTANTS.score.drivewayCost;

/** A route at a cost and length; over the limit, one needing `neededPct` under a 10% limit. */
const dwOf = (o: { mid: number; ft: number; legal?: boolean; easement?: boolean; neededPct?: number }) =>
  ({
    route: {
      cost: { mid: o.mid },
      metrics: { lengthFt: o.ft },
      needsEasement: !!o.easement,
      maxGrade: (o.neededPct ?? 10) / 100,
      ...(o.legal === false ? { limitPct: 10 } : {}),
    },
    legal: o.legal !== false,
    entranceIndex: 0,
  }) as unknown as SiteDriveway;

describe("the gentlest style's cap is the lower of its own and the grade limit (A4)", () => {
  it("at a 6% limit, no route is steeper than 6%", async () => {
    const { result, session: s } = await runFixture("ferney-creek-52-47A");
    const ctx = routeContext(s);
    const sites = result.sites!;
    let legal = 0;
    for (const site of sites) {
      const dw = buildDriveway(ctx, s.roads ?? [], s.parcel, site.ll, "x", 6);
      for (const rt of dw.routes) expect(rt.maxGrade).toBeLessThanOrEqual(0.06);
      legal += dw.routes.length;
    }
    for (const r of siteDriveways(
      ctx,
      s.roads ?? [],
      s.parcel,
      sites.map((x) => x.ll),
      6,
    ))
      for (const d of [r.withinLimit, r.onParcel])
        if (d?.legal) expect(d.route!.maxGrade).toBeLessThanOrEqual(0.06);
    expect(legal).toBeGreaterThan(0); // some site does have a route within 6%
  }, 120_000);
});

describe("the scored route: the candidate with fewer points (A4)", () => {
  const easement = dwOf({ mid: 454_000, ft: 5176, easement: true });
  const own = dwOf({ mid: 382_000, ft: 4228, legal: false, neededPct: 11 });

  it("an 11% route on the parcel beats a 10% one that needs an easement", () => {
    expect(drivewayPoints(own)).toBeCloseTo(C.k * Math.log(1 + 382_000 / C.c0) + 1, 9);
    expect(drivewayPoints(easement)).toBeCloseTo(C.k * Math.log(1 + 454_000 / C.c0) + C.easement, 9);
    expect(chooseDriveway({ withinLimit: easement, onParcel: own })).toBe(own);
  });

  // At 20% and over the over-limit term is the full 10, the same as the easement's, so the cost decides.
  it("a 22% route on the parcel that costs more loses to the easement route", () => {
    const steep = dwOf({ mid: 500_000, ft: 4228, legal: false, neededPct: 22 });
    expect(chooseDriveway({ withinLimit: easement, onParcel: steep })).toBe(easement);
  });

  it("a tie goes to the route within the limit; a route on the parcel within the limit is both", () => {
    const a = dwOf({ mid: 100_000, ft: 1000 });
    const b = dwOf({ mid: 100_000, ft: 1000 });
    expect(chooseDriveway({ withinLimit: a, onParcel: b })).toBe(a);
    expect(chooseDriveway({ withinLimit: a, onParcel: a })).toBe(a);
    expect(chooseDriveway({ withinLimit: null, onParcel: own })).toBe(own);
    expect(chooseDriveway({ withinLimit: null, onParcel: null }).route).toBeNull();
  });

  it("the site shows both when they differ, the scored one first, in the owner's wording", () => {
    expect(drivewayChoiceLines({ withinLimit: easement, onParcel: own }, 10)).toEqual([
      "Best on your land: 11%, 4228 ft",
      "Within 10% only via neighbouring land (needs an easement): 5176 ft",
    ]);
    const steep = dwOf({ mid: 500_000, ft: 4228, legal: false, neededPct: 22 });
    expect(drivewayChoiceLines({ withinLimit: easement, onParcel: steep }, 10)).toEqual([
      "Within 10% only via neighbouring land (needs an easement): 5176 ft",
      "Best on your land: 22%, 4228 ft",
    ]);
    expect(drivewayChoiceLines({ withinLimit: null, onParcel: own }, 10)).toEqual([
      "Best on your land: 11%, 4228 ft",
    ]);
    const onLand = dwOf({ mid: 100_000, ft: 1000 });
    expect(drivewayChoiceLines({ withinLimit: onLand, onParcel: onLand }, 10)).toEqual([]);
  });
});

describe("Grayson's sites, scored on the route kept to the parcel (A4)", () => {
  it("each site's on-parcel candidate is leastSteep's route, and it is the one scored", async () => {
    const { result, session: s } = await runFixture("grayson-mud-creek-6273");
    const ctx = routeContext(s);
    const limit = s.config.roadMaxGradePct;
    const sites = result.sites!;
    const routes = siteDriveways(
      ctx,
      s.roads ?? [],
      s.parcel,
      sites.map((x) => x.ll),
      limit,
    );
    const ent = entranceCandidates(s.roads ?? [], s.parcel, ctx.dFine).entrances;
    sites.forEach((site, i) => {
      const r = routes[i]!;
      expect(r.withinLimit?.route?.needsEasement).toBe(true);
      expect(r.onParcel?.legal).toBe(false);
      expect(r.onParcel!.route).toEqual(leastSteep(ctx, ent, site.ll, limit));
      expect(chooseDriveway(r)).toBe(r.onParcel);
      expect(site.c.driveway).toBeCloseTo(drivewayPoints(r.onParcel!), 9);
      expect(site.driveFt).toBe(r.onParcel!.route!.metrics.lengthFt);
      expect(site.why.slice(-2)).toEqual(drivewayChoiceLines(r, limit));
    });
    // #1: 11% and 4,228 ft on the parcel, against 5,176 ft within 10% through the neighbours.
    expect(sites[0]!.why.slice(-2)).toEqual([
      "Best on your land: 11%, 4228 ft",
      "Within 10% only via neighbouring land (needs an easement): 5176 ft",
    ]);
  }, 120_000);
});
