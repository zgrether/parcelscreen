/**
 * The least-steep route when none fits the grade limit (owner, after 15c), on the replayed reference
 * parcels: the lowest cap that reaches the target, its stretches over the limit, and the report's sentence.
 * Three of the five goldens have no legal route (Macks Mountain to site #1; Ferney Creek to its house).
 */
import { describe, expect, it } from "vitest";
import { replayRun } from "@/test/support/session";
import { runFixture } from "@/test/support/scenarios";
import { M2FT } from "./util";
import {
  buildDriveway,
  entranceCandidates,
  leastSteep,
  neededPct,
  overLimitNote,
  overLimitSpans,
  routeDriveway,
} from "./driveway";
import { SCREEN_CONSTANTS } from "./config";
import { routeContext } from "./index";

const K = SCREEN_CONSTANTS.driveway;

describe("overLimitSpans", () => {
  // 3 m steps: flat, 20% for 6 m, flat for 3 m, 15% for 3 m, then flat.
  const profile: [number, number][] = [
    [0, 100],
    [3, 100],
    [6, 100.6],
    [9, 101.2],
    [12, 101.2],
    [15, 101.65],
    [18, 101.65],
    [21, 101.65],
  ];
  it("over single steps, unmerged: each steep run is a stretch, in metres along the route", () => {
    expect(overLimitSpans(profile, 0.1, 3, 0)).toEqual([
      [3, 9],
      [12, 15],
    ]);
    expect(overLimitSpans(profile, 0.25, 3, 0)).toEqual([]);
  });
  it("merges stretches closer than mergeM", () => {
    expect(overLimitSpans(profile, 0.1, 3, 15)).toEqual([[3, 15]]);
  });
  it("over a 15 m window a single noisy step doesn't count", () => {
    // One 3 m step at 20% in 60 m of flat: a blip of 0.6 m.
    const blip: [number, number][] = Array.from({ length: 21 }, (_, i) => [i * 3, i === 10 ? 100.6 : 100]);
    expect(overLimitSpans(blip, 0.1, 3, 0)).toEqual([[27, 33]]);
    expect(overLimitSpans(blip, 0.1)).toEqual([]);
  });
});

/** A grade limit the fixtures' sites can't all meet, to exercise the least-steep path (A3b). */
const STRICT = 5;

describe("the least-steep route on the reference parcels", () => {
  it("Ferney Creek to site #1 at the real limit: routes as before, nothing over the limit", async () => {
    const { result } = await replayRun("ferney-creek-52-47A");
    expect(result.driveway!.routes.length).toBeGreaterThan(0);
    expect(result.driveway!.overLimit).toBeUndefined();
  });

  // Since A3b (follow-up 44) every fixture site has a route within the real 10% limit: the router used to skip
  // half its cells. The least-steep path is exercised at a stricter limit, on the real terrain.
  it("Grayson Mud Creek to site #1 at a 5% limit: no legal route; the least-steep one is the lowest cap that reaches it", async () => {
    const { result, session } = await runFixture("grayson-mud-creek-6273");
    const d = buildDriveway(
      routeContext(session),
      session.roads ?? [],
      session.parcel,
      result.sites![0]!.ll,
      "site #1",
      STRICT,
    );
    expect(d.routes).toEqual([]);
    const o = d.overLimit!;
    const cap = neededPct(o);
    expect(cap).toBeGreaterThan(STRICT);
    expect(cap).toBeLessThanOrEqual(K.leastSteep.maxPct);
    // One percent lower, neither routed entrance reaches the site.
    const ctx = routeContext(session);
    const to = result.sites![0]!.ll;
    for (const e of d.entrances.slice(0, K.entrancesRouted))
      expect(
        routeDriveway(ctx, e.ll, to, {
          maxGrade: (cap - 1) / 100,
          wGrade: K.leastSteep.wGrade,
          label: "x",
          insideExceptNearStartM: K.leastSteep.entranceM,
        }),
      ).toBeNull();
    expect(o.limitPct).toBe(STRICT);
    // It keeps to the parcel: outside land only within entranceM of the entrance (owner, after #52).
    // Outside land only near the entrance: no easement (the outside cells lie within entranceM of it, though
    // the path may wander inside that disc for longer than entranceM).
    expect(o.metrics.outsideFt).toBeLessThanOrEqual(SCREEN_CONSTANTS.driveway.easementOutsideFt);
    expect(o.needsEasement).toBe(false);
    expect(o.overSpans.length).toBeGreaterThan(0);
    expect(o.overFt).toBeCloseTo(o.overSpans.reduce((m, [a, b]) => m + b - a, 0) * M2FT, 6);
    // The prototype's note in full, unchanged; then the appended sentence (owner's wording, #52).
    expect(d.note).toBe(
      `Entrance found on ${d.entrances[0]!.name}, but no route reaches site #1 at ${STRICT}% or less, even with switchbacks. Raise the grade limit in Settings or pick a different site. ${overLimitNote(o)}`,
    );
    const n = o.overSpans.length;
    expect(overLimitNote(o)).toBe(
      `The least-steep route found needs grades up to ${cap}%, with about ${Math.round(o.overFt)} ft steeper than ${STRICT}% in ${n} stretch${n === 1 ? "" : "es"}; it's drawn on the map as suspect.`,
    );
    // No thousands separator, as the prototype's driveway notes; "stretch" for one.
    expect(overLimitNote({ ...o, overFt: 2018.4 })).toContain("about 2018 ft");
    expect(overLimitNote({ ...o, overSpans: [[0, 30]] })).toContain("in 1 stretch;");
  }, 120_000);

  // To a house, the note names it. On Grayson's terrain at 5%: Ferney's house has a route under any limit, since
  // buildDriveway's "gentlest" style keeps its own 8% cap (the prototype's), which a limit below 8% doesn't lower.
  it("to an existing house at a 5% limit: the same, the note naming the house", async () => {
    const HOUSE_STRICT = STRICT;
    const { result, session } = await runFixture("grayson-mud-creek-6273");
    const d = buildDriveway(
      routeContext(session),
      session.roads ?? [],
      session.parcel,
      result.sites![0]!.ll,
      "the existing house",
      HOUSE_STRICT,
    );
    const o = d.overLimit!;
    expect(d.routes).toEqual([]);
    expect(neededPct(o)).toBeGreaterThan(HOUSE_STRICT);
    expect(d.note).toContain(`no route reaches the existing house at ${HOUSE_STRICT}% or less`);
    // Outside land only near the entrance: no easement (the outside cells lie within entranceM of it, though
    // the path may wander inside that disc for longer than entranceM).
    expect(o.metrics.outsideFt).toBeLessThanOrEqual(SCREEN_CONSTANTS.driveway.easementOutsideFt);
    expect(o.needsEasement).toBe(false);
  }, 120_000);

  it("says so when nothing reaches the target even at the ceiling", async () => {
    const { session } = await replayRun("ferney-creek-52-47A");
    const { entrances } = entranceCandidates(session.roads ?? [], session.parcel, session.dFine!);
    expect(leastSteep(routeContext(session), entrances, [37.5, -80], 10)).toBeNull();
    // A target off the elevation grid: no route at any grade.
    const d = buildDriveway(
      routeContext(session),
      session.roads ?? [],
      session.parcel,
      [37.5, -80],
      "site #1",
      10,
    );
    expect(d.overLimit).toBeUndefined();
    expect(d.note).toMatch(
      /even with switchbacks. Raise the grade limit in Settings or pick a different site. No route reaches it even at 30%.$/,
    );
  }, 120_000);
});
