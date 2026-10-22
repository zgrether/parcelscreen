/**
 * The Climate row (step 11, plan §2.2): the worse of January's low and July's high at the card's site, against the
 * person's limits; "not measured" on a screen made before it, never a fail; and Climate's place in saved priorities.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { ZACH } from "@/test/support/rubrics";
import { defaultRubric } from "../rubric/default";
import { setBandEdge } from "../rubric/edit";
import { placedAgain, withFactor } from "../rubric/factorsAdd";
import { rubricFromAnswers } from "../rubric/interview/generate";
import type { Rubric } from "../rubric/types";
import type { ScreenResult } from "../screen/types";
import { cardFacts, reportCard } from "./card";
import { NOT_MEASURED, OUTSIDE_AREA } from "./climate";

const MUD = expectedOf("grayson-mud-creek-6273", "run");

/** Mud Creek with every site's climate set, or cleared as a screen made before step 11 has it. */
function withSites(janLowF: number, julHighF: number): ScreenResult {
  const r = structuredClone(MUD);
  for (const s of r.sites!) s.climate = { ...s.climate!, janLowF, julHighF };
  return r;
}

describe("the Climate row", () => {
  it("grades the worse season on the starting list's limits (January lows of 18 °F up, July highs to 86 °F)", () => {
    const at = (jan: number, jul: number) =>
      cardFacts(withSites(jan, jul)).rows.find((x) => x.key === "climate")!.grade;
    // B/C edge at the limit; an A 3 °F inside it; a C up to 3 °F past, a D up to 7.
    expect([at(21, 80), at(18, 80), at(16, 80), at(12, 80), at(10, 80)]).toEqual(["A", "B", "C", "D", "F"]);
    expect([at(25, 83), at(25, 86), at(25, 88), at(25, 93), at(25, 94)]).toEqual(["A", "B", "C", "D", "F"]);
    expect(at(16, 92)).toBe("D"); // the worse of a C winter and a D summer
  });

  it("says the site, its elevation, and the station's snow and frost", () => {
    const row = cardFacts(MUD).rows.find((x) => x.key === "climate")!;
    expect(row.detail).toMatch(/^January lows [\d.]+ °F, July highs [\d.]+ °F at site #1 \(3,543 ft\); /);
    expect(row.detail).toMatch(
      /in of snow a year, \d+ frost-free days \(\w{3} \d+ to \w{3} \d+\) at .+ mi away\)$/,
    );
    expect(row.short).toMatch(/^Jan [\d.]+°, Jul [\d.]+°F$/);
  });

  it("a person's limits: real winter welcome passes any January", () => {
    const r = withSites(5, 80);
    const loose = setBandEdge(defaultRubric(), "janLowF", -25);
    const graded = (rubric: Rubric) =>
      reportCard(r, {
        id: "x",
        name: "x",
        rubric: {
          ...rubric,
          weights: { mode: "rankSum" },
          ranked: [{ factor: "climate", tier: "should" }],
          wonts: [],
        },
      }).rows.find((x) => x.key === "climate")!.grade;
    expect(graded(defaultRubric())).toBe("F");
    expect(graded(loose)).toBe("A");
  });

  it("a screen made before it: not measured, unknown, never incomplete; off the data's area says so", () => {
    const old = structuredClone(MUD);
    delete old.climate;
    for (const s of old.sites!) delete s.climate;
    const row = cardFacts(old).rows.find((x) => x.key === "climate")!;
    expect(row).toMatchObject({ grade: null, detail: NOT_MEASURED });
    expect(row.missing).toBeUndefined();
    const ranked = {
      ...ZACH,
      rubric: {
        ...ZACH.rubric,
        weights: { mode: "rankSum" as const },
        ranked: [...ZACH.rubric.ranked, { factor: "climate" as const, tier: "should" as const }],
      },
    };
    const card = reportCard(old, ranked);
    expect(card.incomplete).toEqual([]);
    expect(card.verdict).toBe(reportCard(MUD, ZACH).verdict);
    const away = structuredClone(old);
    away.climate = { outside: true, stations: [] };
    expect(cardFacts(away).rows.find((x) => x.key === "climate")!.detail).toBe(OUTSIDE_AREA);
  });
});

describe("Climate in saved priorities (plan §5)", () => {
  const SAVED: Rubric = {
    ...defaultRubric(),
    weights: { mode: "rankSum" },
    ranked: [
      { factor: "elevation", tier: "should" },
      { factor: "trails", tier: "should" },
      { factor: "garden", tier: "could" },
    ],
    wonts: ["room"],
  };
  const order = (r: Rubric) => r.ranked.map((c) => `${c.factor}:${c.tier}`);

  it("question 1 with a year: the bottom of Really want, at its preset or its follow-ups", () => {
    const cool = withFactor(SAVED, "climate", { climate: "cool" })!;
    expect(order(cool)).toEqual(["elevation:should", "trails:should", "climate:should", "garden:could"]);
    expect([cool.bands.janLowF[1], cool.bands.julHighF[1]]).toEqual([-25, 80]);
    const mild = withFactor(SAVED, "climate", { climate: "cool", winter: "mild" })!;
    expect(mild.bands.janLowF[1]).toBe(24);
  });

  it("'Either', no answer, or the starting list's explicit weights: Don't care", () => {
    expect(withFactor(SAVED, "climate", { climate: "either" })!.wonts).toEqual(["room", "climate"]);
    expect(withFactor(SAVED, "climate", {})!.wonts).toEqual(["room", "climate"]);
    const start = { ...defaultRubric(), wonts: defaultRubric().wonts.filter((k) => k !== "climate") };
    expect(withFactor(start, "climate", { climate: "cool" })!.wonts.at(-1)).toBe("climate");
  });

  it("placed again from new answers; the interview's own list agrees", () => {
    const placed = withFactor(SAVED, "climate", { climate: "cool" })!;
    expect(order(placedAgain(placed, "climate", { climate: "either" }))).toEqual(order(SAVED));
    const made = rubricFromAnswers({ climate: "warm" }).rubric;
    expect(made.ranked.some((c) => c.factor === "climate")).toBe(true);
    expect([made.bands.janLowF[1], made.bands.julHighF[1]]).toEqual([24, 115]);
  });
});
