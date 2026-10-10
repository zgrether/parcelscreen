/**
 * A4b (owner, 2026-10-10): a route's grade over 30 m of its profile, the ground between the cells interpolated, and
 * the veto: a candidate steeper than the user's veto grade over 30 m can't be chosen; when every candidate is, the
 * least steep is shown under "No practical route found".
 */
import { describe, expect, it } from "vitest";
import { drivewayView, GROUND_GRADE_NOTE } from "@/lib/report/driveway";
import { runFixture } from "../../test/support/scenarios";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "./config";
import { rcToLL } from "./dem";
import { gradeOver, leastSteep, routeDriveway, type Entrance, type SiteRoutes } from "./driveway";
import { chooseDriveway, drivewayPoints, grade30, noPracticalLine } from "./score";
import type { Dem } from "./types";

describe("a route's grade over a window of its profile", () => {
  it("is the steepest rise over at least the window, not a single 3 m step", () => {
    // 3 m steps: flat, one 1.5 m jump (50% over 3 m), then flat again.
    const p: [number, number][] = Array.from({ length: 41 }, (_, i) => [i * 3, i >= 20 ? 1.5 : 0]);
    expect(gradeOver(p, 3)).toBeCloseTo(50, 9);
    expect(gradeOver(p, 15)).toBeCloseTo(10, 9);
    expect(gradeOver(p, 30)).toBeCloseTo(5, 9);
    expect(gradeOver(p, 200)).toBe(0); // shorter than the window: nothing to measure
  });
});

/**
 * The parcel is a strip two cells wide running north up a 30% scarp: kept to it, the only way up climbs at about
 * 21% (the steepest diagonal of a 2-cell strip). Off the parcel the scarp is a cliff except a gentle 5.5% ramp far to
 * the east, so the route within a 10% limit is long, costly, and needs an easement.
 */
function scarp(withRamp: boolean) {
  const W = 500,
    H = 110,
    RES = 3;
  const d: Dem = {
    z: new Float32Array(W * H),
    w: W,
    h: H,
    x0: 500000,
    y0: 4080000,
    res: RES,
    resY: RES,
    source: "USGS 3DEP",
  };
  const STRIP = [30, 31];
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const u = c * RES,
        v = (H - r) * RES; // metres east, and north from the bottom row
      const width = STRIP.includes(c) ? 11 / 0.3 : withRamp && u >= 1400 ? 200 : 3;
      d.z[r * W + c] = 11 * Math.min(1, Math.max(0, (v - 100) / width));
    }
  const inside = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) for (const c of STRIP) inside[r * W + c] = 1;
  const ctx = {
    dFine: d,
    inside,
    slope: new Float32Array(W * H),
    soilMask: () => new Uint8Array(W * H),
    flowAcc: () => new Float32Array(W * H),
    dw: DEFAULT_USER_CONFIG.dw,
  };
  const from = rcToLL(d, H - 4, 30),
    to = rcToLL(d, 10, 30);
  const entrance = { ll: from } as unknown as Entrance;
  const K = SCREEN_CONSTANTS.driveway;
  const within = routeDriveway(ctx, from, to, {
    maxGrade: 0.1,
    wGrade: K.shortest.wGrade,
    label: K.shortest.label,
  });
  const onParcel = leastSteep(ctx, [entrance], to, 10);
  const routes: SiteRoutes = {
    withinLimit: within ? { route: within, legal: true, entranceIndex: 0 } : null,
    onParcel: onParcel ? { route: onParcel, legal: false, entranceIndex: 0 } : null,
  };
  return routes;
}

describe("the veto (driveway.vetoGradePct, Settings)", () => {
  it("the only way kept to the parcel is ~21%; the gentle route needs an easement and costs more; the veto picks it", () => {
    const r = scarp(true);
    const steep = r.onParcel!,
      gentle = r.withinLimit!;
    expect(Math.round(steep.route!.maxGrade * 100)).toBe(22); // the least-steep cap a 2-cell strip allows
    expect(grade30(steep)).toBeGreaterThan(20); // ground over 30 m: vetoed at 20
    expect(gentle.route!.needsEasement).toBe(true);
    expect(grade30(gentle)).toBeLessThanOrEqual(20);
    expect(gentle.route!.cost.mid).toBeGreaterThan(steep.route!.cost.mid);
    // Without the veto the steep route wins on points (its +20 against the easement's +10 and a far higher cost)…
    expect(drivewayPoints(steep)).toBeLessThan(drivewayPoints(gentle));
    expect(chooseDriveway(r)).toBe(steep);
    // …and with it, it can't be chosen.
    const chosen = chooseDriveway(r, DEFAULT_USER_CONFIG.roadVetoGradePct);
    expect(chosen).toBe(gentle);
    expect(chosen.noPractical).toBeUndefined();
  });

  it("when every candidate is vetoed, the least steep is shown, flagged", () => {
    const r = scarp(false);
    expect(r.withinLimit).toBeNull(); // no route within 10% anywhere
    const chosen = chooseDriveway(r, 20);
    expect(chosen.noPractical).toBe(true);
    expect(chosen.route).toBe(r.onParcel!.route);
    expect(noPracticalLine(chosen, 20)).toMatch(
      /^No practical route found: every driveway route is steeper than 20% over 30 m; the least steep \(\d+% over 30 m\) is shown\.$/,
    );
  });

  it("a whole screen with every route vetoed (Ferney at a 3% veto): the flag, the note and each site's line", async () => {
    const { result } = await runFixture("ferney-creek-52-47A", {
      config: { ...DEFAULT_USER_CONFIG, roadVetoGradePct: 3 },
    });
    const flag = result.flags.find((f) => f.t.startsWith("Driveway to site #1: No practical route found"));
    expect(flag?.lvl).toBe("warn");
    expect(result.driveway!.note).toMatch(
      /No practical route found: every driveway route is steeper than 3% over 30 m/,
    );
    for (const s of result.sites!) expect(s.why.at(-1)).toMatch(/^No practical route found/);
  }, 120_000);

  it("at the default 20% no fixture site is vetoed (the A4b study's finding)", async () => {
    for (const slug of ["ferney-creek-52-47A", "macks-mountain-35-3", "grayson-mud-creek-6273"] as const) {
      const { result } = await runFixture(slug);
      expect(result.flags.some((f) => /No practical route found/.test(f.t))).toBe(false);
    }
  }, 300_000);
});

describe("the driveway card's grade (A4b)", () => {
  it("the headline is over 30 m; 15 and 60 m and the ground note are in the details", async () => {
    const { result } = await runFixture("ferney-creek-52-47A");
    const v = drivewayView(result)!;
    const rt = result.driveway!.routes[0]!;
    const row = v.routes[0]!.rows.find((x) => x.label === "Grade over 30 m / average")!;
    expect(row.value).toBe(
      `${rt.metrics.maxGradePct.toFixed(1)}% / ${rt.metrics.avgGradePct.toFixed(1)}% (limit ${(rt.maxGrade * 100).toFixed(0)}%)`,
    );
    expect(v.routes[0]!.rows.some((x) => /max/i.test(x.label))).toBe(false);
    expect(v.routes[0]!.details.rows.map((x) => x.label)).toEqual(["Grade over 15 m", "Grade over 60 m"]);
    expect(v.routes[0]!.details.note).toBe(GROUND_GRADE_NOTE);
    expect(rt.metrics.maxGradePct).toBeCloseTo(gradeOver(rt.profile, 30), 9);
  }, 120_000);
});
