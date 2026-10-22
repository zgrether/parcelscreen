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

describe("your line as access (plan §2.2)", () => {
  /**
   * Roan with a drawn easement, "Old road", recorded, whose route reaches the site without crossing neighbouring land:
   * a copy of the app's pick from its own drawn entrance, the easement need gone. Constructed: on the fixtures the app's
   * own pick takes such a line at the next grade (the owner's #281 answer: test with a line that raises a grade).
   */
  function roanWithOldRoad() {
    const r = structuredClone(ROAN);
    const d = r.driveway!;
    const pick = d.routes[0]!;
    r.lines = [
      {
        id: "old-road",
        kind: "easement",
        lengthFt: 1100,
        widthFt: 30,
        outsideFt: 400,
        gradedFt: 1100,
        avgGradePct: 9,
        maxGradePct: 14,
      },
    ];
    d.entrances.push({ ...d.entrances[pick.entranceIndex]!, source: "drawn", line: 0 });
    d.routes.push({ ...pick, entranceIndex: d.entrances.length - 1, needsEasement: false });
    const named = drawnOf([], null, { askingPrice: null, rates: DEFAULT_RATES });
    return {
      r,
      drawn: {
        ...named,
        names: new Map([["old-road", "Old road"]]),
        records: new Map([["old-road", "Carter Co. Deed Bk 412 Pg 88"]]),
      },
    };
  }

  it("a recorded easement that avoids the neighbour's land: Driveway on your land ! → ✓, Maybe → Contender; Try it", () => {
    const { r, drawn } = roanWithOldRoad();
    const base = reportCard(r, nr, drawn);
    expect(base.verdict).toBe("Maybe");
    const { suggestions } = raiseSuggestions(r, base, drawn);
    const access = suggestions.find((s) => s.kind === "access")!;
    expect(access.text).toBe("Use Old road for access: Driveway on your land ! → ✓, Maybe → Contender");
    expect(access.action).toEqual({ kind: "tryLine", line: "old-road" });
    // In order: after the homesite (none here), before the septic system.
    expect(suggestions.map((s) => s.kind)).toEqual(["access", "septic"]);
  });

  it("a line that lowers the grade isn't suggested: the chosen route is scored, the pick holds", () => {
    const { r, drawn } = roanWithOldRoad();
    r.driveway!.routes.at(-1)!.needsEasement = true;
    const base = reportCard(r, nr, drawn);
    expect(raiseSuggestions(r, base, drawn).suggestions.some((s) => s.kind === "access")).toBe(false);
  });

  it("the tried words: what moved, the drives re-timed, and why when a Must got worse", async () => {
    const { triedWords } = await import("./raise");
    const { r, drawn } = roanWithOldRoad();
    const base = reportCard(r, nr, drawn);
    const tried = structuredClone(r);
    for (const d of tried.drives ?? []) d.min += 4;
    const yours = reportCard(tried, nr, { ...drawn, driveway: "old-road" });
    expect(triedWords(base, yours)).toMatch(
      /^Driveway on your land ! → ✓, Maybe → Contender, .* \d+ → \d+ min/,
    );
    // Back the other way: worse, and the Must's own words say why.
    expect(triedWords(yours, base)).toMatch(
      /Contender → Maybe.*\. Why: The driveway needs an easement across neighbouring land$/,
    );
  });
});

describe("the drives note with your route chosen (plan §2.2)", () => {
  it("'Drive times start where the app's pick meets the road' only while they do", async () => {
    const { DRIVES_FROM_PICK } = await import("./lines");
    const r = structuredClone(ROAN);
    const d = r.driveway!;
    r.lines = [
      {
        id: "L",
        kind: "track",
        lengthFt: 500,
        widthFt: null,
        outsideFt: 0,
        gradedFt: 500,
        avgGradePct: 8,
        maxGradePct: 12,
      },
    ];
    // Your route from another point on the road: its entrance is elsewhere.
    d.entrances.push({ ...d.entrances[0]!, ll: [36.1871, -82.0761], source: "drawn", line: 0 });
    d.routes.push({ ...d.routes[0]!, entranceIndex: d.entrances.length - 1 });
    const drawn = { ...drawnOf([], null), driveway: "L" };
    const note = (x: typeof r) =>
      reportCard(x, nr, drawn).rows.find((row) => row.key === "hospital")!.panelNote ?? "";
    expect(note(r)).toContain(DRIVES_FROM_PICK);
    // A screen timed from your route (a run with the choice, or a Try it kept): its drives start at your line.
    const timed = structuredClone(r);
    timed.driveFrom = {
      ...timed.driveFrom!,
      ll: [36.1871, -82.0761],
      kind: "drawn",
      line: "track",
      road: null,
    };
    expect(note(timed)).not.toContain(DRIVES_FROM_PICK);
  });
});
