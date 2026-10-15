import { describe, expect, it } from "vitest";
import { CHOICE_GROUPS, CHOICE_LABEL, readRecent, RECENT_MAX, TOOL, withRecent } from "./markChoices";

describe("the Mark picker's choices (owner, after #136)", () => {
  it("four groups, in the owner's order, each choice once", () => {
    expect(CHOICE_GROUPS.map((g) => [g.title, g.choices.map((c) => CHOICE_LABEL[c])])).toEqual([
      ["Build", ["House site"]],
      ["Ways in", ["Track", "Existing drive", "Easement"]],
      ["Water & utilities", ["Spring", "Well", "Septic permit", "Power"]],
      ["On the land", ["Building", "Campsite", "Clearing", "Gate", "Note"]],
    ]);
    const all = CHOICE_GROUPS.flatMap((g) => g.choices);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(Object.keys(TOOL).sort());
    // No "Septic field": a septic permit is a point or its field, by the taps.
    expect(Object.values(CHOICE_LABEL)).not.toContain("Septic field");
  });

  it("the kind sets the shape", () => {
    const by = (tool: string) =>
      Object.keys(TOOL)
        .filter((c) => TOOL[c as keyof typeof TOOL] === tool)
        .sort();
    expect(by("point")).toEqual(["building", "campsite", "gate", "note", "power", "spring", "well"]);
    expect(by("house")).toEqual(["house"]);
    expect(by("line")).toEqual(["drive", "easement", "track"]);
    expect(by("area")).toEqual(["clearing"]);
    expect(by("septic")).toEqual(["septic"]);
  });

  it("Recent: the last three, newest first, each once", () => {
    let r = withRecent([], "spring");
    r = withRecent(r, "track");
    r = withRecent(r, "septic");
    expect(r).toEqual(["septic", "track", "spring"]);
    expect(withRecent(r, "gate")).toEqual(["gate", "septic", "track"]);
    expect(withRecent(r, "spring")).toEqual(["spring", "septic", "track"]);
    expect(RECENT_MAX).toBe(3);
    // Stored: unknown kinds and repeats dropped; anything else reads as none.
    expect(readRecent(JSON.stringify(["well", "pond", "well", "gate", "note", "house"]))).toEqual([
      "well",
      "gate",
      "note",
    ]);
    expect(readRecent(JSON.stringify({ a: 1 }))).toEqual([]);
  });
});
