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
    // Step 11: Climate is graded now, so question 1 left the quiet list; a year gives Climate 2 points, and its
    // follow-ups (or the year's preset) its limits.
    [{ climate: "cool" }, "elevation", 3, "elevationFt", 3000, null],
    [{ climate: "between" }, "elevation", 2, "elevationFt", null, null],
    [{ climate: "warm" }, "elevation", 0, null, null, null],
    [{ climate: "either" }, "elevation", 1, "elevationFt", null, null],
    [{ climate: "cool" }, "climate", 2, "julHighF", 80, null],
    [{ climate: "between" }, "climate", 2, "janLowF", 18, null],
    [{ climate: "warm" }, "climate", 2, "janLowF", 24, null],
    [{ climate: "either" }, "climate", 0, "janLowF", null, null],
    [{ climate: "cool", winter: "mild" }, "climate", 2, "janLowF", 24, null],
    [{ climate: "warm", summer: "hot" }, "climate", 2, "julHighF", 115, null],
    [{ climate: "cool" }, "climate", 2, "janLowF", -25, null],
    [{ sky: "camera", glow: "shrug" }, "sky", 3, "skyMag", null, null],
    [{ sky: "camera", glow: "spoils" }, "sky", 3, "skyMag", 21.5, null],
    [{ sky: "look" }, "sky", 1, "skyMag", 20.9, null],
    [{ sky: "inside" }, "sky", 0, null, null, null],
    [{ sunView: "sun" }, "homesite", 3, null, null, null],
    // Step 11: question 3 sets Long view too, graded now, so it left the quiet list.
    [{ sunView: "view" }, "homesite", 1, null, null, null],
    [{ sunView: "both" }, "homesite", 2, null, null, null],
    [{ sunView: "view" }, "longView", 3, null, null, null],
    [{ sunView: "both" }, "longView", 1, null, null, null],
    [{ sunView: "sun" }, "longView", 0, null, null, null],
    [{ sunView: "neither" }, "homesite", 1, null, null, null],
    [{ trails: "door" }, "trails", 3, "trailheadMin", 15, null],
    // Step 11: "Bike from home" sets Bike to a long trail, graded now, so it left the quiet list.
    [{ trails: "bike" }, "trails", 2, "trailheadMin", null, null],
    [{ trails: "bike" }, "longTrail", 2, "longTrailMin", 10, null],
    [{ trails: "drive" }, "longTrail", 0, null, null, null],
    [{ trails: "drive" }, "trails", 2, "trailheadMin", null, null],
    [{ trails: "none" }, "trails", 0, null, null, null],
    [{ groceries: "close" }, "town", 2, "groceryMin", 15, null],
    [{ groceries: "far" }, "town", 1, "groceryMin", 40, null],
    [{ groceries: "either" }, "town", 0, "groceryMin", 40, null],
    // Step 11 (plan §2.1): the ER's answer sets Hospital, split from Town.
    [{ er: "15" }, "hospital", 3, "erMin", 15, null],
    [{ er: "30" }, "hospital", 2, "erMin", null, null],
    [{ er: "45" }, "hospital", 1, "erMin", 45, null],
    [{ er: "60" }, "hospital", 0, "erMin", 60, null],
    // Step 11: question 8 sets Privacy, graded now, so it left the quiet list.
    [{ neighbors: "wave" }, "sky", 1, null, null, null],
    [{ neighbors: "lights" }, "sky", 1, null, null, null],
    [{ neighbors: "never", sky: "inside" }, "sky", 1, null, null, null],
    [{ neighbors: "wave" }, "privacy", 0, "privacyFt", 330, null],
    [{ neighbors: "lights" }, "privacy", 1, "privacyFt", 660, null],
    [{ neighbors: "never" }, "privacy", 3, "privacyFt", 1320, null],
    [{ neighbors: "never" }, "privacy", 3, "privacySight", 0, null],
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

  it("questions 7's second row and 11–13 only add to the stored list of later factors", () => {
    const a: InterviewAnswers = {
      fly: "monthly",
      calls: "yes",
      hoa: "welcome",
      creek: "rather",
      land: { acres: "5to20", campBudget: 40000, buildBudget: 250000 },
    };
    // Step 11: Airport is graded now (question 7's first row), so it left the quiet list.
    expect(later(a)).toEqual([
      "Internet for video calls",
      "HOA (welcome)",
      "No creek",
      "Acreage (5–20 acres)",
    ]);
    // Step 10: the budgets are graded now (Within budget, the last of Really want), so they left the quiet list.
    const g = rubricFromAnswers(a);
    expect(g.rubric.budgets).toEqual({ camp: 40000, build: 250000 });
    expect(g.rubric.ranked.filter((c) => c.tier === "should").at(-1)).toEqual({
      factor: "budget",
      tier: "should",
    });
    expect(rubricFromAnswers(a).points).toEqual({
      elevation: 2,
      homesite: 2,
      room: 2,
      driveway: 1,
      trails: 2,
      town: 2,
      hospital: 2,
      sky: 1,
      garden: 1,
      climate: 0,
      privacy: 0,
      longView: 0,
      // Monthly or more: Airport in Nice to have.
      airport: 1,
      longTrail: 0,
      budget: 0,
    });
    expect(later({ fly: "rarely", calls: "no", creek: "either", hoa: "light" })).toEqual([
      "HOA (light rules)",
    ]);
    expect(later({ fly: "few" })).toEqual([]);
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
    expect(whyOf({ er: "30" }, "hospital")).toEqual(["You'd want an ER within 30 minutes"]);
    expect(whyOf({ sunView: "sun" }, "homesite")).toEqual([
      "You'd rather have sun at breakfast than a long view",
    ]);
    expect(whyOf({ sky: "camera", glow: "spoils" }, "sky")).toEqual([
      "You'd be out with a camera, and a town's glow would spoil it",
    ]);
    // Two answers: the one that set the place first (step 11: the night sky's two, as the ER's left Town for Hospital).
    expect(whyOf({ neighbors: "never", sky: "camera" }, "sky")).toEqual([
      "You'd be out with a camera on a clear January night",
      "You'd rather never know the neighbors are there",
    ]);
    expect(whyOf({ groceries: "far", er: "15" }, "town")).toEqual([
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
      { factor: "hospital", threshold: 40 },
      // Step 11: "Neighbor's house in view" is Privacy's limit, none in sight.
      { factor: "privacy", threshold: 0 },
      { factor: "homesite", threshold: 3 },
    ]);
    expect(g.why.cards.floodplain).toEqual(["You'd walk away from a flood zone"]);
    expect(g.why.limits).toEqual({
      elevation: "You'd walk away from land below 2,800 ft",
      hospital: "You'd walk away from an ER more than 40 minutes away",
      privacy: "You'd walk away from a neighbor's house in view",
      homesite: "You'd walk away from a place with no winter sun",
    });
    expect(g.later).toEqual(["No HOA (a must)", "Driveway on your land (a must)"]);
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

  it("14b: dealbreakers to Don't care, rows to 0 (step 11: the ER's chip puts Hospital at 0)", () => {
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
    // Step 11: the ER's own row is Don't care; until Hospital, the ER's edge went to 90 min on Town.
    expect(g.rubric.wonts).toEqual([
      "elevation",
      "climate",
      "privacy",
      "longView",
      "airport",
      "longTrail",
      "homesite",
      "hospital",
    ]);
    expect(g.why.cards.privacy).toEqual(["You said a neighbor's house in view doesn't matter"]);
    expect(bcEdge(g.rubric.bands, "erMin")).toBe(30);
    expect(g.why.cards.hospital).toEqual(["You said the drive to an ER doesn't matter"]);
    expect(g.why.cards.floodplain).toEqual(["You said a flood zone doesn't matter"]);
    expect(g.why.cards.elevation).toEqual(["You said elevation doesn't matter"]);
    expect(g.later).toEqual(["HOA (doesn't matter)", "Budgets (don't matter)"]);
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
      // Step 11: "Never know they're there" gives Privacy 3 points, second of the 3s by the default order.
      { factor: "privacy", tier: "should" },
      { factor: "homesite", tier: "should" },
      { factor: "trails", tier: "should" },
      { factor: "sky", tier: "should" },
      // Step 11: Climate (cool and snowy, 2 points) by Elevation in the default order. Step 7: "Long and gentle" gives
      // Driveway 2 points, ahead of Room to build; Driveway, Room, Town and Hospital (the ER's 30 min), also at 2, go
      // to Nice to have, as Really want holds six.
      { factor: "climate", tier: "should" },
      { factor: "driveway", tier: "could" },
      { factor: "room", tier: "could" },
      { factor: "town", tier: "could" },
      { factor: "hospital", tier: "could" },
      { factor: "garden", tier: "could" },
    ]);
    expect(rounded(weightsOf(g.rubric))).toEqual({
      elevation: 17.7,
      privacy: 16.1,
      homesite: 14.5,
      trails: 12.9,
      sky: 11.2,
      climate: 9.6,
      driveway: 6,
      room: 4.8,
      town: 3.6,
      hospital: 2.4,
      garden: 1.2,
      longView: 0,
      airport: 0,
      longTrail: 0,
      budget: 0,
    });
    // "Sun" at breakfast: Long view is Don't care.
    expect(g.rubric.wonts).toEqual(["longView", "airport", "longTrail"]);
    // Never know they're there: the nearest house 1,320 ft away, none in sight.
    expect([g.rubric.bands.privacyFt, g.rubric.bands.privacySight]).toEqual([
      [1980, 1320, 990, 825],
      [0, 0, 10, 20],
    ]);
    // Cool and snowy: real winter welcome (no January limit), keep it cool (July highs to 80 °F).
    expect([g.rubric.bands.janLowF, g.rubric.bands.julHighF]).toEqual([
      [-22, -25, -28, -32],
      [77, 80, 83, 87],
    ]);
    expect(bcEdge(g.rubric.bands, "drivewayPct")).toBe(15);
    expect(g.rubric.musts.slice(4)).toEqual([
      { factor: "elevation", threshold: 2500 },
      { factor: "homesite", threshold: 3 },
    ]);
    expect(g.rubric.bands.openLandWithinFt).toBe(1320);
    expect([bcEdge(g.rubric.bands, "groceryMin"), bcEdge(g.rubric.bands, "erMin")]).toEqual([15, 30]);
    expect(g.later).toEqual([
      "Internet for video calls",
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
      // Step 11: a long view over sun at breakfast gives Long view 3 points, first of the 3s by the default order.
      { factor: "longView", tier: "should" },
      // Step 11: the ER within 15 min (3 points) is Hospital's; the small market close by (2) keeps Town in Really want.
      { factor: "hospital", tier: "should" },
      // Step 11: warm and mild, 2 points.
      { factor: "climate", tier: "should" },
      { factor: "room", tier: "should" },
      { factor: "trails", tier: "should" },
      { factor: "town", tier: "should" },
      { factor: "homesite", tier: "could" },
      { factor: "garden", tier: "could" },
      // Step 7 (owner, #216): question 10 skipped, so Driveway at the bottom of Nice to have, never higher.
      { factor: "driveway", tier: "could" },
    ]);
    // Step 11: "Wave from the porch" leaves Privacy at 0 points.
    expect(g.rubric.wonts).toEqual(["elevation", "privacy", "airport", "longTrail", "sky"]);
    expect(rounded(weightsOf(g.rubric))).toEqual({
      longView: 20.7,
      hospital: 18.4,
      climate: 16.1,
      room: 13.8,
      trails: 11.5,
      town: 9.2,
      homesite: 5.2,
      garden: 3.4,
      driveway: 1.7,
      elevation: 0,
      sky: 0,
      privacy: 0,
      airport: 0,
      longTrail: 0,
      budget: 0,
    });
    expect(g.rubric.bands.drivewayPct).toEqual([10, 15, 20, 25]);
    expect(g.rubric.musts.slice(4)).toEqual([{ factor: "hospital", threshold: 30 }]);
    expect([bcEdge(g.rubric.bands, "erMin"), bcEdge(g.rubric.bands, "groceryMin")]).toEqual([15, 15]);
    expect(g.later).toEqual([]);
  });
});

