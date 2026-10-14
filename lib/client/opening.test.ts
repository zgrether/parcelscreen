import { describe, expect, it } from "vitest";
import { openingPage } from "./opening";

describe("where the app opens (WF2b; owner, #132 review)", () => {
  it("the list when at least one parcel isn't archived, otherwise the map", () => {
    expect(openingPage([])).toBe("/explore");
    expect(openingPage([{ status: "archived" }, { status: "archived" }])).toBe("/explore");
    expect(openingPage([{ status: "archived" }, { status: "inProgress" }])).toBe("/library");
    expect(openingPage([{ status: "saved" }])).toBe("/library");
  });
});
