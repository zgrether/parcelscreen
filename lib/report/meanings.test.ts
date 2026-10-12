/** "What it means for you" (value-ranking.md §6.2 (c); VR5 part 3): one set of sentences per band of every scale. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { reportCard } from "./card";
import { MEANINGS, meaningsFor } from "./meanings";
import { scalesFor, SCALE_IDS } from "./scales";

/** The panels that carry a scale. */
const PANEL_KEYS_WITH_SCALES = [
  "homesite",
  "easement",
  "elevation",
  "sky",
  "room",
  "trails",
  "town",
  "garden",
] as const;

describe("What it means for you", () => {
  it("every band of every scale has its sentences", () => {
    const seen = new Map<string, number>();
    for (const slug of ["ferney-creek-52-47A", "grayson-mud-creek-6273"] as const) {
      const r = expectedOf(slug, "run");
      const card = reportCard(r, "zach");
      for (const p of PANEL_KEYS_WITH_SCALES)
        for (const sc of scalesFor(p, r, card)) seen.set(sc.id, sc.bands.length);
    }
    expect([...seen.keys()].sort()).toEqual(Object.values(SCALE_IDS).sort());
    for (const [id, bands] of seen) {
      const sets = MEANINGS[id as keyof typeof MEANINGS];
      expect(sets, id).toHaveLength(bands);
      for (const set of sets) expect(set.length, id).toBeGreaterThan(0);
    }
  });

  it("each is a plain sentence: a capital, a full stop, single spaces", () => {
    for (const sets of Object.values(MEANINGS))
      for (const set of sets)
        for (const { text } of set) {
          expect(text, text).toMatch(/^[A-Z].*\.$/);
          expect(text, text).not.toMatch(/ {2}/);
        }
  });

  it("the owner's tone example is the north-facing driveway's", () => {
    expect(meaningsFor("facing", 3)).toContainEqual({
      for: "Driveway",
      text: "North-facing slopes keep ice on the driveway for days, which matters for whoever is home alone.",
    });
  });

  it("Grayson 6273's homesite reads its own bands", () => {
    const r = expectedOf("grayson-mud-creek-6273", "run");
    const lines = scalesFor("homesite", r, reportCard(r, "zach")).flatMap((sc) => meaningsFor(sc.id, sc.at));
    expect(lines[0]).toEqual({
      for: "Solar",
      text: "As good as it gets in these mountains; a modest array covers most of the year.",
    });
    expect(lines.filter((l) => l.for === "Driveway").map((l) => l.text)).toEqual([
      "Shady stretches hold ice after a storm; keep gravel and a spreader on hand.",
    ]);
  });
});
