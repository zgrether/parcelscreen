/**
 * The adjustments in the household's document (step 12, plan §3–§4): one per factor per parcel per person, replaced
 * by a new one; gone with their parcel; by rubric id for the cards; kept by a sync merge until they sync themselves.
 */
import { describe, expect, it } from "vitest";
import { MINE } from "@/lib/rubric/types";
import { mergeHousehold } from "@/lib/sync/records";
import {
  adjustMap,
  EMPTY_HOUSEHOLD,
  readHousehold,
  withAdjust,
  withoutAdjust,
  withoutParcel,
  type Household,
} from "./takes";

const base = {
  parcel: "p1",
  by: "zach",
  factor: "sky" as const,
  kind: "setAside" as const,
  reason: "city glow is fine by us",
  was: "C",
  at: "2026-10-22T12:00:00Z",
};

describe("adjustments in the household document", () => {
  it("one per factor per parcel per person: a new one replaces it", () => {
    let h: Household = withAdjust(EMPTY_HOUSEHOLD, base);
    h = withAdjust(h, { ...base, kind: "override", grade: "B", reason: "darker than mapped" });
    h = withAdjust(h, { ...base, by: "julie" });
    expect(h.adjusts.map((a) => [a.key, a.kind])).toEqual([
      ["p1:zach:sky", "override"],
      ["p1:julie:sky", "setAside"],
    ]);
    expect(withoutAdjust(h, "p1:zach:sky").adjusts.map((a) => a.key)).toEqual(["p1:julie:sky"]);
  });

  it("by rubric id: mine as MINE, a member's by their id; only this parcel's", () => {
    const h = withAdjust(withAdjust(withAdjust(EMPTY_HOUSEHOLD, base), { ...base, by: "julie" }), {
      ...base,
      parcel: "p2",
    });
    const m = adjustMap(h, "p1", "zach");
    expect([...m.keys()]).toEqual([MINE, "julie"]);
    expect(m.get(MINE)!.map((a) => a.parcel)).toEqual(["p1"]);
  });

  it("go with their parcel", () => {
    const h = withAdjust(EMPTY_HOUSEHOLD, base);
    expect(withoutParcel(h, "p1").adjusts).toEqual([]);
  });

  it("a document saved before step 12 reads as none; one that doesn't read is dropped alone", () => {
    expect(readHousehold(JSON.stringify({ v: 1, asks: [], takes: [] }))!.adjusts).toEqual([]);
    const h = withAdjust(EMPTY_HOUSEHOLD, base);
    const bad = readHousehold(JSON.stringify({ ...h, adjusts: [...h.adjusts, { ...base, reason: "" }] }))!;
    expect(bad.adjusts.map((a) => a.key)).toEqual(["p1:zach:sky"]);
  });

  it("a sync merge of asks and takes keeps them", () => {
    const raw = JSON.stringify(withAdjust(EMPTY_HOUSEHOLD, base));
    const merged = readHousehold(mergeHousehold(raw, [], new Set()))!;
    expect(merged.adjusts.map((a) => a.key)).toEqual(["p1:zach:sky"]);
  });
});

describe("adjustments in the sync (step 12, plan §4)", () => {
  it("each is a record of its own; a remote one lands, a deleted one goes, an unsaved one here stays", async () => {
    const { householdSnapshot, householdId } = await import("@/lib/sync/records");
    const raw = JSON.stringify(withAdjust(EMPTY_HOUSEHOLD, base));
    expect([...householdSnapshot(raw).keys()]).toEqual(["adjust:p1:zach:sky"]);
    const julie = { ...base, by: "julie", key: "p1:julie:sky" };
    const merged = readHousehold(
      mergeHousehold(
        raw,
        [
          { key: julie.key, kind: "adjust", record: julie, deleted: false, updatedAt: "t" },
          { key: "p1:zach:sky", kind: "adjust", record: null, deleted: true, updatedAt: "t" },
        ],
        new Set(),
      ),
    )!;
    expect(merged.adjusts.map((a) => a.key)).toEqual(["p1:julie:sky"]);
    const kept = readHousehold(
      mergeHousehold(
        raw,
        [{ key: "p1:zach:sky", kind: "adjust", record: null, deleted: true, updatedAt: "t" }],
        new Set([householdId("adjust", "p1:zach:sky")]),
      ),
    )!;
    expect(kept.adjusts.map((a) => a.key)).toEqual(["p1:zach:sky"]);
  });
});
