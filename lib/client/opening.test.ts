import { describe, expect, it } from "vitest";
import { openingPage } from "./opening";

describe("where the app opens (WF2b; owner, #132 review; step 8)", () => {
  it("the list when at least one favorite isn't archived, otherwise the map", () => {
    expect(openingPage([])).toBe("/explore");
    expect(openingPage([{ status: "archived" }, { status: "archived" }])).toBe("/explore");
    // Step 8: a parcel only in someone's History doesn't open the list.
    expect(openingPage([{ status: "archived" }, { status: "inProgress" }])).toBe("/explore");
    expect(openingPage([{ status: "archived" }, { status: "saved" }])).toBe("/library");
  });
});
