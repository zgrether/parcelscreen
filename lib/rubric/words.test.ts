/** The cards in plain words (step 3 plan §2): at the rubric's own bands, with each band and minimum in words. */
import { describe, expect, it } from "vitest";
import { defaultRubric } from "./default";
import { moveCard, setBandEdge } from "./edit";
import { bandLine, cardLine, limitWhy, minimumLine, plainLine, whyLine } from "./words";
import { rubricFromAnswers } from "./interview/generate";
import { GATE_KEYS, ROW_KEYS } from "./types";

const D = defaultRubric();

describe("the cards' words", () => {
  it("say what each factor asks for at its B/C edge", () => {
    expect(Object.fromEntries([...GATE_KEYS, ...ROW_KEYS].map((f) => [f, cardLine(D, f)]))).toEqual({
      floodplain: "No FEMA flood zone at the build site or on the driveway",
      access: "Frontage on a public road, or a recorded right-of-way",
      easement: "The driveway stays on your land, or its easement is recorded",
      septic: 'A septic field fits: a soil rates better than "very limited"',
      elevation: "Build site at 2,500 ft or higher",
      homesite: "A good house site: winter sun, facing and slope",
      sky: "A night sky of at least 21.2 mag/arcsec²",
      room: "Gentle ground of at least 2× the build footprint",
      driveway: "A driveway no steeper than 15% at its steepest",
      trails: "A trailhead within a 20-minute drive (or public land within 1 mi)",
      // Step 11: Town and hospital, split in two.
      town: "Groceries within 20 min",
      hospital: "An ER within 30 min",
      climate: "January lows of 18 °F or milder, July highs of 86 °F or cooler",
      privacy: "The nearest house at least 660 ft away",
      garden: "At least 0.25 ac of garden ground",
      // Step 10: the starting list has no budgets.
      budget: "No budget given",
    });
  });

  it("follow the slider", () => {
    expect(cardLine(setBandEdge(D, "elevationFt", 3000), "elevation")).toBe(
      "Build site at 3,000 ft or higher",
    );
    expect(cardLine(setBandEdge(D, "erMin", 20), "hospital")).toBe("An ER within 20 min");
    expect(cardLine(setBandEdge(D, "groceryMin", 30), "town")).toBe("Groceries within 30 min");
  });

  it("show the whole band", () => {
    expect(bandLine(D.bands, "elevationFt")).toBe("A 3,000 ft+ · B 2,500 ft · C 2,000 ft · D 1,500 ft");
    expect(bandLine(D.bands, "erMin")).toBe("A 20 min · B 30 min · C 45 min · D 60 min");
    expect(bandLine(D.bands, "drivewayPct")).toBe("A 10% · B 15% · C 20% · D 25%");
  });

  it("Climate's limits, with no limit at a slider's end (step 11)", () => {
    expect(cardLine(setBandEdge(setBandEdge(D, "janLowF", -25), "julHighF", 80), "climate")).toBe(
      "Any winter, July highs of 80 °F or cooler",
    );
    expect(plainLine(setBandEdge(setBandEdge(D, "janLowF", 24), "julHighF", 115), "climate")).toBe(
      "January lows of 24 °F or milder, any summer",
    );
  });

  it("put a minimum in words", () => {
    expect(minimumLine({ factor: "hospital", threshold: 30 })).toBe("Hospital: ER within 30 min");
    expect(minimumLine({ factor: "town", threshold: 15 })).toBe(
      "Town and groceries: groceries within 15 min",
    );
    expect(minimumLine({ factor: "elevation", threshold: 3000 })).toBe(
      "Elevation at the build site: at least 3,000 ft",
    );
    expect(minimumLine({ factor: "trails", threshold: 20 })).toBe(
      "Trails and public land: a trailhead within 20 min",
    );
  });

  it("in plain words on the priorities page, the exact number left to the sheet (owner, 10/18)", () => {
    expect(Object.fromEntries([...GATE_KEYS, ...ROW_KEYS].map((f) => [f, plainLine(D, f)]))).toEqual({
      floodplain: "No flood zone at the house or the driveway",
      access: "Reachable by a public road, or a recorded right-of-way",
      easement: "The driveway stays on your land, or its easement is recorded",
      septic: "Soil that can take a septic field",
      elevation: "2,500 ft or higher",
      homesite: "A sunny, gentle spot for the house",
      sky: "Dark enough to see the Milky Way",
      room: "Enough gentle ground for the house",
      driveway: "A driveway no steeper than 15%",
      trails: "A trailhead within 20 min, or public land within 1 mi",
      town: "Groceries within 20 min",
      hospital: "ER within 30 min",
      climate: "January lows of 18 °F or milder, July highs of 86 °F or cooler",
      privacy: "The nearest house at least 660 ft away",
      garden: "Room for a kitchen garden",
      budget: "No budget given",
    });
    expect(plainLine(setBandEdge(D, "skyMag", 20.5), "sky")).toBe("Some stars, even with a town's glow");
    expect(plainLine(setBandEdge(D, "gardenAc", 1), "garden")).toBe("Room for a big garden");
  });

  it("say why a card is there: the starting list's, or yours", () => {
    expect(whyLine(D, "elevation")).toBe("On the starting list.");
    expect(whyLine(setBandEdge(D, "elevationFt", 3000), "elevation")).toBe("You moved this here.");
    const moved = moveCard(D, { kind: "factor", factor: "septic" }, "wont");
    expect(moved.ok && whyLine(moved.rubric, "septic")).toBe("You moved this here.");
    expect(moved.ok && whyLine(moved.rubric, "access")).toBe("On the starting list.");
  });

  it("after the interview: the answer that put it there, in the person's terms (owner, 10/18)", () => {
    const g = rubricFromAnswers({ er: "30", sunView: "sun", walkAway: { chips: ["erOver"], erOverMin: 45 } });
    const ctx = { base: g.rubric, why: g.why };
    expect(whyLine(g.rubric, "hospital", ctx)).toBe("You'd want an ER within 30 minutes");
    expect(whyLine(g.rubric, "room", ctx)).toBe("On the starting list.");
    expect(limitWhy(g.rubric, "hospital", ctx)).toBe("You'd walk away from an ER more than 45 minutes away");
    const slid = setBandEdge(g.rubric, "erMin", 20);
    expect(whyLine(slid, "hospital", ctx)).toBe("You moved this here.");
    const off = moveCard(g.rubric, { kind: "factor", factor: "homesite" }, "wont");
    expect(off.ok && whyLine(off.rubric, "homesite", ctx)).toBe("You moved this here.");
    // Another card's move doesn't move this one.
    const up = moveCard(g.rubric, { kind: "factor", factor: "garden" }, "should", 0);
    expect(up.ok && whyLine(up.rubric, "homesite", ctx)).toBe(
      "You'd rather have sun at breakfast than a long view",
    );
  });
});
