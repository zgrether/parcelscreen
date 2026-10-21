/**
 * The interview's generator against the plan (docs/plans/step-4-interview.md): every choice of §3's table (its points,
 * the B/C edge it sets, its why and its quiet-list entry), §4's two people, and §2's rules.
 */
import { describe, expect, it } from "vitest";
import { defaultRubric } from "../default";
import { weightsOf } from "../weights";
import { bcEdge, plainLine, type BandKey } from "../words";
import type { RowKey } from "../types";
import { InterviewAnswersSchema, type InterviewAnswers } from "./answers";
import { rubricFromAnswers, walkAwayStarts } from "./generate";
import { QUESTIONS } from "./questions";

const D = defaultRubric();
const edge = (a: InterviewAnswers, band: BandKey) => bcEdge(rubricFromAnswers(a).rubric.bands, band);
const points = (a: InterviewAnswers, row: RowKey) => rubricFromAnswers(a).points[row];
const later = (a: InterviewAnswers) => rubricFromAnswers(a).later;
const whyOf = (a: InterviewAnswers, f: RowKey) => rubricFromAnswers(a).why.cards[f];
const rounded = (w: Record<string, number>) =>
  Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v * 10) / 10]));

describe("§3: every choice", () => {
  // [answers, row, points, band, B/C edge (null: today's), later entry]
  const table: [InterviewAnswers, RowKey, number, BandKey | null, number | null, string | null][] = [
    [{ climate: "cool" }, "elevation", 3, "elevationFt", 3000, "Climate (cool and snowy)"],
    [{ climate: "between" }, "elevation", 2, "elevationFt", null, "Climate (in between)"],
    [{ climate: "warm" }, "elevation", 0, null, null, "Climate (warm and mild)"],
    [{ climate: "either" }, "elevation", 1, "elevationFt", null, null],
    [{ sky: "camera", glow: "shrug" }, "sky", 3, "skyMag", null, null],
    [{ sky: "camera", glow: "spoils" }, "sky", 3, "skyMag", 21.5, null],
    [{ sky: "look" }, "sky", 1, "skyMag", 20.9, null],
    [{ sky: "inside" }, "sky", 0, null, null, null],
    [{ sunView: "sun" }, "homesite", 3, null, null, null],
    [{ sunView: "view" }, "homesite", 1, null, null, "Long view (over winter sun)"],
    [{ sunView: "both" }, "homesite", 2, null, null, "Long view (as much as winter sun)"],
    [{ sunView: "neither" }, "homesite", 1, null, null, null],
    [{ trails: "door" }, "trails", 3, "trailheadMin", 15, null],
    [{ trails: "bike" }, "trails", 2, "trailheadMin", null, "Bike to a long trail"],
    [{ trails: "drive" }, "trails", 2, "trailheadMin", null, null],
    [{ trails: "none" }, "trails", 0, null, null, null],
    [{ groceries: "close" }, "town", 2, "groceryMin", 15, null],
    [{ groceries: "far" }, "town", 1, "groceryMin", 40, null],
    [{ groceries: "either" }, "town", 0, "groceryMin", 40, null],
    [{ er: "15" }, "town", 3, "erMin", 15, null],
    [{ er: "30" }, "town", 2, "erMin", null, null],
    [{ er: "45" }, "town", 1, "erMin", 45, null],
    [{ er: "60" }, "town", 0, "erMin", 60, null],
    [{ neighbors: "wave" }, "sky", 1, null, null, "Privacy (close enough to wave)"],
    [{ neighbors: "lights" }, "sky", 1, null, null, "Privacy (lights at night are fine)"],
    [{ neighbors: "never", sky: "inside" }, "sky", 1, null, null, "Privacy (never know they're there)"],
    [{ garden: "none" }, "garden", 0, null, null, null],
    [{ garden: "herbs" }, "garden", 1, "gardenAc", 0.1, null],
    [{ garden: "kitchen" }, "garden", 2, "gardenAc", null, "Frost-free season"],
    [{ garden: "most" }, "garden", 3, "gardenAc", 1, "Frost-free season"],
  ];
  it.each(table)("%j: %s %d points", (a, row, p, band, value, entry) => {
    expect(points(a, row)).toBe(p);
    if (band) expect(edge(a, band)).toBe(value ?? bcEdge(D.bands, band));
    expect(later(a)).toEqual(entry ? [entry] : []);
  });

  it("'Walk out the door' asks for public land within ¼ mi for a B", () => {
    expect(rubricFromAnswers({ trails: "door" }).rubric.bands.openLandWithinFt).toBe(1320);
    expect(plainLine(rubricFromAnswers({ trails: "door" }).rubric, "trails")).toBe(
      "A trailhead within 15 min, or public land within 0.25 mi",
    );
  });

  it("the shifted bands keep their steps", () => {
    const b = rubricFromAnswers({ climate: "cool", sky: "camera", glow: "spoils", er: "45", garden: "herbs" })
      .rubric.bands;
    expect(b.elevationFt).toEqual([3500, 3000, 2500, 2000]);
    expect(b.skyMag).toEqual([21.8, 21.5, 21.2, 20.8]);
    expect(b.erMin).toEqual([35, 45, 60, 75]);
    expect(b.gardenAc).toEqual([0.35, 0.1, 0, 0]);
  });

  it("questions 7 and 11–13 only add to the stored list of later factors", () => {
    const a: InterviewAnswers = {
      fly: "monthly",
      calls: "yes",
      hoa: "welcome",
      creek: "rather",
      land: { acres: "5to20", campBudget: 40000, buildBudget: 250000 },
    };
    expect(later(a)).toEqual([
      "Airport (monthly or more)",
      "Internet for video calls",
      "HOA (welcome)",
      "No creek",
      "Acreage (5–20 acres)",
      "Camp budget ($40,000)",
      "Build budget ($250,000)",
    ]);
    expect(rubricFromAnswers(a).points).toEqual({
      elevation: 2,
      homesite: 2,
      room: 2,
      driveway: 1,
      trails: 2,
      town: 2,
      sky: 1,
      garden: 1,
    });
    expect(later({ fly: "rarely", calls: "no", creek: "either", hoa: "light" })).toEqual([
      "HOA (light rules)",
    ]);
    expect(later({ fly: "few" })).toEqual(["Airport (a few times a year)"]);
  });

  it("question 10 sets the Driveway row: its B/C edge, 20 / 15 / 12%, and its points (step 7)", () => {
    const at = (driveway: "steep" | "gentle" | "build") => rubricFromAnswers({ driveway });
    expect(at("steep").rubric.bands.drivewayPct).toEqual([15, 20, 25, 30]);
    expect(at("gentle").rubric.bands.drivewayPct).toEqual([10, 15, 20, 25]);
    expect(at("build").rubric.bands.drivewayPct).toEqual([7, 12, 17, 22]);
    expect([at("steep"), at("gentle"), at("build")].map((g) => g.points.driveway)).toEqual([1, 2, 1]);
    expect(later({ driveway: "steep" })).toEqual([]);
    expect(whyOf({ driveway: "gentle" }, "driveway")).toEqual(["You'd rather have a long, gentle driveway"]);
    // Skipped (owner, #216): the bottom of Nice to have with the starting list's 15% edge, never higher, even when
    // Nice to have is otherwise empty.
    const skipped = rubricFromAnswers({ er: "30" }).rubric;
    expect(skipped.ranked.at(-1)).toEqual({ factor: "driveway", tier: "could" });
    expect(skipped.bands.drivewayPct).toEqual([10, 15, 20, 25]);
    // "Long and gentle" is Really want: its 2 points meet Really want's floor.
    expect(at("gentle").rubric.ranked.find((c) => c.factor === "driveway")!.tier).toBe("should");
  });

  it("why lines quote the person, never a question number (owner, 10/18)", () => {
    expect(whyOf({ er: "30" }, "town")).toEqual(["You'd want an ER within 30 minutes"]);
    expect(whyOf({ sunView: "sun" }, "homesite")).toEqual([
      "You'd rather have sun at breakfast than a long view",
    ]);
    expect(whyOf({ sky: "camera", glow: "spoils" }, "sky")).toEqual([
      "You'd be out with a camera, and a town's glow would spoil it",
    ]);
    // Two answers: the one that set the place first.
    expect(whyOf({ groceries: "far", er: "15" }, "town")).toEqual([
      "You'd want an ER within 15 minutes",
      "You'd rather drive 40 minutes to a big store once a week",
    ]);
    const all = JSON.stringify(rubricFromAnswers(PERSON_A).why);
    expect(all).not.toMatch(/Question \d/);
  });
});

