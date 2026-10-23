import { describe, expect, it } from "vitest";
import { median } from "./profile";

describe("the median", () => {
  it("ignores nulls; the middle, or the mean of the two middles", () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([null, null])).toBeNull();
    expect(median([])).toBeNull();
  });
});
