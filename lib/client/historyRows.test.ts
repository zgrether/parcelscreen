import { describe, expect, it } from "vitest";
import { drawnPart } from "@/lib/geo/recipe";
import { built, county, square } from "@/test/support/parcels";
import { historyRows } from "./historyRows";

const SPLIT = {
  a: [36.62, -81.354] as [number, number],
  b: [36.64, -81.354] as [number, number],
  keep: 1 as const,
};

describe("History rows (owner, 16b)", () => {
  it("a lone parcel shows its name and acres, nothing more", () => {
    const [r] = historyRows([built("a")]);
    expect(r).toMatchObject({ key: "a", name: "52-47A", tellApart: null });
    expect(r!.acres).toBeGreaterThan(0);
  });

  it("two recipes of one record say what tells them apart: acres, and split or the piece count", () => {
    const rows = historyRows([
      built("whole"),
      built("split", { split: SPLIT }),
      built("plus", { pieces: [county(-81.355, "52-47A"), drawnPart(square(-81.353))] }),
      built("other", { pieces: [county(-81.351, "52-48")] }),
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.whole!.tellApart).toMatch(/^\d+\.\d\d ac · 1 piece$/);
    expect(by.split!.tellApart).toMatch(/^\d+\.\d\d ac · split$/);
    expect(by.split!.acres!).toBeLessThan(by.whole!.acres!);
    // A record plus a drawn piece is named "52-47A + drawn", so it doesn't collide.
    expect(by.plus!.name).not.toBe("52-47A");
    expect(by.plus!.tellApart).toBeNull();
    expect(by.other!.tellApart).toBeNull();
  });

  it("a split combination gives both", () => {
    const pair = [county(-81.355, "52-47A"), county(-81.353, "52-48")];
    const rows = historyRows([built("a", { pieces: pair }), built("b", { pieces: pair, split: SPLIT })]);
    expect(rows[0]!.tellApart).toMatch(/ · 2 pieces$/);
    expect(rows[1]!.tellApart).toMatch(/ · 2 pieces · split$/);
  });
});