describe("§3: question 14", () => {
  it("14a: limits at the numbers entered, gates already Must have, the rest on the quiet list", () => {
    const g = rubricFromAnswers({
      walkAway: {
        chips: [
          "flood",
          "hoa",
          "sharedDriveway",
          "belowFt",
          "erOver",
          "neighborInView",
          "noWinterSun",
          "altSeptic",
        ],
        belowFt: 2800,
        erOverMin: 40,
      },
    });
    expect(g.rubric.musts).toEqual([
      { factor: "floodplain" },
      { factor: "access" },
      { factor: "easement" },
      { factor: "septic" },
      { factor: "elevation", threshold: 2800 },
      { factor: "town", threshold: 40 },
      { factor: "homesite", threshold: 3 },
    ]);
    expect(g.why.cards.floodplain).toEqual(["You'd walk away from a flood zone"]);
    expect(g.why.limits).toEqual({
      elevation: "You'd walk away from land below 2,800 ft",
      town: "You'd walk away from an ER more than 40 minutes away",
      homesite: "You'd walk away from a place with no winter sun",
    });
    expect(g.later).toEqual([
      "No HOA (a must)",
      "Driveway on your land (a must)",
      "Privacy: no house in view (a must)",
    ]);
    expect(g.mustNote).toBe(true); // eight chips, above five
  });

  it("14a's numbers start under question 1's edge and one step past question 6's answer", () => {
    expect(walkAwayStarts({ climate: "cool", er: "30" })).toEqual({ belowFt: 2500, erOverMin: 45 });
    expect(walkAwayStarts({ er: "15" })).toEqual({ belowFt: 2000, erOverMin: 30 });
    expect(walkAwayStarts({ er: "60" })).toEqual({ belowFt: 2000, erOverMin: 75 });
    const g = rubricFromAnswers({ climate: "cool", walkAway: { chips: ["belowFt"] } });
    expect(g.rubric.musts.at(-1)).toEqual({ factor: "elevation", threshold: 2500 });
  });

  it("a walk-away chip on a 0-point row lifts it to Nice to have, so its limit has a card", () => {
    const g = rubricFromAnswers({ climate: "warm", walkAway: { chips: ["belowFt"] } });
    expect(g.points.elevation).toBe(1);
    expect(g.rubric.ranked.find((c) => c.factor === "elevation")?.tier).toBe("could");
  });

  it("14b: dealbreakers to Don't care, rows to 0, the ER's edge to 90 min", () => {
    const g = rubricFromAnswers({
      dontMatter: [
        "flood",
        "sharedDriveway",
        "altSeptic",
        "belowFt",
        "noWinterSun",
        "erOver",
        "hoa",
        "neighborInView",
        "overBudget",
      ],
    });
    expect(g.rubric.musts).toEqual([{ factor: "access" }]);
    expect(g.rubric.wonts).toEqual(["elevation", "homesite"]);
    expect(bcEdge(g.rubric.bands, "erMin")).toBe(90);
    expect(g.why.cards.floodplain).toEqual(["You said a flood zone doesn't matter"]);
    expect(g.why.cards.elevation).toEqual(["You said elevation doesn't matter"]);
    expect(g.later).toEqual(["HOA (doesn't matter)", "Privacy (doesn't matter)", "Budgets (don't matter)"]);
  });

  it("the note shows above five walk-away chips, not at five", () => {
    const five = { walkAway: { chips: ["flood", "hoa", "sharedDriveway", "belowFt", "erOver"] as const } };
    expect(rubricFromAnswers({ walkAway: { chips: [...five.walkAway.chips] } }).mustNote).toBe(false);
    expect(rubricFromAnswers({ walkAway: { chips: [...five.walkAway.chips, "noWinterSun"] } }).mustNote).toBe(
      true,
    );
  });
});

