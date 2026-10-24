/**
 * Explaining the fit (owner, 10/23): each area's rank, what holds it back (the Must failing on the most land, then the
 * two weakest graded factors), the catalog-wide line when one Must rules out most of the region, and the reason on an
 * area left out of the top five. Display only: no grade, points or share changes.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultRubric } from "../rubric/default";
import { MINE, type NamedRubric, type Rubric } from "../rubric/types";
import { areaCard, rankAreas, rankOf, regionWideLimit } from "./score";
import { AreaFileSchema, type AreaFile } from "./types";
import { holdsBack, notSuggestedReason, rankLine, regionLine } from "./words";

const DIR = join(process.cwd(), "public", "areas", "v1");
const files: AreaFile[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => AreaFileSchema.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))));
const nr = (rubric: Rubric): NamedRubric => ({ id: MINE, name: "Mine", rubric });
const withMusts = (musts: { factor: string; threshold: number }[]): NamedRubric =>
  nr({ ...defaultRubric(), musts: [...defaultRubric().musts, ...musts] } as Rubric);
const rank = (r: NamedRubric) =>
  rankAreas(
    files.map((f) => areaCard(f, r)),
    new Map(files.map((f) => [f.id, f.name])),
  );

describe("the rank", () => {
  it("every area's place, 1 first, in the box's order; said beside the letter", () => {
    const ranked = rank(nr(defaultRubric()));
    const ranks = rankOf(ranked);
    expect(ranks.size).toBe(files.length);
    expect(ranks.get(ranked[0]!.id)).toBe(1);
    expect(ranks.get(ranked.at(-1)!.id)).toBe(files.length);
    expect(rankLine("C+", 3, 30)).toBe("C+ · #3 of 30 for you");
  });
});

describe("what holds an area back", () => {
  const grayson = files.find((f) => f.id === "grayson-highlands")!;

  it("the Must failing on the most land, with its share; then the two weakest graded factors, weakest first", () => {
    const card = areaCard(
      grayson,
      withMusts([
        { factor: "trails", threshold: 15 },
        { factor: "hospital", threshold: 60 },
      ]),
    );
    const trails = card.limitShares.find((l) => l.factor === "trails")!;
    const hospital = card.limitShares.find((l) => l.factor === "hospital")!;
    expect(trails.share).toBeLessThanOrEqual(hospital.share);
    const back = holdsBack(card, grayson);
    const pct = Math.round(trails.share * 100);
    expect(back.must).toBe(
      pct === 0
        ? "None of the rural land here is within 15 minutes of a trailhead."
        : `Only ${pct}% of rural land here is within 15 minutes of a trailhead.`,
    );
    expect(back.weakest).toHaveLength(2);
    // Weakest first: the first's letter is no better than the second's.
    const letters = back.weakest.map((w) => /, ([A-F])/.exec(w)![1]!);
    expect(letters[0]! >= letters[1]!).toBe(true);
  });

  it("each limit's share is its own: the joint share is never more than the smallest", () => {
    const card = areaCard(
      grayson,
      withMusts([
        { factor: "elevation", threshold: 3000 },
        { factor: "hospital", threshold: 30 },
      ]),
    );
    expect(card.mustShare).toBeLessThanOrEqual(Math.min(...card.limitShares.map((l) => l.share)) + 1e-9);
  });

  it("no limit an area can measure: no Must line, only the weakest factors", () => {
    const back = holdsBack(areaCard(grayson, nr(defaultRubric())), grayson);
    expect(back.must).toBeNull();
    expect(back.weakest.length).toBeGreaterThan(0);
  });
});

describe("the catalog-wide line", () => {
  it("a Must under 25% in at least 25 of the 30 areas is named, with a way to change it", () => {
    // A trailhead within 3 minutes: hardly any rural land anywhere.
    const tight = rank(withMusts([{ factor: "trails", threshold: 3 }]));
    const l = regionWideLimit(tight)!;
    expect(l).toEqual({ factor: "trails", threshold: 3 });
    expect(regionLine(l)).toBe(
      "Your 3-minute trailhead limit rules out most of the region; that's why few areas fit.",
    );
  });

  it("a generous Must, or none: no line", () => {
    expect(regionWideLimit(rank(withMusts([{ factor: "hospital", threshold: 120 }])))).toBeNull();
    expect(regionWideLimit(rank(nr(defaultRubric())))).toBeNull();
  });
});

describe("areas under the 10% rule", () => {
  it("stay in the ranking, after the suggested ones, each with its reason", () => {
    const ranked = rank(withMusts([{ factor: "elevation", threshold: 3500 }]));
    expect(ranked).toHaveLength(files.length);
    const firstOut = ranked.findIndex((c) => !c.suggestable);
    expect(firstOut).toBeGreaterThan(-1);
    expect(ranked.slice(firstOut).every((c) => !c.suggestable)).toBe(true);
    const out = ranked[firstOut]!;
    expect(notSuggestedReason(out)).toBe(`only ${Math.round(out.mustShare * 100)}% passes your must-haves`);
  });
});
