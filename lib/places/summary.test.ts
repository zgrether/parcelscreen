/** The refresh's places summary (step 14d plan §7, §10): a bake before and after, in plain lines. */
import { describe, expect, it } from "vitest";
import type { Place } from "../screen/placeData";
import { placesSummary } from "./summary";

const TOWNS = [
  { name: "Damascus", ll: [36.63, -81.79] as [number, number] },
  { name: "Sparta", ll: [36.5, -81.12] as [number, number] },
];
const head = (id: string, ll: [number, number], name: string): Place => ({
  kind: "trailhead",
  id,
  ll,
  src: "osm",
  name,
});

describe("the places summary", () => {
  it("added and dropped by kind and nearest town, each name once, a launch that changed water, what was kept", () => {
    const before: Place[] = [
      { kind: "grocer", id: "osm:node/1", ll: [36.51, -81.13], src: "osm", name: "Food Lion", big: true },
      {
        kind: "launch",
        id: "osm:node/5",
        ll: [36.62, -81.8],
        src: "osm",
        name: "Laurel access",
        water: "flat",
      },
      { kind: "parking", id: "osm:way/9", ll: [36.6, -81.8], src: "osm" },
    ];
    const after: Place[] = [
      head("osm:node/2", [36.64, -81.78], "Feathercamp"),
      head("osm:node/3", [36.62, -81.8], "Feathercamp"),
      head("osm:node/4", [36.61, -81.77], "Straight Branch"),
      {
        kind: "launch",
        id: "osm:node/5",
        ll: [36.62, -81.8],
        src: "osm",
        name: "Laurel access",
        water: "river",
      },
    ];
    const s = placesSummary(before, after, TOWNS, ["usfs"]);
    expect(s.changed).toBe(true);
    expect(s.markdown).toContain("- +3 trailheads near Damascus (Feathercamp, Straight Branch)");
    expect(s.markdown).toContain("- −1 grocery near Sparta (Food Lion)");
    expect(s.markdown).toContain("- 1 launch moved to river near Damascus (Laurel access)");
    expect(s.markdown).toContain("**Kept from the last bake** (they didn't answer): usfs.");
    // Parking isn't a place of its own: its lot gone says nothing.
    expect(s.markdown).not.toMatch(/parking/);
  });

  it("nothing moved: says so, and isn't a change", () => {
    const same = [head("osm:node/2", [36.64, -81.78], "Feathercamp")];
    const s = placesSummary(same, same, TOWNS);
    expect(s.changed).toBe(false);
    expect(s.markdown).toContain("No place was added, dropped or moved.");
  });

  it("with no towns baked yet, the lines name no town", () => {
    const s = placesSummary([], [head("osm:node/2", [36.64, -81.78], "Feathercamp")], []);
    expect(s.markdown).toContain("- +1 trailhead (Feathercamp)");
  });
});
