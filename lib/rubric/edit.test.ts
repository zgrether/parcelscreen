/**
 * The rubric editor's operations (step 3, docs/plans/step-3-rubric-editor.md §1–§3; owner's answers 10/17): the
 * columns' rules, minimums, the first reorder's switch to rank-sum, the band sliders, and Reset.
 */
import { describe, expect, it } from "vitest";
import { reportCard } from "../report/card";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "./default";
import {
  columnsOf,
  DEALBREAKER_ONLY,
  hasMinimum,
  MINIMUM_STAYS,
  moveCard,
  removeMinimum,
  resetToDefault,
  setBandEdge,
  setMinimum,
  weightsTable,
  type EditResult,
} from "./edit";
import type { Rubric } from "./types";
import { weightsOf } from "./weights";

const D = defaultRubric();
const ok = (r: EditResult): Extract<EditResult, { ok: true }> => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};
const names = (r: Rubric) => {
  const c = columnsOf(r);
  return Object.fromEntries(
    Object.entries(c).map(([k, v]) => [
      k,
      v.map((x) => (x.kind === "minimum" ? `min:${x.factor}` : x.factor)),
    ]),
  );
};

describe("the columns", () => {
  it("the default: the four dealbreakers in Must, the seven weighted rows in Should by weight, the Driveway row (weight 0) in Won't (step 7), and Town (the groceries, weight 0; step 11)", () => {
    expect(names(D)).toEqual({
      must: ["floodplain", "access", "easement", "septic"],
      should: ["elevation", "homesite", "room", "sky", "trails", "garden", "hospital"],
      could: [],
      wont: ["driveway", "town"],
    });
  });

  it("a dealbreaker is a Must or a Won't, and goes back to Must in the card's order", () => {
    expect(moveCard(D, { kind: "factor", factor: "septic" }, "should")).toEqual({
      ok: false,
      reason: DEALBREAKER_ONLY,
    });
    const out = ok(moveCard(D, { kind: "factor", factor: "access" }, "wont"));
    expect(names(out.rubric).must).toEqual(["floodplain", "easement", "septic"]);
    expect(names(out.rubric).wont).toEqual(["access", "driveway", "town"]);
    expect(out.rubric.weights).toEqual(D.weights); // not a reorder
    const back = ok(moveCard(out.rubric, { kind: "factor", factor: "access" }, "must"));
    expect(names(back.rubric).must).toEqual(["floodplain", "access", "easement", "septic"]);
  });

  it("a row dropped on Must becomes a minimum at its B/C edge and keeps its ranked card, marked min (owner Q2)", () => {
    const out = ok(moveCard(D, { kind: "factor", factor: "hospital" }, "must"));
    expect(names(out.rubric).must).toEqual(["floodplain", "access", "easement", "septic", "min:hospital"]);
    expect(names(out.rubric).should).toEqual(names(D).should);
    expect(hasMinimum(out.rubric, "hospital")).toBe(true);
    expect(out.rubric.musts.at(-1)).toEqual({ factor: "hospital", threshold: 30 });
    expect(out.message).toBe(
      "Hospital is now a must have too (ER within 30 min): it also stays at #7 in Really want.",
    );
    expect(out.rubric.weights).toEqual(D.weights);
    const elevation = ok(moveCard(D, { kind: "factor", factor: "elevation" }, "must"));
    expect(elevation.message).toBe(
      "Elevation at the build site is now a must have too (at least 2,500 ft): it also stays at #1 in Really want.",
    );
  });

  it("Best homesite's limit is hours of December sun (§9.50 amended); a limit stays in Must, and Won't removes it", () => {
    const sun = ok(moveCard(D, { kind: "factor", factor: "homesite" }, "must"));
    expect(sun.rubric.musts.at(-1)).toEqual({ factor: "homesite", threshold: 3 });
    expect(sun.message).toBe(
      "Best homesite is now a must have too (at least 3 h of December sun): it also stays at #2 in Really want.",
    );
    const withMin = ok(moveCard(D, { kind: "factor", factor: "sky" }, "must")).rubric;
    expect(moveCard(withMin, { kind: "minimum", factor: "sky" }, "could")).toEqual({
      ok: false,
      reason: MINIMUM_STAYS,
    });
    const removed = ok(moveCard(withMin, { kind: "minimum", factor: "sky" }, "wont")).rubric;
    expect(hasMinimum(removed, "sky")).toBe(false);
    expect(names(removed).should).toContain("sky"); // the row itself stays ranked
    expect(removeMinimum(withMin, "sky")).toEqual(removed);
  });

  it("a row moved to Won't leaves the grade and takes its minimum with it; explicit weights stay", () => {
    const withMin = ok(moveCard(D, { kind: "factor", factor: "garden" }, "must")).rubric;
    const out = ok(moveCard(withMin, { kind: "factor", factor: "garden" }, "wont"));
    expect(names(out.rubric).wont).toEqual(["driveway", "town", "garden"]);
    expect(names(out.rubric).should).not.toContain("garden");
    expect(hasMinimum(out.rubric, "garden")).toBe(false);
    expect(out.rubric.weights.mode).toBe("explicit");
    expect(out.switched).toBeUndefined();
  });
});

