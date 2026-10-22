/**
 * The Driveway row added once at boot (owner, #216): to the current profile's saved priorities and its interview's list,
 * with the one-time note and its Undo; another member's in memory.
 */
import { afterEach, describe, expect, it } from "vitest";
import { defaultRubric } from "../rubric/default";
import type { InterviewDoc } from "../rubric/interview/doc";
import type { Rubric } from "../rubric/types";
import {
  addDrivewayOnce,
  drivewayNote,
  markDrivewayNoteSeen,
  pendingDrivewayNote,
  undoDrivewayAdd,
} from "./drivewayAdd";
import { loadHousehold, otherMembers } from "./household";
import { getPref } from "./prefs";
import { setProfileRubrics } from "./rubrics";
import { memoryProfileStorage } from "./profileStore";
import { bootProfiles, CURRENT_PROFILE_KEY, newProfile, resetProfilesForTests } from "./profiles";

const ls = (current: string) => {
  const data = new Map([[CURRENT_PROFILE_KEY, current]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
};

const SAVED: Rubric = {
  ...defaultRubric(),
  weights: { mode: "rankSum" },
  ranked: [
    { factor: "trails", tier: "should" },
    { factor: "elevation", tier: "should" },
    { factor: "garden", tier: "could" },
  ],
  wonts: [],
};
const interview = (driveway?: "steep" | "gentle" | "build"): InterviewDoc => ({
  v: 2,
  state: "done",
  at: 15,
  answers: driveway ? { trails: "door", driveway } : { trails: "door" },
  base: SAVED,
});

/** Zach (current) and Julie, each with priorities saved before step 7 and their answer to question 10. */
async function boot(zach?: "steep" | "gentle" | "build", julie?: "steep" | "gentle" | "build") {
  const storage = memoryProfileStorage();
  const z = newProfile("Zach", "2026-10-01T00:00:00.000Z");
  const j = newProfile("Julie", "2026-10-02T00:00:00.000Z");
  for (const [p, a] of [
    [z, zach],
    [j, julie],
  ] as const) {
    await storage.putProfile(p);
    await storage.putDoc({
      profile: p.id,
      key: "ps.rubrics",
      value: JSON.stringify({ mine: SAVED, others: [] }),
    });
    await storage.putDoc({ profile: p.id, key: "ps.interview", value: JSON.stringify(interview(a)) });
  }
  await bootProfiles({ storage, ls: ls(z.id) });
}

afterEach(() => resetProfilesForTests());

describe("adding the Driveway row once, at boot", () => {
  it("to the current profile's priorities and its interview's list, with the note pending", async () => {
    await boot("gentle");
    addDrivewayOnce();
    const r = getPref("ps.rubrics")!;
    expect(r.mine.ranked.map((c) => c.factor)).toEqual(["trails", "elevation", "driveway", "garden"]);
    expect(r.drivewayAdded).toBe("new");
    expect(getPref("ps.interview")!.base!.ranked.map((c) => c.factor)).toContain("driveway");
    expect(pendingDrivewayNote()).toBe(drivewayNote(true));
    expect(drivewayNote(true)).toBe("New: Driveway, placed from your answer about steep drives.");
  });

  it("once: the note shows once, and after Undo it isn't added again", async () => {
    await boot(undefined);
    addDrivewayOnce();
    expect(pendingDrivewayNote()).toBe(drivewayNote(false));
    markDrivewayNoteSeen();
    expect(pendingDrivewayNote()).toBeNull();
    const without = undoDrivewayAdd()!;
    expect(without.ranked.map((c) => c.factor)).toEqual(["trails", "elevation", "garden"]);
    expect(without.wonts).toContain("driveway");
    expect(getPref("ps.rubrics")!.drivewayAdded).toBe("undone");
    // What matters saves it as any change (useMyRubric: over the stored rubrics, the mark kept); the next boot adds
    // nothing.
    setProfileRubrics({ ...getPref("ps.rubrics")!, mine: without });
    addDrivewayOnce();
    expect(getPref("ps.rubrics")!.mine.ranked.some((c) => c.factor === "driveway")).toBe(false);
    expect(getPref("ps.rubrics")!.drivewayAdded).toBe("undone");
  });

  it("another member gets it in memory, in their own answer's tier", async () => {
    await boot("gentle", "steep");
    await loadHousehold();
    const julie = otherMembers()[0]!;
    // Driveway at the bottom of Nice to have; step 11's Internet comes after it, added once too.
    expect(julie.rubric!.ranked.slice(-2)).toEqual([
      { factor: "driveway", tier: "could" },
      { factor: "internet", tier: "could" },
    ]);
    expect(julie.rubric!.bands.drivewayPct).toEqual([15, 20, 25, 30]);
  });
});
