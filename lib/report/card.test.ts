/**
 * The parcel report card (value-ranking.md §3.2; VR2): the three fixtures' cards, the gates' and rows' rules on
 * edited copies of Ferney Creek, config-driven cutoffs, and each person's weights.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { NO_PRACTICAL_ROUTE } from "../screen/score";
import type { ScreenResult } from "../screen/types";
import { atLeast, atMost, cardFacts, cardFor, footprintFt2, reportCard, type CardConfig } from "./card";

const K = SCREEN_CONSTANTS.card;
const ferney = () => structuredClone(expectedOf("ferney-creek-52-47A", "run"));
const gates = (r: ScreenResult) => Object.fromEntries(cardFacts(r).gates.map((g) => [g.key, g.status]));
const grades = (r: ScreenResult) => Object.fromEntries(cardFacts(r).rows.map((x) => [x.key, x.grade]));
const gateOf = (r: ScreenResult, key: string) => cardFacts(r).gates.find((g) => g.key === key)!;
const rowOf = (r: ScreenResult, key: string) => cardFacts(r).rows.find((x) => x.key === key)!;

describe("the report card on the fixtures (engine 13)", () => {
  it("Ferney Creek 52-47A: every gate passes; a Contender for both", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    expect(gates(r)).toEqual({ floodplain: "pass", access: "pass", easement: "pass", septic: "pass" });
    expect(grades(r)).toEqual({
      elevation: "B",
      homesite: "A",
      sky: "B",
      room: "A",
      trails: "C",
      town: "D",
      garden: "A",
    });
    const zach = reportCard(r, "zach");
    expect(zach.points).toBeCloseTo(3.3, 9);
    expect([zach.grade, zach.verdict]).toEqual(["B", "Contender"]);
    expect(zach.reason).toBe(
      "Contender: the weakest part is town and hospital (D, a 48-minute drive to an ER, 16 to a grocery).",
    );
    expect(reportCard(r, "julie").points).toBeCloseTo(3.0, 9);
    expect(rowOf(r, "garden").detail).toBe("a 2.48 ac garden on prime farmland");
    expect(rowOf(r, "room").detail).toBe("18.7 ac of gentle ground, 41× the build footprint");
  });

  it("Macks Mountain 35-3: the septic warn, the closer grocery", () => {
    const r = expectedOf("macks-mountain-35-3", "run");
    expect(gates(r)).toEqual({ floodplain: "pass", access: "pass", easement: "pass", septic: "warn" });
    expect(grades(r)).toEqual({
      elevation: "A",
      homesite: "A",
      sky: "B",
      room: "A",
      trails: "C",
      town: "D",
      garden: "B",
    });
    // The nearer grocery is the closer one, 42 min (a D), not the Walmart at 61 (an F).
    expect(rowOf(r, "town").detail).toBe("a 48-minute drive to an ER, 42 to a grocery");
    const zach = reportCard(r, "zach"),
      julie = reportCard(r, "julie");
    expect(zach.points).toBeCloseTo(3.45, 9);
    expect([zach.grade, zach.verdict]).toEqual(["B", "Contender"]);
    expect(julie.points).toBeCloseTo(2.9, 9);
    expect(zach.reason).toBe(
      "Contender: no soil on the parcel rates better than very limited for a septic field.",
    );
  });

  it("Grayson Mud Creek 6273: two warns make it a Maybe", () => {
    const r = expectedOf("grayson-mud-creek-6273", "run");
    expect(gates(r)).toEqual({ floodplain: "warn", access: "pass", easement: "pass", septic: "warn" });
    expect(grades(r)).toEqual({
      elevation: "A",
      homesite: "A",
      sky: "A",
      room: "B",
      trails: "B",
      town: "C",
      garden: "C",
    });
    const zach = reportCard(r, "zach");
    expect(zach.points).toBeCloseTo(3.45, 9);
    expect([zach.grade, zach.verdict]).toEqual(["B", "Maybe"]);
    expect(zach.reason).toBe("Maybe: a FEMA flood zone covers 0.5 ac of the parcel, not the build site.");
    expect(rowOf(r, "room").detail).toBe("1.3 ac of gentle ground, 2.9× the build footprint");
  });
});

describe("the gates", () => {
  it("the build site in a flood zone fails, and the verdict says so (§3.2's example)", () => {
    const r = ferney();
    r.flood = { zones: ["AE"], sfha: true, sfhaAcres: 3, mapped: true };
    r.sites![0]!.flood = true;
    const c = reportCard(r, "zach");
    expect(c.verdict).toBe("Pass");
    expect(c.reason).toBe("Pass: the build site is in a FEMA flood zone.");
  });

  it("an unmapped area is unknown, and counts as a warn", () => {
    const r = ferney();
    r.flood = { zones: [], sfha: false, sfhaAcres: 0, mapped: false };
    expect(gateOf(r, "floodplain")).toMatchObject({
      status: "unknown",
      reason: "FEMA has no flood mapping here",
    });
    expect(reportCard(r, "zach").verdict).toBe("Contender"); // one warn is allowed
    r.soils = r.soils!.map((x) => ({ ...x, septic: "Very limited" }));
    const c = reportCard(r, "zach");
    expect(c.verdict).toBe("Maybe");
    expect(c.reason).toBe("Maybe: FEMA has no flood mapping here.");
  });

  it("no frontage: routed from the nearest road point, a warn", () => {
    const r = ferney();
    r.driveway!.entrances = r.driveway!.entrances.map((e) => ({ ...e, fallback: true, gapFt: 212.4 }));
    expect(gateOf(r, "access")).toMatchObject({
      status: "warn",
      reason:
        "No road frontage found within 130 ft; routed from the nearest road point, 212 ft off the line (the deed or plat must show access)",
    });
  });

  it("no road within 400 m: access fails, and so does the driveway", () => {
    const r = ferney();
    r.driveway = { ...r.driveway!, entrances: [], routes: [] };
    expect(gates(r)).toMatchObject({ access: "fail", easement: "fail" });
    expect(reportCard(r, "julie").reason).toBe(
      "Pass: no road within 400 m of the boundary (landlocked, or TIGER is wrong).",
    );
  });

  it("no practical route fails; the steep landing is the reason only when no route avoids it", () => {
    const r = ferney();
    const landing = { ll: [36.6, -81.5] as [number, number], atFt: 1234, sideSlopeDeg: 38.6 };
    r.driveway!.note = `${NO_PRACTICAL_ROUTE}: every driveway route is steeper than 25% over 30 m; the least steep (31% over 30 m) is shown.`;
    r.driveway!.steepLanding = { ...landing, avoided: true };
    expect(gateOf(r, "easement")).toMatchObject({ status: "fail", reason: NO_PRACTICAL_ROUTE });
    r.driveway!.steepLanding = { ...landing, avoided: false };
    expect(gateOf(r, "easement").reason).toBe(
      `${NO_PRACTICAL_ROUTE}: a switchback near 1,230 ft would sit on a 39° side slope — too steep without retaining walls; no route avoids it`,
    );
  });

  it("an easement, and no practical drive within the budget, warn together", () => {
    const r = ferney();
    r.driveway!.routes[0] = { ...r.driveway!.routes[0]!, needsEasement: true };
    expect(gateOf(r, "easement")).toMatchObject({
      status: "warn",
      reason: "The driveway needs an easement across neighbouring land",
    });
    const cost = { low: 1, mid: 2, high: 3 };
    r.driveway!.practical = {
      limitPct: 15,
      steeperPct: 15,
      readyToBuild: 300_000,
      share: 0.5,
      cost,
      steeper: null,
      easement: null,
      scoredOn: null,
    };
    expect(gateOf(r, "easement").reason).toBe(
      "The driveway needs an easement across neighbouring land; the drive needs a steeper paved alignment or an easement",
    );
  });

  it("septic: unknown when the soils didn't load; never a fail", () => {
    const r = ferney();
    delete r.soils;
    expect(gateOf(r, "septic").status).toBe("unknown");
  });
});

describe("the rows", () => {
  it("cutoffs are lower edges for more-is-better, upper edges for less-is-better", () => {
    expect(atLeast(3000, K.rows.elevationFt)).toBe("A");
    expect(atLeast(2999.9, K.rows.elevationFt)).toBe("B");
    expect(atLeast(1499, K.rows.elevationFt)).toBe("F");
    expect(atMost(20, K.rows.erMin)).toBe("A");
    expect(atMost(20.1, K.rows.erMin)).toBe("B");
    expect(atMost(61, K.rows.erMin)).toBe("F");
  });

  it("garden: an A needs prime or statewide-important soil; otherwise by the largest garden", () => {
    const r = ferney();
    r.gardens = r.gardens!.filter(
      (g) => g.soilNote !== "prime farmland" && g.soilNote !== "farmland of statewide importance",
    );
    expect(rowOf(r, "garden")).toMatchObject({ grade: "B", detail: "the largest garden is 3.10 ac" });
    r.gardens = [{ ...r.gardens[0]!, acres: 0.05 }];
    expect(rowOf(r, "garden").grade).toBe("D");
    r.gardens = [];
    expect(rowOf(r, "garden")).toMatchObject({ grade: "F", detail: "no garden ground found" });
  });

  it("town: the worse of the ER and the grocery", () => {
    const r = ferney();
    r.drives = r.drives!.map((d) => (d.label === "Nearest hospital" ? { ...d, min: 15 } : d));
    expect(rowOf(r, "town").grade).toBe("B"); // ER 15 (A), grocery 16 (B)
    r.closerGrocery = { label: "Closer grocery", name: "Corner store", min: 8, mi: 4, er: null };
    expect(rowOf(r, "town")).toMatchObject({
      grade: "A",
      detail: "a 15-minute drive to an ER, 8 to a grocery",
    });
  });

  it("trails: adjoining open land is an A; open land within a mile a B, unless a trailhead does better", () => {
    const r = ferney();
    const open = { ...r.protected![0]!, adjoins: false, distFt: 2640 };
    r.protected = [open];
    expect(rowOf(r, "trails")).toMatchObject({ grade: "B" });
    expect(rowOf(r, "trails").detail).toMatch(/^open public land 0\.5 mi away/);
    r.near!.trailheads = [{ ...r.near!.trailheads[0]!, km: 4 }];
    expect(rowOf(r, "trails").grade).toBe("A");
    r.protected = [{ ...open, adjoins: true, distFt: null }];
    r.near!.trailheads = [];
    expect(rowOf(r, "trails").grade).toBe("A");
    r.protected = [];
    expect(rowOf(r, "trails")).toMatchObject({ grade: "F", detail: "no trailhead found within 20 km" });
  });

  it("no build site: the homesite is an F, and the elevation isn't graded", () => {
    const r = ferney();
    r.sites = [];
    expect(grades(r)).toMatchObject({ homesite: "F", elevation: null });
  });

  it("a row whose step didn't run is left out of the grade", () => {
    const r = ferney();
    delete r.sky;
    const c = reportCard(r, "zach");
    expect(rowOf(r, "sky").grade).toBeNull();
    // Ferney's 330 points less the sky's 30, over 90 of weight.
    expect(c.points).toBeCloseTo(300 / 90, 9);
  });

  it("the footprint is §5.4's 19,860 ft² (0.46 ac)", () => {
    expect(footprintFt2()).toBe(5120 + 4200 + 2400 + 4068 * 2);
  });
});

describe("config and weights", () => {
  it("a changed cutoff changes the grade", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    const lower: CardConfig = { ...K, rows: { ...K.rows, elevationFt: [2700, 2500, 2000, 1500] } };
    const c = cardFor(cardFacts(r, lower), "zach", lower);
    expect(c.rows.find((x) => x.key === "elevation")!.grade).toBe("A");
    expect(c.points).toBeCloseTo(3.55, 9);
    expect(c.grade).toBe("A");
  });

  it("each person's weights sum to 100", () => {
    for (const w of Object.values(K.weights)) expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("the weights change the grade, the verdict and the reason, and nothing else", () => {
    const r = ferney();
    r.gardens = [];
    r.near!.trailheads = [];
    r.protected = [];
    const facts = cardFacts(r);
    const zach = cardFor(facts, "zach"),
      julie = cardFor(facts, "julie");
    expect(zach.points).toBeCloseTo(2.7, 9);
    expect(julie.points).toBeCloseTo(1.7, 9);
    expect([zach.verdict, julie.verdict]).toEqual(["Maybe", "Pass"]);
    // Trails and the garden are both F; the reason names the one this person weighs more (Julie: trails 25).
    expect(julie.reason).toBe(
      "Pass: the weakest part is trails and public land (F, no trailhead found within 20 km).",
    );
    expect(zach.gates).toEqual(julie.gates);
    expect(zach.rows).toEqual(julie.rows);
  });
});