describe("§2: the rules", () => {
  it("skipping everything keeps the starting list unchanged (owner Q8)", () => {
    expect(rubricFromAnswers({}).rubric).toEqual(D);
  });

  it("a row takes its highest answer, not the sum (owner Q1)", () => {
    // Step 11: groceries and the ER were Town's two answers; Hospital took the ER's, so the night sky's two show it.
    expect(points({ sky: "look", neighbors: "never" }, "sky")).toBe(1);
    expect(points({ sky: "camera", neighbors: "never" }, "sky")).toBe(3);
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
      // Step 11: the ER's 15 min is Hospital's 3; Town keeps its default 2, so it's in Nice to have with Room.
      "hospital:should",
      "sky:should",
      "garden:should",
      // Step 11: cool and snowy gives Climate 2, first of the 2s by the default order: Nice to have, as six are at 3.
      "climate:could",
      "room:could",
      "town:could",
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
    // Step 11: "Either" climate gives Climate 0 points.
    expect(few.rubric.wonts).toEqual(["climate", "privacy", "longView", "airport", "longTrail", "trails"]);
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
      // Step 11: Airport is graded now, so its answers left the quiet list.
      ["A few times a year", "You fly a few times a year", null],
      ["Monthly or more", "You fly monthly or more", null],
    ]);
    expect(q7.second!.choices.map((c) => [c.label, c.why, c.later ?? null])).toEqual([
      ["Yes", "You need internet for video calls from home", "Internet for video calls"],
      ["Not really", "You don't need internet for video calls", null],
    ]);
    expect(InterviewAnswersSchema.safeParse({ fly: "few", calls: "no" }).success).toBe(true);
    expect(InterviewAnswersSchema.safeParse({ work: ["calls"] }).success).toBe(false);
  });
});
