import { describe, expect, it } from "vitest";
import { PANEL_KEYS } from "@/lib/report/cardPanels";
import { panelFromSearch, withPanel } from "./panelUrl";

describe("the open panel in the explorer's URL (#121 review)", () => {
  it("reads a panel the URL names, every panel", () => {
    expect(panelFromSearch("?panel=sky")).toBe("sky");
    expect(panelFromSearch("?debug=1&panel=trails")).toBe("trails");
    for (const k of PANEL_KEYS) expect(panelFromSearch(`?panel=${k}`)).toBe(k);
  });

  it("ignores a name that isn't a panel, or none", () => {
    expect(panelFromSearch("?panel=moon")).toBeNull();
    expect(panelFromSearch("?panel=")).toBeNull();
    expect(panelFromSearch("?panel=constructor")).toBeNull();
    expect(panelFromSearch("")).toBeNull();
  });

  it("sets and removes it, keeping the path, the other parameters and the hash", () => {
    expect(withPanel("http://x.test/explore", "sky")).toBe("/explore?panel=sky");
    expect(withPanel("http://x.test/explore?panel=sky", "town")).toBe("/explore?panel=town");
    expect(withPanel("http://x.test/explore?debug=1&panel=sky#a", null)).toBe("/explore?debug=1#a");
    expect(withPanel("http://x.test/explore?panel=sky", null)).toBe("/explore");
  });
});
