/** The panels' banded scales (value-ranking.md §6.2 (b); VR5 part 2): this parcel's band, and labels from config. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { SCREEN_CONSTANTS } from "../screen/config";
import { reportCard } from "./card";
import type { PanelKey } from "./cardPanels";
import { drivewayDesign, scalesFor } from "./scales";

const B = SCREEN_CONSTANTS.bands;
const scales = (slug: Parameters<typeof expectedOf>[0], panel: PanelKey, bands = B) => {
  const r = expectedOf(slug, "run");
  return scalesFor(panel, r, reportCard(r, "zach"), bands);
};
/** Labels as read: the no-break spaces and word joiners that keep "3–5 h" together are invisible. */
const plain = (t: string) => t.replace(/⁠/g, "").replace(/ /g, " ");
const labels = (x: { bands: string[] } | undefined) => x!.bands.map(plain);
const placed = (xs: ReturnType<typeof scales>) => xs.map((x) => [x.name, plain(x.bands[x.at!]!), x.value]);

describe("the banded scales", () => {
  it("Grayson 6273's homesite: winter sun, facing, frost belt and slope", () => {
    expect(placed(scales("grayson-mud-creek-6273", "homesite"))).toEqual([
      ["Winter sun", "Excellent 7+ h", "8.3 h"],
      ["Facing", "Cool", "faces W"],
      ["Frost belt", "Exposed", "650 ft above the valley floor"],
      ["Slope as foundation", "Walkout 4–10°", "7.0°"],
    ]);
  });

  it("the band labels carry config's edges", () => {
    const [sun, , frost, slope] = scales("grayson-mud-creek-6273", "homesite");
    expect(labels(sun)).toEqual(["Shaded under 3 h", "Workable 3–5 h", "Good 5–7 h", "Excellent 7+ h"]);
    expect(labels(frost)[1]).toBe("Thermal belt 80–400 ft");
    expect(labels(slope)).toEqual([
      "Slab or crawl under 4°",
      "Walkout 4–10°",
      "Cut-fill and walls 10–16°",
      "Engineered piers 16°+",
    ]);
    const moved = { ...B, winterSunH: [2, 4, 9] };
    const [sun2] = scales("grayson-mud-creek-6273", "homesite", moved);
    expect(labels(sun2)[3]).toBe("Excellent 9+ h");
    expect(labels(sun2)[sun2!.at!]).toBe("Good 4–9 h");
  });

  it("a unit never wraps away from its number (owner, #111)", () => {
    const [sun, , frost, slope] = scales("grayson-mud-creek-6273", "homesite");
    expect(sun!.bands[1]).toBe("Workable 3⁠–⁠5 h");
    expect(frost!.bands[1]).toBe("Thermal belt 80⁠–⁠400 ft");
    expect(slope!.bands[3]).toBe("Engineered piers 16°+");
  });

  it("the driveway, the room, the elevation, the sky and the garden", () => {
    expect(placed(scales("ferney-creek-52-47A", "easement"))).toEqual([
      ["Driveway", "Easy up to 8%", "5.3% over 30 m"],
    ]);
    const room = scales("grayson-mud-creek-6273", "room")[0]!;
    expect(labels(room)).toEqual([
      "Doesn't fit",
      "Tight under 1.25×",
      "Enough 1.25–2×",
      "Roomy 2–3×",
      "Spacious 3×+",
    ]);
    expect([labels(room)[room.at!], room.value]).toEqual(["Roomy 2–3×", "2.9×"]);
    expect(placed(scales("ferney-creek-52-47A", "room"))).toEqual([["Room to build", "Spacious 3×+", "41×"]]);
    expect(placed(scales("ferney-creek-52-47A", "elevation"))).toEqual([
      ["Elevation", "Mountain 2,500–3,000 ft", "2,729 ft"],
    ]);
    expect(placed(scales("grayson-mud-creek-6273", "sky"))).toEqual([["Sky", "Dark", "21.52 mag/arcsec²"]]);
    expect(placed(scales("grayson-mud-creek-6273", "garden"))).toEqual([
      ["Garden", "Kitchen garden", "0.10 ac"],
    ]);
    expect(placed(scales("ferney-creek-52-47A", "garden"))).toEqual([["Garden", "Small farm", "3.10 ac"]]);
  });

  it("the driveway sits at the grade it's built to, with the raw ground's reading as a note (owner, #111)", () => {
    const [dw] = scales("grayson-mud-creek-6273", "easement");
    expect([plain(dw!.bands[dw!.at!]!), dw!.value, dw!.note]).toEqual([
      "Pave or regrade 12–15%",
      "built to 15%",
      "17.9% on the raw ground over 30 m; a built road grades out 1–4 points.",
    ]);
    expect(drivewayDesign(expectedOf("grayson-mud-creek-6273", "run"))).toEqual({
      designPct: 15,
      rawPct: expect.closeTo(17.877, 3),
    });
    // Scored on the "no practical drive" steeper alternative: its design grade.
    const r = structuredClone(expectedOf("grayson-mud-creek-6273", "run"));
    const cost = { low: 1, mid: 2, high: 3 };
    r.driveway!.practical = {
      limitPct: 10,
      steeperPct: 12,
      readyToBuild: 300_000,
      share: 0.75,
      cost,
      steeper: null,
      easement: null,
      scoredOn: "steeper",
    };
    expect(drivewayDesign(r)!.designPct).toBe(12);
  });

  it("trails and town place the row's grade", () => {
    expect(placed(scales("grayson-mud-creek-6273", "trails"))).toEqual([["Trails", "A short drive", "B"]]);
    expect(placed(scales("macks-mountain-35-3", "town"))).toEqual([["Town and hospital", "Remote", "D"]]);
  });

  it("the panels without a scale yet", () => {
    for (const p of ["verdict", "floodplain", "access", "septic", "cost"] as const)
      expect(scales("ferney-creek-52-47A", p)).toEqual([]);
  });
});
