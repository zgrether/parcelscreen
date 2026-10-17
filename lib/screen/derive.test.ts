/**
 * The derivations reproduce the engine exactly (step 1 plan §3.3): on every fixture and scenario, each site's and
 * the house's scores, the sky score, the flags and the verdict derived from the stored measurements equal
 * grades-v7.json, recorded once from the v7 results (which stored them) before the derivations existed and never
 * regenerated: the oracle that outlives the v8 cut. The rerank invariant: applying rerank to the derived scores gives
 * back the stored order, so a scoring change that breaks it fails CI instead of showing site #2 scoring above site #1
 * (owner, 2026-10-16).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { differences } from "@/test/support/compare";
import { expectedOf } from "@/test/support/expected";
import { FIXTURE_SLUGS, type FixtureSlug } from "@/test/support/fixtures";
import { SCENARIOS } from "@/test/support/scenarios";
import { derived, derivedHouse, derivedSites, skyScoreOf, storedHouse, storedSite } from "./derive";
import { flagsOf, verdictOf } from "./flags";
import { rerank } from "./score";
import type { Flag, SpotScores, Verdict } from "./types";

const SCORE = ["score", "grade", "quality", "qGrade", "q", "c", "costIdx", "costTier"] as const;
const scoresOf = (s: SpotScores): SpotScores =>
  Object.fromEntries(SCORE.map((k) => [k, s[k]])) as unknown as SpotScores;

interface RecordedScenario {
  verdict: Verdict;
  flags: Flag[];
  sky: { score: number } | null;
  sites: (SpotScores & { rank: number })[];
  house: SpotScores | null;
}
const recorded = (slug: FixtureSlug): Record<string, RecordedScenario> =>
  JSON.parse(readFileSync(join(process.cwd(), "test", "fixtures", slug, "grades-v7.json"), "utf8")) as Record<
    string,
    RecordedScenario
  >;

describe("the derivations equal the v7 record (grades-v7.json)", () => {
  for (const slug of FIXTURE_SLUGS)
    for (const scenario of SCENARIOS[slug]) {
      const r = expectedOf(slug, scenario);
      const want = recorded(slug)[scenario]!;

      it(`${slug} ${scenario}: every site's scores`, () => {
        const sites = derivedSites(r)!;
        expect(sites.length).toBe(want.sites.length);
        sites.forEach((s, i) => {
          expect(s.rank).toBe(want.sites[i]!.rank);
          expect(differences(scoresOf(s), scoresOf(want.sites[i]!))).toEqual([]);
        });
      });

      it(`${slug} ${scenario}: the house's scores`, () => {
        const h = derivedHouse(r);
        if (!h || "outside" in h) {
          expect(want.house).toBeNull();
          return;
        }
        expect(differences(scoresOf(h), scoresOf(want.house!))).toEqual([]);
      });

      it(`${slug} ${scenario}: the sky score`, () => {
        expect(skyScoreOf(r.sky!)).toBe(want.sky!.score);
      });

      it(`${slug} ${scenario}: the flags and the verdict`, () => {
        const flags = flagsOf(r);
        expect(flags).toEqual(want.flags);
        expect(verdictOf(flags)).toBe(want.verdict);
        expect(derived(r).verdict).toBe(want.verdict);
      });

      it(`${slug} ${scenario}: rerank over the derived scores gives back the stored order`, () => {
        const sites = derivedSites(r)!;
        expect(rerank(sites).map((s) => s.ll)).toEqual(r.sites!.map((s) => s.ll));
        expect(rerank(sites).map((s) => s.rank)).toEqual(r.sites!.map((s) => s.rank));
      });
    }

  it("the stored result holds no grades: a derived site stripped again is the stored one", () => {
    const r = expectedOf("ferney-creek-52-47A", "setHouse");
    for (const [i, s] of derivedSites(r)!.entries()) expect(storedSite(s)).toEqual(r.sites![i]);
    expect(storedHouse(derivedHouse(r))).toEqual(r.house);
    const keys = Object.keys(r.sites![0]!);
    for (const k of SCORE) expect(keys).not.toContain(k);
    expect("verdict" in r).toBe(false);
    expect("flags" in r).toBe(false);
    expect("score" in r.sky!).toBe(false);
  });

  it("the derivations don't change the stored result", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    const before = JSON.stringify(r);
    derived(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});
