import { describe, expect, it } from "vitest";
import { mergeHeld, mergeMarks, mergeNotes, onlyNotesAndLines, onlyRecent } from "./held";
import { canonical } from "./records";

const parcel = (over: Record<string, unknown> = {}) => ({
  key: "k1",
  name: "Mud Creek",
  status: "saved",
  notes: "",
  notesAt: null,
  markup: [] as { id: string; label?: string }[],
  updatedAt: "2026-10-26T10:00:00Z",
  ...over,
});

describe("changes held while offline", () => {
  it("holds a change to the notes or the lines and marks only", () => {
    const base = canonical(parcel());
    expect(onlyNotesAndLines(base, parcel({ notes: "gate is locked", updatedAt: "x" }))).toBe(true);
    expect(onlyNotesAndLines(base, parcel({ markup: [{ id: "a" }] }))).toBe(true);
    // Anything else, or nothing but the date: step 5's Not saved.
    expect(onlyNotesAndLines(base, parcel({ notes: "x", status: "archived" }))).toBe(false);
    expect(onlyNotesAndLines(base, parcel({ updatedAt: "x" }))).toBe(false);
    // A parcel new here, or removed here, isn't held.
    expect(onlyNotesAndLines(undefined, parcel({ notes: "x" }))).toBe(false);
    expect(onlyNotesAndLines(base, null)).toBe(false);
  });

  it("merges the lines and marks by id", () => {
    const base = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const mine = [{ id: "a", label: "ours" }, { id: "c" }, { id: "new-here" }];
    const theirs = [{ id: "a" }, { id: "b", label: "theirs" }, { id: "new-there" }];
    // a: changed here → ours. b: deleted here but changed there → theirs kept. c: deleted there, unchanged here → gone.
    expect(mergeMarks(base, mine, theirs)).toEqual([
      { id: "a", label: "ours" },
      { id: "b", label: "theirs" },
      { id: "new-there" },
      { id: "new-here" },
    ]);
    // Deleted there and changed here: ours stays.
    expect(mergeMarks([{ id: "a" }], [{ id: "a", label: "ours" }], [])).toEqual([{ id: "a", label: "ours" }]);
    // Deleted here, unchanged there: gone.
    expect(mergeMarks([{ id: "a" }], [], [{ id: "a" }])).toEqual([]);
  });

  it("keeps both notes when both changed", () => {
    expect(mergeNotes("old", "mine", "old")).toBe("mine");
    expect(mergeNotes("old", "old", "theirs")).toBe("theirs");
    expect(mergeNotes("old", "mine", "theirs")).toBe("theirs\n\nmine");
  });

  it("lays the held notes and lines over the space's newer record", () => {
    const base = parcel({ notes: "", markup: [{ id: "a" }] });
    const mine = parcel({
      notes: "creek crossing washed out",
      notesAt: "2026-10-26",
      markup: [{ id: "a" }, { id: "b" }],
    });
    const theirs = parcel({ status: "archived", markup: [{ id: "a" }], updatedAt: "2026-10-26T11:00:00Z" });
    const merged = mergeHeld(base, mine, theirs);
    expect(merged.status).toBe("archived");
    expect(merged.notes).toBe("creek crossing washed out");
    expect(merged.notesAt).toBe("2026-10-26");
    expect(merged.markup).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("holds a profile's change to its Recent only", () => {
    const profile = (docs: Record<string, string>, name = "Zach") =>
      canonical({ name, createdAt: "2026-10-01", docs });
    const base = profile({ "ps.history": "[]", "ps.cfg": "{}" });
    expect(onlyRecent(base, profile({ "ps.history": '["k1"]', "ps.cfg": "{}" }))).toBe(true);
    expect(onlyRecent(base, profile({ "ps.history": '["k1"]', "ps.cfg": '{"x":1}' }))).toBe(false);
    expect(onlyRecent(base, profile({ "ps.history": "[]", "ps.cfg": "{}" }, "Julie"))).toBe(false);
    expect(onlyRecent(base, base)).toBe(false);
    expect(onlyRecent(undefined, base)).toBe(false);
  });
});