const PERSON_A: InterviewAnswers = {
  climate: "cool",
  sky: "camera",
  glow: "spoils",
  sunView: "sun",
  trails: "door",
  groceries: "close",
  er: "30",
  fly: "rarely",
  calls: "yes",
  neighbors: "never",
  garden: "kitchen",
  driveway: "gentle",
  hoa: "none",
  creek: "best",
  land: { acres: "20to50" },
  walkAway: { chips: ["flood", "hoa", "belowFt", "noWinterSun"], belowFt: 2500 },
};

const PERSON_B: InterviewAnswers = {
  climate: "warm",
  sky: "inside",
  sunView: "view",
  trails: "drive",
  groceries: "close",
  er: "15",
  fly: "rarely",
  calls: "no",
  neighbors: "wave",
  garden: "herbs",
  walkAway: { chips: ["flood", "erOver"], erOverMin: 30 },
  dontMatter: ["belowFt"],
};

describe("§4: the two people", () => {
  it("Person A", () => {
    const g = rubricFromAnswers(PERSON_A);
    expect(g.rubric.ranked).toEqual([
      { factor: "elevation", tier: "should" },
      { factor: "homesite", tier: "should" },
      { factor: "trails", tier: "should" },
      { factor: "sky", tier: "should" },
      // Step 7: "Long and gentle" gives Driveway 2 points, ahead of Room to build by the default order; Town and
      // hospital, also at 2, goes to Nice to have (Really want holds six).
      { factor: "driveway", tier: "should" },
      { factor: "room", tier: "should" },
      { factor: "town", tier: "could" },
      { factor: "garden", tier: "could" },
    ]);
    expect(rounded(weightsOf(g.rubric))).toEqual({
      elevation: 22.7,
      homesite: 19.9,
      trails: 17,
      sky: 14.2,
      driveway: 11.3,
      room: 8.5,
      town: 4.3,
      garden: 2.1,
    });
    expect(bcEdge(g.rubric.bands, "drivewayPct")).toBe(15);
    expect(g.rubric.musts.slice(4)).toEqual([
      { factor: "elevation", threshold: 2500 },
      { factor: "homesite", threshold: 3 },
    ]);
    expect(g.rubric.bands.openLandWithinFt).toBe(1320);
    expect([bcEdge(g.rubric.bands, "groceryMin"), bcEdge(g.rubric.bands, "erMin")]).toEqual([15, 30]);
    expect(g.later).toEqual([
      "Climate (cool and snowy)",
      "Internet for video calls",
      "Privacy (never know they're there)",
      "Frost-free season",
      "No HOA (a must)",
      "A creek (the best feature)",
      "Acreage (20–50 acres)",
    ]);
    expect(g.mustNote).toBe(false);
  });

  it("Person B", () => {
    const g = rubricFromAnswers(PERSON_B);
    expect(g.rubric.ranked).toEqual([
      { factor: "town", tier: "should" },
      { factor: "room", tier: "should" },
      { factor: "trails", tier: "should" },
      { factor: "homesite", tier: "could" },
      { factor: "garden", tier: "could" },
      // Step 7 (owner, #216): question 10 skipped, so Driveway at the bottom of Nice to have, never higher.
      { factor: "driveway", tier: "could" },
    ]);
    expect(g.rubric.wonts).toEqual(["elevation", "sky"]);
    expect(rounded(weightsOf(g.rubric))).toEqual({
      town: 30.8,
      room: 25.6,
      trails: 20.5,
      homesite: 11.5,
      garden: 7.7,
      driveway: 3.8,
      elevation: 0,
      sky: 0,
    });
    expect(g.rubric.bands.drivewayPct).toEqual([10, 15, 20, 25]);
    expect(g.rubric.musts.slice(4)).toEqual([{ factor: "town", threshold: 30 }]);
    expect([bcEdge(g.rubric.bands, "erMin"), bcEdge(g.rubric.bands, "groceryMin")]).toEqual([15, 15]);
    expect(g.later).toEqual([
      "Climate (warm and mild)",
      "Long view (over winter sun)",
      "Privacy (close enough to wave)",
    ]);
  });
});

