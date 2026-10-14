import { describe, expect, it } from "vitest";
import { openingPage } from "./opening";

describe("where the app opens (WF2b)", () => {
  it("the list when it has parcels, otherwise the map", () => {
    expect(openingPage(0)).toBe("/explore");
    expect(openingPage(1)).toBe("/library");
  });
});
