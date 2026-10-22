/**
 * Ways to raise this grade (step 12, plan §2): only changes that raise the person's letter or verdict and lower neither;
 * at most three, in order; a homesite only for a better letter; the septic system only when the person allows it; one
 * set-aside, never a safety or legal Must.
 */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { DEFAULT_RATES } from "../config/costs";
import { defaultRubric } from "../rubric/default";
import { MINE, type NamedRubric } from "../rubric/types";
import { reportCard, type Card } from "./card";
import { drawnOf } from "./marks";
import { MAX_SUGGESTIONS, NEVER_SET_ASIDE, raises, raiseSuggestions } from "./raise";

const MACKS = expectedOf("macks-mountain-35-3", "run");
const ROAN = expectedOf("roan-hwy-143-099-046-02", "run");
const FERNEY = expectedOf("ferney-creek-52-47A", "run");
const nr: NamedRubric = { id: MINE, name: "Mine", rubric: defaultRubric() };
const drawn = drawnOf([], null, { askingPrice: null, rates: DEFAULT_RATES });
const card = (r: typeof MACKS, at?: number) =>
  reportCard(r, nr, drawn, undefined, at === undefined ? {} : { at });

describe("raises", () => {
  const c = card(FERNEY);
  const as = (grade: Card["grade"], verdict: Card["verdict"], points = c.points): Card => ({
    ...c,
    grade,
    verdict,
    points,
  });
  it("a better letter or verdict, and neither worse", () => {
    expect(raises(as("B", "Maybe"), as("A", "Maybe"))).toBe(true);
    expect(raises(as("B", "Maybe"), as("B", "Contender"))).toBe(true);
    expect(raises(as("B", "Maybe"), as("A", "Pass"))).toBe(false);
    expect(raises(as("B", "Maybe", 3.0), as("B", "Maybe", 3.4))).toBe(false);
  });
});

describe("the suggestions", () => {
  it("Macks: the septic system, then one set-aside, each raising; Trails, not a safety Must", () => {
    const base = card(MACKS);
    const { suggestions, neighbour } = raiseSuggestions(MACKS, base, drawn);
    expect(suggestions.map((s) => s.kind)).toEqual(["septic", "setAside"]);
    expect(suggestions[0]).toMatchObject({
      text: "Plan on an alternative septic system: Septic ! → ✓, Maybe → Contender",
      cost: "septic $15–55k in Ready to build (Alternative)",
      action: { kind: "adjust", factor: "septic", choice: "pass" },
    });
    expect(suggestions[1]).toMatchObject({
      text: "Set aside Trails and public land for this parcel: parcel B → A",
      action: { kind: "adjust", factor: "trails", choice: "setAside" },
    });
    for (const s of suggestions) expect(raises(base, s.card)).toBe(true);
    expect(neighbour).toBe(true);
  });

  it("not the septic system for someone who'd walk away from one", () => {
    const { suggestions } = raiseSuggestions(ROAN, card(ROAN), drawn, { refusesAltSeptic: true });
    expect(suggestions.some((s) => s.kind === "septic")).toBe(false);
    expect(raiseSuggestions(ROAN, card(ROAN), drawn).suggestions[0]!.kind).toBe("septic");
  });

  it("a homesite only when it raises the letter: from Macks' site #2 (a C), the best site's B", () => {
    const worse = card(MACKS, 1);
    expect(worse.grade).toBe("C");
    const home = raiseSuggestions(MACKS, worse, drawn).suggestions[0]!;
    expect(home.kind).toBe("homesite");
    expect(home.text).toMatch(/^Build at site #3: .*parcel C → B/);
    expect(home.action).toMatchObject({ kind: "house", site: 2 });
    // At the best site already: none.
    expect(raiseSuggestions(MACKS, card(MACKS), drawn).suggestions.some((s) => s.kind === "homesite")).toBe(
      false,
    );
  });

  it("at most three; nothing for an A Contender; never a safety or legal Must set aside", () => {
    for (const r of [MACKS, ROAN, FERNEY]) {
      const { suggestions } = raiseSuggestions(r, card(r, 1), drawn);
      expect(suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
      for (const s of suggestions)
        if (s.action.kind === "adjust" && s.action.choice === "setAside")
          expect(NEVER_SET_ASIDE.has(s.action.factor)).toBe(false);
    }
    const top = { ...card(FERNEY), grade: "A" as const, verdict: "Contender" as const };
    expect(raiseSuggestions(FERNEY, top, drawn)).toEqual({ suggestions: [], neighbour: false });
  });
});
