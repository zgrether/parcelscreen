/** VR3b: the septic class, the foundation type and the dig cost in rock (value-ranking.md §5.1–5.3). */
import { describe, expect, it } from "vitest";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import type { SoilRow } from "../screen/types";
import { digCost, foundationAt, septicClass } from "./derived";

const soil = (over: Partial<SoilRow>): SoilRow => ({
  mukey: "1",
  muname: "Test",
  farmlndcl: null,
  cokey: "1",
  compname: "Cowee",
  comppct_r: "80",
  drainagecl: null,
  hydricrating: null,
  slope_l: null,
  slope_h: null,
  brockdepmin: null,
  drclassdcd: null,
  hydgrpdcd: null,
  wtdepannmin: null,
  flodfreqdcd: "None",
  engdwbdcd: null,
  engdwobdcd: null,
  engstafdcd: null,
  englrsdcd: null,
  septic: null,
  ...over,
});

describe("the septic class (§5.3)", () => {
  it("not or somewhat limited is conventional; no rating is unknown", () => {
    expect(septicClass(soil({ septic: "Not limited" }))).toBe("Conventional");
    expect(septicClass(soil({ septic: "Somewhat limited" }))).toBe("Conventional");
    expect(septicClass(soil({ septic: null, engstafdcd: "Somewhat limited" }))).toBe("Conventional");
    expect(septicClass(soil({}))).toBeNull();
  });

  it("very limited: alternative for water, rock or flooding near the surface; modified otherwise", () => {
    expect(septicClass(soil({ septic: "Very limited" }))).toBe("Modified");
    expect(septicClass(soil({ septic: "Very limited", brockdepmin: "94" }))).toBe("Modified");
    expect(septicClass(soil({ septic: "Very limited", brockdepmin: "45" }))).toBe("Alternative");
    expect(septicClass(soil({ septic: "Very limited", wtdepannmin: "30" }))).toBe("Alternative");
    expect(septicClass(soil({ septic: "Very limited", flodfreqdcd: "Frequent" }))).toBe("Alternative");
  });
});

describe("the foundation type (§5.1)", () => {
  it("by slope; one step toward piers on shallow rock; engineered where NRCS rates it very limited", () => {
    expect(foundationAt(2, null)).toEqual({
      type: "Slab or crawl space",
      engineered: false,
      shallowRock: false,
    });
    expect(foundationAt(7, null).type).toBe("Walkout or garage-under");
    expect(foundationAt(12, null).type).toBe("Cut-and-fill and retaining walls");
    expect(foundationAt(18, null).type).toBe("Engineered piers");
    expect(foundationAt(7, soil({ brockdepmin: "40" }))).toMatchObject({
      type: "Cut-and-fill and retaining walls",
      shallowRock: true,
    });
    expect(foundationAt(18, soil({ brockdepmin: "40" })).type).toBe("Engineered piers"); // no step past piers
    expect(foundationAt(2, soil({ engdwobdcd: "Very limited" })).engineered).toBe(true);
  });
});

describe("the dig cost in rock (§5.2)", () => {
  const dw = DEFAULT_USER_CONFIG.dw;

  it("the owner's example: 1,500 sq ft × 8 ft, Cowee with rock at 99 cm, at $12 and $90 a yard", () => {
    const d = digCost(soil({ brockdepmin: "99" }), dw);
    expect(d.yd3).toBeCloseTo(444.44, 2);
    expect(d.allSoil).toBeCloseTo(5333.33, 2); // §5.2: $5,333
    // §5.2 rounds to 181 and 264 yd³ ($25,909); 99 cm is 3.248 ft, so 180.4 and 264.0.
    expect(d.withRock).toBeCloseTo(25925, -1);
    expect(d.rockCm).toBe(99);
  });

  it("rock below the basement, or none on record: all soil", () => {
    expect(digCost(soil({ brockdepmin: "300" }), dw).withRock).toBeCloseTo(5333.33, 2);
    const unknown = digCost(soil({}), dw);
    expect(unknown.withRock).toBe(unknown.allSoil);
    expect(unknown.rockCm).toBeNull();
  });
});
