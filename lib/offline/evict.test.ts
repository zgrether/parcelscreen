import { describe, expect, it } from "vitest";
import { automaticBytes, chooseEvictions, type CacheEntry } from "./evict";

const e = (key: string, bytes: number, usedAt: number, pins: string[] = []): CacheEntry => ({
  key,
  bytes,
  usedAt,
  pins,
});

describe("evicting map tiles", () => {
  it("does nothing within the cap", () => {
    expect(chooseEvictions([e("a", 50, 1), e("b", 50, 2)], 100)).toEqual([]);
  });

  it("drops the least recently used until under 90% of the cap", () => {
    const entries = [e("new", 40, 30), e("old", 40, 10), e("mid", 40, 20)];
    // 120 bytes over a cap of 100: down to 90 or less, so the oldest one goes (80 left).
    expect(chooseEvictions(entries, 100)).toEqual(["old"]);
    expect(chooseEvictions(entries, 50)).toEqual(["old", "mid"]);
  });

  it("never picks a pinned tile, nor counts it toward the cap", () => {
    const entries = [e("saved", 500, 1, ["mud-creek"]), e("a", 60, 2), e("b", 60, 3)];
    expect(automaticBytes(entries)).toBe(120);
    expect(chooseEvictions(entries, 100)).toEqual(["a"]);
    expect(chooseEvictions(entries, 10)).toEqual(["a", "b"]);
  });
});