describe("§2: the rules", () => {
  it("skipping everything keeps the starting list unchanged (owner Q8)", () => {
    expect(rubricFromAnswers({}).rubric).toEqual(D);
  });

  it("a row takes its highest answer, not the sum (owner Q1)", () => {
    expect(points({ groceries: "close", er: "30" }, "town")).toBe(2);
    expect(points({ groceries: "far", er: "15" }, "town")).toBe(3);
  });

  it("Really want holds the rows with 2+ points, kept to 3–6; ties go to the default order", () => {
    // Everything at 3: six in Really want; Room (2, by default) to Nice to have; Driveway (skipped) at its bottom.
    const all3 = rubricFromAnswers({
      climate: "cool",
      sky: "camera",
      sunView: "sun",
      trails: "door",
      er: "15",
      garden: "most",
    });
    expect(all3.rubric.ranked.map((c) => `${c.factor}:${c.tier}`)).toEqual([
      "elevation:should",
      "homesite:should",
      "trails:should",
      "town:should",
      "sky:should",
      "garden:should",
      "room:could",
      "driveway:could",
    ]);
    // Only Room to build has 2+: Really want is filled to three with the next best rows.
    const few = rubricFromAnswers({
      climate: "either",
      sky: "look",
      sunView: "neither",
      trails: "none",
      groceries: "far",
      er: "45",
      garden: "herbs",
    });
    expect(few.rubric.ranked.filter((c) => c.tier === "should").map((c) => c.factor)).toEqual([
      "room",
      "elevation",
      "homesite",
    ]);
    expect(few.rubric.wonts).toEqual(["trails"]);
    expect(few.rubric.ranked.at(-1)).toEqual({ factor: "driveway", tier: "could" });
  });

  it("rank-sum weights, always", () => {
    expect(rubricFromAnswers({ climate: "between" }).rubric.weights).toEqual({ mode: "rankSum" });
  });
});