describe("the weights: explicit until the first reorder, then rank-sum at once (owner, 10/17)", () => {
  it("the first reorder switches and reports the weights before and after; the next one doesn't", () => {
    const first = ok(moveCard(D, { kind: "factor", factor: "sky" }, "should", 1));
    expect(names(first.rubric).should).toEqual([
      "elevation",
      "sky",
      "homesite",
      "room",
      "trails",
      "garden",
      "hospital",
    ]);
    expect(first.rubric.weights).toEqual({ mode: "rankSum" });
    expect(first.switched!.before).toEqual(D.weights.mode === "explicit" ? D.weights.of : null);
    expect(first.switched!.after).toEqual(weightsOf(first.rubric));
    const table = weightsTable(first.switched!);
    expect(table.map((x) => [x.key, x.before, Number(x.after.toFixed(1))])).toEqual([
      ["elevation", 25, 25],
      ["homesite", 25, 17.9],
      ["sky", 10, 21.4],
      ["room", 15, 14.3],
      ["driveway", 0, 0],
      ["trails", 10, 10.7],
      ["town", 0, 0],
      ["hospital", 5, 3.6],
      ["garden", 10, 7.1],
    ]);
    const second = ok(moveCard(first.rubric, { kind: "factor", factor: "hospital" }, "could"));
    expect(second.switched).toBeUndefined();
    expect(names(second.rubric).could).toEqual(["hospital"]);
  });

  it("a drop where the card already is changes nothing", () => {
    const same = ok(moveCard(D, { kind: "factor", factor: "elevation" }, "should", 0));
    expect(same.rubric).toBe(D);
    expect(same.switched).toBeUndefined();
  });

  it("the default order on rank-sum: the plan's §3 table, and the fixtures' points before and after", () => {
    const rs: Rubric = { ...D, weights: { mode: "rankSum" } };
    const w = weightsOf(rs);
    expect(Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v.toFixed(1))]))).toEqual({
      elevation: 25,
      homesite: 21.4,
      sky: 14.3,
      room: 17.9,
      driveway: 0,
      trails: 10.7,
      town: 0,
      hospital: 3.6,
      garden: 7.1,
      budget: 0,
    });
    const pts = (slug: Parameters<typeof expectedOf>[0], r: Rubric) => {
      const c = reportCard(expectedOf(slug, "run"), { id: "x", name: "x", rubric: r });
      return [Number(c.points!.toFixed(3)), c.grade, c.verdict];
    };
    expect(pts("ferney-creek-52-47A", D)).toEqual([3.2, "B", "Contender"]);
    expect(pts("ferney-creek-52-47A", rs)).toEqual([3.179, "B", "Contender"]);
    // Step 7: Macks is graded at its best site under this order, #3 (3.036 at site #1).
    expect(pts("macks-mountain-35-3", rs)).toEqual([3.214, "B", "Maybe"]);
    expect(pts("grayson-mud-creek-6273", D)).toEqual([3.45, "B", "Contender"]);
    expect(pts("grayson-mud-creek-6273", rs)).toEqual([3.5, "A", "Contender"]);
    expect(pts("roan-hwy-143-099-046-02", rs)).toEqual([2.786, "B", "Maybe"]);
  });
});

describe("the sliders", () => {
  it("a band's B/C edge moves and the band shifts with it, snapped to its step and kept in its range", () => {
    expect(setBandEdge(D, "elevationFt", 3000).bands.elevationFt).toEqual([3500, 3000, 2500, 2000]);
    expect(setBandEdge(D, "elevationFt", 3049).bands.elevationFt).toEqual([3500, 3000, 2500, 2000]);
    expect(setBandEdge(D, "erMin", 20).bands.erMin).toEqual([10, 20, 35, 50]);
    expect(setBandEdge(D, "erMin", 999).bands.erMin[1]).toBe(90);
    // An edge that would cross zero stops there (the garden's D edge is 0 already).
    expect(setBandEdge(D, "gardenAc", 0.1).bands.gardenAc).toEqual([0.35, 0.1, 0, 0]);
    expect(setBandEdge(D, "elevationFt", 3000).bands.skyMag).toEqual(D.bands.skyMag); // one band only
  });

  it("a minimum is set within its slider's range", () => {
    const withMin = ok(moveCard(D, { kind: "factor", factor: "hospital" }, "must")).rubric;
    expect(setMinimum(withMin, "hospital", 22).musts.at(-1)).toEqual({ factor: "hospital", threshold: 20 });
    expect(setMinimum(withMin, "hospital", 2).musts.at(-1)).toEqual({ factor: "hospital", threshold: 10 });
    const sun = ok(moveCard(D, { kind: "factor", factor: "homesite" }, "must")).rubric;
    expect(setMinimum(sun, "homesite", 9).musts.at(-1)).toEqual({ factor: "homesite", threshold: 8 });
    expect(setMinimum(sun, "homesite", 4.3).musts.at(-1)).toEqual({ factor: "homesite", threshold: 4.5 });
  });

  it("Reset puts today's card back", () => {
    expect(resetToDefault()).toEqual(D);
  });
});
