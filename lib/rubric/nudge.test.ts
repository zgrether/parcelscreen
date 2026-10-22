/**
 * The learning nudge (step 12, plan §3): the count per person and factor over the parcels still kept, offered at 3 and
 * never twice; Move it down a tier from each tier.
 */
import { describe, expect, it } from "vitest";
import { adjustKey, type Adjustment } from "../report/adjust";
import { defaultRubric } from "./default";
import { moveDown, movedWords, nudgeFor, nudgeWords } from "./nudge";
import type { Factor, Rubric } from "./types";
import { tierOf } from "./words";

const aside = (parcel: string, factor: Factor, by = "zach"): Adjustment => ({
  key: adjustKey(parcel, by, factor),
  parcel,
  by,
  factor,
  kind: "setAside",
  reason: "fine here",
  was: "C",
  at: "2026-10-22T12:00:00Z",
});
const KEPT = new Set(["p1", "p2", "p3", "p4"]);
const R: Rubric = {
  ...defaultRubric(),
  weights: { mode: "rankSum" },
  ranked: [
    { factor: "elevation", tier: "should" },
    { factor: "sky", tier: "should" },
    { factor: "garden", tier: "could" },
  ],
};

describe("when it's offered", () => {
  it("at 3 parcels, not 2; mine only; parcels still kept only", () => {
    const two = [aside("p1", "sky"), aside("p2", "sky")];
    expect(nudgeFor(two, "zach", KEPT, {}, R)).toBeNull();
    expect(nudgeFor([...two, aside("p3", "sky", "julie")], "zach", KEPT, {}, R)).toBeNull();
    expect(nudgeFor([...two, aside("gone", "sky")], "zach", KEPT, {}, R)).toBeNull();
    expect(nudgeFor([...two, aside("p3", "sky")], "zach", KEPT, {}, R)).toEqual({ factor: "sky", count: 3 });
  });

  it("an override doesn't count; the most-set-aside factor first", () => {
    const xs = [
      ...["p1", "p2", "p3"].map((p) => aside(p, "garden")),
      ...["p1", "p2", "p3", "p4"].map((p) => aside(p, "sky")),
      { ...aside("p4", "garden"), kind: "override" as const, grade: "A" as const },
    ];
    expect(nudgeFor(xs, "zach", KEPT, {}, R)).toEqual({ factor: "sky", count: 4 });
  });

  it("never twice, and not for a factor already in Don't care", () => {
    const xs = ["p1", "p2", "p3"].map((p) => aside(p, "sky"));
    for (const mark of ["offered", "moved", "declined", "undone"] as const)
      expect(nudgeFor(xs, "zach", KEPT, { sky: mark }, R)).toBeNull();
    const room = ["p1", "p2", "p3"].map((p) => aside(p, "room"));
    expect(tierOf(R, "room")).toBe("wont");
    expect(nudgeFor(room, "zach", KEPT, {}, R)).toBeNull();
  });

  it("says so in words", () => {
    expect(nudgeWords({ factor: "sky", count: 3 })).toBe(
      "You've set aside Night sky on 3 parcels. Move it down a tier?",
    );
    expect(movedWords("sky", "could")).toBe("Moved Night sky to Nice to have.");
  });
});

describe("moving down a tier", () => {
  it("Really want to the top of Nice to have; Nice to have to Don't care", () => {
    const sky = moveDown(R, "sky");
    expect(sky.to).toBe("could");
    expect(sky.rubric.ranked.filter((c) => c.tier === "could").map((c) => c.factor)).toEqual([
      "sky",
      "garden",
    ]);
    const garden = moveDown(R, "garden");
    expect(garden.to).toBe("wont");
    expect(garden.rubric.wonts).toContain("garden");
  });

  it("a Must gate to Don't care; a limit dropped, the row keeping its rank", () => {
    const flood = moveDown(R, "floodplain");
    expect(flood.to).toBe("wont");
    expect(flood.rubric.musts.some((m) => m.factor === "floodplain")).toBe(false);
    const limited: Rubric = { ...R, musts: [...R.musts, { factor: "elevation", threshold: 2000 }] };
    const elev = moveDown(limited, "elevation");
    expect(elev.rubric.musts.some((m) => m.factor === "elevation")).toBe(false);
    expect(elev.to).toBe("should");
    expect(tierOf(elev.rubric, "elevation")).toBe("should");
  });
});
