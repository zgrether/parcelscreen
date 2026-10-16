/** The site ranking's order (owner, #142): fit, then score, then an explicit tie-break, never the input order. */
import { describe, expect, it } from "vitest";
import { rerank } from "./score";
import type { Site } from "./types";

const site = (acres: number, score: number, ll: [number, number], fit: Site["fit"] = "fits"): Site =>
  ({ acres, score, ll, fit, rank: 0, grade: "F" }) as unknown as Site;
const order = (sites: Site[]) => rerank(sites).map((s) => `${s.acres}@${s.ll.join(",")}`);

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

  it("keeps fit first: a site the build doesn't fit on ranks after every one it does, whatever its score", () => {
    const r = rerank([site(5, 90, [36.9, -80.4], "house only"), site(1, 60, [36.8, -80.4])]);
    expect(r.map((s) => [s.rank, s.acres])).toEqual([
      [1, 1],
      [2, 5],
    ]);
  });
});
