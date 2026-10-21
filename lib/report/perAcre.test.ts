import { describe, expect, it } from "vitest";
import { perAcre } from "./perAcre";

describe("price per acre (step 10b plan §3)", () => {
  it("is over the listing's acres when the listing gives them, to $10", () => {
    expect(perAcre(185_000, 52, 43.9)).toMatchObject({ value: 3_560, text: "$3,560/ac", on: "listed" });
  });

  it("is over the boundary's acres otherwise, and nothing without a price or acres", () => {
    expect(perAcre(185_000, null, 29.31)).toMatchObject({ value: 6_310, text: "$6,310/ac", on: "boundary" });
    expect(perAcre(null, 52, 43.9)).toBeNull();
    expect(perAcre(185_000, null, null)).toBeNull();
    expect(perAcre(185_000, 0, 29.31)?.on).toBe("boundary");
  });

  it("is marked, with both readings, when the acres differ by more than 5% of the boundary's", () => {
    // The brief's example: 45.6 listed, 38.8 boundary.
    expect(perAcre(296_400, 45.6, 38.8)).toMatchObject({
      differs: true,
      both: "$6,500/ac on 45.6 listed ac; $7,640/ac on 38.8 boundary ac",
    });
    // Within 5%: not marked.
    expect(perAcre(200_000, 41, 40)).toMatchObject({ differs: false, both: null });
    // Only one acreage: nothing to compare.
    expect(perAcre(200_000, null, 40)?.differs).toBe(false);
  });
});
