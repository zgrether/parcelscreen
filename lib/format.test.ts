import { describe, expect, it } from "vitest";
import { compass, fmt } from "./format";

describe("compass", () => {
  it.each([
    [0, "N"],
    [11.24, "N"],
    [11.25, "NNE"],
    [90, "E"],
    [165, "SSE"],
    [180, "S"],
    [225, "SW"],
    [348.75, "N"], // rounds up to 16 → wraps to N
    [359.9, "N"],
  ])("%s° → %s", (deg, name) => expect(compass(deg)).toBe(name));
});

describe("fmt", () => {
  it("uses fixed decimals", () => {
    expect(fmt(8.7, 1)).toBe(
      (8.7).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    );
    expect(fmt(2.5)).toBe((2.5).toLocaleString(undefined, { maximumFractionDigits: 0 }));
  });
  it("shows an em dash for non-finite values", () => {
    expect(fmt(NaN)).toBe("—");
    expect(fmt(Infinity, 2)).toBe("—");
  });
});
