/** The site ranking's order (owner, #142): fit, then score, then an explicit tie-break, never the input order. */
import { describe, expect, it } from "vitest";
import { derivedSites } from "./derive";
import { expectedOf } from "@/test/support/expected";
import { FIXTURE_SLUGS } from "@/test/support/fixtures";
import { SCENARIOS } from "@/test/support/scenarios";
import { rerank } from "./score";
import type { ScoredSite } from "./types";

const site = (
  acres: number,
  score: number,
  ll: [number, number],
  fit: ScoredSite["fit"] = "fits",
): ScoredSite => ({ acres, score, ll, fit, rank: 0, grade: "F" }) as unknown as ScoredSite;
const order = (sites: ScoredSite[]) => rerank(sites).map((s) => `${s.acres}@${s.ll.join(",")}`);

describe("rerank", () => {
  it("ties at a score go to the larger site, then the one further north, then further west", () => {
    const sites = [
      site(0.37, 70, [36.888, -80.452]),
      site(1.12, 70, [36.887, -80.456]),
      site(1.12, 70, [36.889, -80.456]), // same size, further north
      site(1.12, 70, [36.889, -80.457]), // same size and latitude, further west
      site(2.11, 69, [36.88, -80.45]),
    ];
    const expected = [
      "1.12@36.889,-80.457",
      "1.12@36.889,-80.456",
      "1.12@36.887,-80.456",
      "0.37@36.888,-80.452",
      "2.11@36.88,-80.45",
    ];
    expect(order(sites)).toEqual(expected);
    expect(order([...sites].reverse())).toEqual(expected);
  });

  it("compares scores at whole points: a difference under a point falls through to the size tie-break", () => {
    // A site's score is stored rounded (Math.round of the overall, scoreSiteDetailed and withDrivewayCost): 70.4 and
    // 69.6 are both 70, so the larger site goes first even though its unrounded overall is lower.
    const r = rerank([site(0.5, Math.round(70.4), [36.9, -80.4]), site(2, Math.round(69.6), [36.8, -80.5])]);
    expect(r.map((x) => x.acres)).toEqual([2, 0.5]);
  });

  it("every derived site score is a whole number, the precision rerank compares at", () => {
    for (const slug of FIXTURE_SLUGS)
      for (const sc of SCENARIOS[slug])
        for (const x of derivedSites(expectedOf(slug, sc)) ?? [])
          expect(Number.isInteger(x.score)).toBe(true);
  });

  it("keeps fit first: a site the build doesn't fit on ranks after every one it does, whatever its score", () => {
    const r = rerank([site(5, 90, [36.9, -80.4], "house only"), site(1, 60, [36.8, -80.4])]);
    expect(r.map((s) => [s.rank, s.acres])).toEqual([
      [1, 1],
      [2, 5],
    ]);
  });
});
