import { describe, expect, it } from "vitest";
import { differences } from "./compare";

describe("differences (the parity comparator)", () => {
  it("accepts numbers within the relative tolerance and rejects beyond it", () => {
    expect(differences({ x: 4088137.5436460427 }, { x: 4088137.543646043 })).toEqual([]);
    expect(differences({ x: 1.0001 }, { x: 1 })).toEqual(["x: 1.0001 vs 1 (diff 1.00e-4)"]);
  });

  it("treats null and NaN/Infinity as the same non-finite value", () => {
    expect(differences({ s: NaN }, { s: null })).toEqual([]);
    expect(differences({ s: 3 }, { s: null })).toEqual(["s: 3 vs null"]);
  });

  it("is exact on strings, booleans, lengths and keys", () => {
    expect(differences({ g: "A" }, { g: "B" })).toEqual(['g: "A" vs "B"']);
    expect(differences([1, 2], [1])).toEqual(["(root): length 2 vs 1"]);
    expect(differences({ a: 1 }, { a: 1, b: 2 })).toEqual(["b: missing in actual"]);
    expect(differences({ a: 1, c: 0 }, { a: 1 })).toEqual(["c: unexpected in actual"]);
  });

  it("applies per-path tolerances, most specific first, ignoring array indices", () => {
    const opts = { paths: { "sites.": { abs: 0.5 }, "sites.sunH": { abs: 0.1 } } };
    expect(
      differences({ sites: [{ sunH: 8.75, quality: 86.4 }] }, { sites: [{ sunH: 8.7, quality: 86 }] }, opts),
    ).toEqual([]);
    expect(differences({ sites: [{ sunH: 8.9 }] }, { sites: [{ sunH: 8.7 }] }, opts)).toHaveLength(1);
  });

  it("skips ignored paths", () => {
    expect(differences({ runAt: "x", a: 1 }, { runAt: "y", a: 1 }, { ignore: ["runAt"] })).toEqual([]);
  });
});