describe("the stored answers", () => {
  it("the schema takes every choice, and refuses one it doesn't know", () => {
    expect(InterviewAnswersSchema.safeParse(PERSON_A).success).toBe(true);
    expect(InterviewAnswersSchema.safeParse(PERSON_B).success).toBe(true);
    expect(InterviewAnswersSchema.safeParse({ climate: "tropical" }).success).toBe(false);
    expect(InterviewAnswersSchema.safeParse({ age: 40 }).success).toBe(false);
  });
});

describe("question 7 (owner, 10/18): two single-choice rows", () => {
  it("each row's choice has its own why and later entry", () => {
    const q7 = QUESTIONS.find((q) => q.key === "fly")!;
    expect(q7.choices.map((c) => [c.label, c.why, c.later ?? null])).toEqual([
      ["Rarely or never", "You rarely or never fly", null],
      ["A few times a year", "You fly a few times a year", "Airport (a few times a year)"],
      ["Monthly or more", "You fly monthly or more", "Airport (monthly or more)"],
    ]);
    expect(q7.second!.choices.map((c) => [c.label, c.why, c.later ?? null])).toEqual([
      ["Yes", "You need internet for video calls from home", "Internet for video calls"],
      ["Not really", "You don't need internet for video calls", null],
    ]);
    expect(InterviewAnswersSchema.safeParse({ fly: "few", calls: "no" }).success).toBe(true);
    expect(InterviewAnswersSchema.safeParse({ work: ["calls"] }).success).toBe(false);
  });
});
