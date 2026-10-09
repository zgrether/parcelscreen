/**
 * The least-steep route when none fits the grade limit (owner, after 15c), on the replayed reference
 * parcels: the lowest cap that reaches the target, its stretches over the limit, and the report's sentence.
 * Three of the five goldens have no legal route (Macks Mountain to site #1; Ferney Creek to its house).
 */
import { describe, expect, it } from "vitest";
import { replayRun } from "@/test/support/session";
import { runFixture } from "@/test/support/scenarios";
import { loadFixture } from "@/test/support/fixtures";
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

describe("the least-steep route on the reference parcels", () => {
  it("Ferney Creek to site #1 at the real limit: routes as before, nothing over the limit", async () => {
    const { result } = await replayRun("ferney-creek-52-47A");
    expect(result.driveway!.routes.length).toBeGreaterThan(0);
    expect(result.driveway!.overLimit).toBeUndefined();
  });

  // Grayson since A3: Macks's #1 became its 9.6 ac bench, which has a legal route; Grayson's #1 still has none.
  it("Grayson Mud Creek to site #1: no legal route; the least-steep one is the lowest cap that reaches it", async () => {
    const { result, session } = await runFixture("grayson-mud-creek-6273");
    const d = result.driveway!;
    expect(d.routes).toEqual([]);
    const o = d.overLimit!;
    const cap = neededPct(o);
    expect(cap).toBeGreaterThan(10);
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
    expect(o.limitPct).toBe(10);
    // It keeps to the parcel: outside land only within entranceM of the entrance (owner, after #52).
    expect(o.metrics.outsideFt).toBeLessThanOrEqual(K.leastSteep.entranceM * M2FT);
    expect(o.needsEasement).toBe(false);
    expect(o.overSpans.length).toBeGreaterThan(0);
    expect(o.overFt).toBeCloseTo(o.overSpans.reduce((m, [a, b]) => m + b - a, 0) * M2FT, 6);
    // The prototype's note in full, unchanged; then the appended sentence (owner's wording, #52).
    expect(d.note).toBe(
      `Entrance found on ${d.entrances[0]!.name}, but no route reaches site #1 at 10% or less, even with switchbacks. Raise the grade limit in Settings or pick a different site. ${overLimitNote(o)}`,
    );
    const n = o.overSpans.length;
    expect(overLimitNote(o)).toBe(
      `The least-steep route found needs grades up to ${cap}%, with about ${Math.round(o.overFt)} ft steeper than 10% in ${n} stretch${n === 1 ? "" : "es"}; it's drawn on the map as suspect.`,
    );
    // No thousands separator, as the prototype's driveway notes; "stretch" for one.
    expect(overLimitNote({ ...o, overFt: 2018.4 })).toContain("about 2018 ft");
    expect(overLimitNote({ ...o, overSpans: [[0, 30]] })).toContain("in 1 stretch;");
  }, 120_000);

  it("Ferney Creek to its house: the same, from the house run", async () => {
    const fx = loadFixture("ferney-creek-52-47A");
    const { replayRun: _ } = { replayRun };
    void _;
    const { result } = await (
      await import("@/test/support/session")
    ).replayRun("ferney-creek-52-47A", {
      house: fx.input.house!.ll,
    });
    const o = result.driveway!.overLimit!;
    expect(result.driveway!.routes).toEqual([]);
    expect(neededPct(o)).toBeGreaterThan(10);
    expect(result.driveway!.note).toContain("no route reaches the existing house at 10% or less");
    expect(o.metrics.outsideFt).toBeLessThanOrEqual(K.leastSteep.entranceM * M2FT);
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
