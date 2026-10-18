import { describe, expect, it } from "vitest";
import { PLACES, placeOf, showsNav } from "./places";

describe("the app's places (step 4b)", () => {
  it("three tabs, in order, with their routes", () => {
    expect(PLACES.map((p) => [p.label, p.href])).toEqual([
      ["Map", "/explore"],
      ["Your list", "/library"],
      ["What matters", "/priorities"],
    ]);
  });

  it("marks the place a page belongs to: Compare under Your list, Help and the rest under none", () => {
    expect(placeOf("/explore")).toBe("map");
    expect(placeOf("/library")).toBe("list");
    expect(placeOf("/compare")).toBe("list");
    expect(placeOf("/priorities")).toBe("matters");
    expect(placeOf("/rulebook")).toBeNull();
    expect(placeOf("/help")).toBeNull();
    expect(placeOf("/libraryx")).toBeNull();
  });

  it("no tabs on the opening redirect or in the interview", () => {
    expect(showsNav("/")).toBe(false);
    expect(showsNav("/interview")).toBe(false);
    for (const p of ["/explore", "/library", "/compare", "/priorities", "/rulebook"])
      expect(showsNav(p)).toBe(true);
  });
});
