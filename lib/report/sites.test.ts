/** Highest capability (step 7 plan §2) and the alternatives beside the best site (§1.3). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { ZACH } from "@/test/support/rubrics";
import { defaultRubric } from "../rubric/default";
import type { Letter, RowKey, Rubric } from "../rubric/types";
import type { LatLon } from "../geo/types";
import { reportCard, type Row } from "./card";
import { choicesBeside, metresBetween, rankSites, siteScore, type RankedSite, type SiteFacts } from "./sites";

const D = defaultRubric();
const r = (key: RowKey, grade: Letter | null, measure?: number): Row => ({
  key,
  label: key,
  grade,
  detail: "",
  ...(measure === undefined ? {} : { measure: { value: measure, unit: key === "elevation" ? "ft" : "h" } }),
});
const site = (rank: number, more: Partial<SiteFacts> = {}): SiteFacts => ({
  rank,
  ll: [36.6, -81.3 + rank * 0.01],
  fit: "fits",
  driveway: undefined,
  ...more,
});

describe("a site's score", () => {
  it("is the weighted points of the site rows the rubric ranks, on 0–100", () => {
    // Default weights: elevation 25, homesite 25, sky 10, room 15 (driveway is Don't care).
    const rows = [r("elevation", "A"), r("homesite", "B"), r("sky", "C"), r("room", "A"), r("driveway", "F")];
    expect(siteScore(rows, D)).toBeCloseTo((100 * (25 * 4 + 25 * 3 + 10 * 2 + 15 * 4)) / 75 / 4, 9);
    // Rows that aren't site rows don't count.
    expect(siteScore([...rows, r("trails", "F")], D)).toBe(siteScore(rows, D));
  });

  it("is null when the rubric ranks no site row, so the engine's order decides", () => {
    const none: Rubric = {
      ...D,
      ranked: D.ranked.filter((c) => c.factor === "trails"),
      weights: { mode: "rankSum" },
    };
    expect(siteScore([r("elevation", "A")], none)).toBeNull();
  });
});

describe("the ranking", () => {
  const rows: Record<number, Row[]> = {
    0: [r("elevation", "C", 2100), r("homesite", "B", 4)],
    1: [r("elevation", "A", 3100), r("homesite", "A", 6)],
    2: [r("elevation", "A", 3200), r("homesite", "A", 6)],
  };
  const rank = (sites: SiteFacts[], R: Rubric = D) => rankSites(sites, (i) => rows[i]!, R);

  it("puts the highest score first, the engine's order breaking ties", () => {
    expect(rank([site(1), site(2), site(3)]).map((s) => s.rank)).toEqual([2, 3, 1]);
  });

  it("puts a site that fails a check below every one that passes", () => {
    const flooded = rank([site(1), site(2, { flood: true }), site(3, { fit: "house only" })]);
    expect(flooded.map((s) => [s.rank, s.fails])).toEqual([
      [1, []],
      [2, ["flood"]],
      [3, ["fit"]],
    ]);
  });

  it("checks the flood zone and the driveway only when their gates are Musts", () => {
    const loose: Rubric = {
      ...D,
      musts: D.musts.filter((m) => m.factor !== "floodplain" && m.factor !== "easement"),
    };
    const sites = [site(1), site(2, { flood: true, driveway: null })];
    expect(rank(sites, D)[1]!.fails).toEqual(["flood", "driveway"]);
    expect(rank(sites, loose)[0]!.rank).toBe(2);
  });

  it("checks a limit on a site row", () => {
    const limited: Rubric = { ...D, musts: [...D.musts, { factor: "elevation", threshold: 3150 }] };
    expect(rank([site(1), site(2), site(3)], limited).map((s) => [s.rank, s.fails])).toEqual([
      [3, []],
      [2, ["elevation"]],
      [1, ["elevation"]],
    ]);
  });
});

describe("the alternatives", () => {
  const ranked = (xs: [number, number | null, LatLon][]): RankedSite[] =>
    xs.map(([rank, score, ll], index) => ({ index, rank, ll, rows: [], score, fails: [] }));
  const at = (dx: number): LatLon => [36.6, -81.3 + dx / 89_300]; // about dx metres east at 36.6°N

  it("are within 10 points of the best, 100 m from it and from each other, at most two", () => {
    const sites = ranked([
      [1, 90, at(0)],
      [2, 88, at(50)], // too close to the best
      [3, 85, at(300)],
      [4, 84, at(350)], // too close to #3
      [5, 81, at(600)],
      [6, 79, at(900)], // 11 points behind
    ]);
    expect(metresBetween(at(0), at(300))).toBeCloseTo(300, -1);
    const best = sites[0]!;
    const c = choicesBeside(sites, { ll: best.ll, score: best.score, fails: 0, index: best.index });
    expect(c.alternatives.map((s) => s.rank)).toEqual([3, 5]);
    expect(c.more.map((s) => s.rank)).toEqual([2, 4, 6]);
  });

  it("beside a marked house, which has no site score: the distance alone", () => {
    const sites = ranked([
      [1, 90, at(20)],
      [2, 50, at(400)],
    ]);
    const c = choicesBeside(sites, { ll: at(0), score: null, fails: 0, index: null });
    expect(c.alternatives.map((s) => s.rank)).toEqual([2]);
    expect(c.more.map((s) => s.rank)).toEqual([1]);
  });
});

describe("on the fixtures", () => {
  it("Macks: the starting list grades site #3, which beats site #1 on its rows", () => {
    const card = reportCard(expectedOf("macks-mountain-35-3", "run"), ZACH);
    expect(card.sites[0]!.rank).toBe(3);
    const score = (rank: number) => card.sites.find((s) => s.rank === rank)!.score!;
    expect(score(3)).toBeGreaterThan(score(1));
  });

  it("a flooded site #1 isn't the best while a dry site exists", () => {
    const res = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
    res.flood = { zones: ["AE"], sfha: true, sfhaAcres: 3, mapped: true };
    res.sites![0]!.flood = true;
    const card = reportCard(res, ZACH);
    expect(card.sites[0]!.rank).not.toBe(1);
    expect(card.gates.find((g) => g.key === "floodplain")!.status).not.toBe("fail");
  });

  it("a marked house is graded where it is, as before", () => {
    const res = expectedOf("ferney-creek-52-47A", "setHouse");
    const card = reportCard(res, ZACH);
    expect(card.at).toBe(0);
    expect(card.rows.find((x) => x.key === "elevation")!.detail).toMatch(/at the marked house$/);
  });
});
