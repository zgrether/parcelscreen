/** The cards in plain words (step 3 plan §2): at the rubric's own bands, with each band and minimum in words. */
import { describe, expect, it } from "vitest";
import { defaultRubric } from "./default";
import { moveCard, setBandEdge } from "./edit";
import { bandLine, cardLine, minimumLine, whyLine } from "./words";
import { GATE_KEYS, ROW_KEYS } from "./types";

const D = defaultRubric();

describe("the cards' words", () => {
  it("say what each factor asks for at its B/C edge", () => {
    expect(Object.fromEntries([...GATE_KEYS, ...ROW_KEYS].map((f) => [f, cardLine(D, f)]))).toEqual({
      floodplain: "No FEMA flood zone at the build site or on the driveway",
      access: "Legal road access: frontage, or a recorded right-of-way",
      easement: "The driveway stays on your land, or its easement is recorded",
      septic: 'A septic field fits: a soil rates better than "very limited"',
      elevation: "Build site at 2,500 ft or higher",
      homesite: "A good house site: winter sun, facing and slope",
      sky: "A night sky of at least 21.2 mag/arcsec²",
      room: "Gentle ground of at least 2× the build footprint",
      trails: "A trailhead within a 20-minute drive (or public land within 1 mi)",
      town: "An ER within 30 min and groceries within 20",
      garden: "At least 0.25 ac of garden ground",
    });
  });

  it("follow the slider", () => {
    expect(cardLine(setBandEdge(D, "elevationFt", 3000), "elevation")).toBe(
      "Build site at 3,000 ft or higher",
    );
    expect(cardLine(setBandEdge(D, "erMin", 20), "town")).toBe("An ER within 20 min and groceries within 20");
  });

  it("show the whole band", () => {
    expect(bandLine(D.bands, "elevationFt")).toBe("A 3,000 ft+ · B 2,500 ft · C 2,000 ft · D 1,500 ft");
    expect(bandLine(D.bands, "erMin")).toBe("A 20 min · B 30 min · C 45 min · D 60 min");
  });

  it("put a minimum in words", () => {
    expect(minimumLine({ factor: "town", threshold: 30 })).toBe("Town and hospital: ER within 30 min");
    expect(minimumLine({ factor: "elevation", threshold: 3000 })).toBe(
      "Elevation at the build site: at least 3,000 ft",
    );
    expect(minimumLine({ factor: "trails", threshold: 20 })).toBe(
      "Trails and public land: a trailhead within 20 min",
    );
  });

  it("say why a card is there: the default card's, or yours", () => {
    expect(whyLine(D, "elevation")).toBe("From the default card");
    expect(whyLine(setBandEdge(D, "elevationFt", 3000), "elevation")).toBe("You changed it");
    const moved = moveCard(D, { kind: "factor", factor: "septic" }, "wont");
    expect(moved.ok && whyLine(moved.rubric, "septic")).toBe("You changed it");
    expect(moved.ok && whyLine(moved.rubric, "access")).toBe("From the default card");
  });
});
