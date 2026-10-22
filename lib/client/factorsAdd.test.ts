/**
 * Step 11's new factors added once at boot (plan §1): to the current profile's saved priorities and its interview's
 * list, with one notice and its Undo; another member's in memory.
 */
import { afterEach, describe, expect, it } from "vitest";
import { defaultRubric } from "../rubric/default";
import type { InterviewDoc } from "../rubric/interview/doc";
import type { Rubric } from "../rubric/types";
import { addFactorsOnce, factorsNote, markFactorsSeen, pendingFactors, undoFactorsAdd } from "./factorsAdd";
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

/** Priorities saved before step 11: Town ranked (it graded the ER then), no Hospital. */
const SAVED: Rubric = {
  ...defaultRubric(),
  weights: { mode: "rankSum" },
  ranked: [
    { factor: "trails", tier: "should" },
    { factor: "town", tier: "should" },
    { factor: "garden", tier: "could" },
  ],
  wonts: [],
};
const interview: InterviewDoc = { v: 2, state: "done", at: 15, answers: { er: "30" }, base: SAVED };

/** Zach (current) and Julie, each with priorities saved before step 11. */
async function boot() {
  const storage = memoryProfileStorage();
  const z = newProfile("Zach", "2026-10-01T00:00:00.000Z");
  const j = newProfile("Julie", "2026-10-02T00:00:00.000Z");
  for (const p of [z, j]) {
    await storage.putProfile(p);
    await storage.putDoc({
      profile: p.id,
      key: "ps.rubrics",
      value: JSON.stringify({ mine: SAVED, others: [], drivewayAdded: "seen" }),
    });
    await storage.putDoc({ profile: p.id, key: "ps.interview", value: JSON.stringify(interview) });
  }
  await bootProfiles({ storage, ls: ls(z.id) });
}

afterEach(() => resetProfilesForTests());

describe("adding the new factors once, at boot", () => {
  it("to the current profile's priorities and its interview's list, with the notice pending", async () => {
    await boot();
    addFactorsOnce();
    const r = getPref("ps.rubrics")!;
    expect(r.mine.ranked.map((c) => c.factor)).toEqual(["trails", "town", "hospital", "garden"]);
    expect(r.factorsAdded).toEqual({ hospital: "new" });
    expect(getPref("ps.interview")!.base!.ranked.map((c) => c.factor)).toContain("hospital");
    expect(pendingFactors()).toEqual(["hospital"]);
    expect(factorsNote(pendingFactors())).toBe("New factors to place: Hospital");
  });

  it("once: the notice shows once, and after Undo nothing is added again", async () => {
    await boot();
    addFactorsOnce();
    markFactorsSeen();
    expect(pendingFactors()).toEqual([]);
    expect(getPref("ps.rubrics")!.factorsAdded).toEqual({ hospital: "seen" });
    const without = undoFactorsAdd(["hospital"])!;
    expect(without.ranked.map((c) => c.factor)).toEqual(["trails", "town", "garden"]);
    expect(without.wonts).toContain("hospital");
    expect(getPref("ps.rubrics")!.factorsAdded).toEqual({ hospital: "undone" });
    setProfileRubrics({ ...getPref("ps.rubrics")!, mine: without });
    addFactorsOnce();
    expect(getPref("ps.rubrics")!.mine.ranked.some((c) => c.factor === "hospital")).toBe(false);
  });

  it("another member gets them in memory", async () => {
    await boot();
    await loadHousehold();
    expect(otherMembers()[0]!.rubric!.ranked.map((c) => c.factor)).toEqual([
      "trails",
      "town",
      "hospital",
      "garden",
    ]);
  });
});
