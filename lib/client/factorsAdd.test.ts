/**
 * Step 11's new factors added once at boot (plan §1): to the current profile's saved priorities and its interview's
 * list, with one notice and its Undo; another member's in memory.
 */
import { afterEach, describe, expect, it } from "vitest";
import { defaultRubric } from "../rubric/default";
import type { InterviewDoc } from "../rubric/interview/doc";
import type { Rubric } from "../rubric/types";
import {
  addFactorsOnce,
  factorsNote,
  markFactorsSeen,
  newQuestionsHref,
  pendingFactors,
  placeFromAnswers,
  undoFactorsAdd,
} from "./factorsAdd";
import { loadHousehold, otherMembers } from "./household";
import { getPref, setPref } from "./prefs";
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
const interviewWith = (answers: InterviewDoc["answers"]): InterviewDoc => ({
  v: 2,
  state: "done",
  at: 15,
  answers,
  base: SAVED,
});

/** Zach (current) and Julie, each with priorities saved before step 11 and these answers. */
async function boot(answers: InterviewDoc["answers"] = { er: "30" }) {
  const interview = interviewWith(answers);
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
    // Question 1 unanswered: Climate is Don't care.
    expect(r.mine.wonts).toEqual(["climate"]);
    expect(r.factorsAdded).toEqual({ hospital: "new", climate: "new" });
    expect(getPref("ps.interview")!.base!.ranked.map((c) => c.factor)).toContain("hospital");
    expect(pendingFactors()).toEqual(["hospital", "climate"]);
    expect(factorsNote(pendingFactors())).toBe("New factors to place: Hospital, Climate");
    expect(newQuestionsHref(pendingFactors())).toBe("/interview?ask=climate");
    expect(newQuestionsHref(["hospital"])).toBeNull();
  });

  it("Climate from question 1: the bottom of Really want, at the year's limits; answered again, placed again", async () => {
    await boot({ climate: "warm" });
    addFactorsOnce();
    const mine = getPref("ps.rubrics")!.mine;
    expect(mine.ranked.map((c) => `${c.factor}:${c.tier}`)).toEqual([
      "trails:should",
      "town:should",
      "hospital:should",
      "climate:should",
      "garden:could",
    ]);
    // Warm and mild: mild winters (24 °F), hot is fine (no July limit).
    expect([mine.bands.janLowF[1], mine.bands.julHighF[1]]).toEqual([24, 115]);
    // The person answers the new questions (the interview's ask mode saves them), then they're placed again.
    const iv = getPref("ps.interview")!;
    setPref("ps.interview", { ...iv, answers: { ...iv.answers, climate: "either" } });
    placeFromAnswers(["climate"]);
    const again = getPref("ps.rubrics")!.mine;
    expect(again.ranked.some((c) => c.factor === "climate")).toBe(false);
    expect(again.wonts).toContain("climate");
    expect(again.ranked.map((c) => c.factor)).toEqual(["trails", "town", "hospital", "garden"]);
  });

  it("once: the notice shows once, and after Undo nothing is added again", async () => {
    await boot();
    addFactorsOnce();
    markFactorsSeen();
    expect(pendingFactors()).toEqual([]);
    expect(getPref("ps.rubrics")!.factorsAdded).toEqual({ hospital: "seen", climate: "seen" });
    const without = undoFactorsAdd(["hospital", "climate"])!;
    expect(without.ranked.map((c) => c.factor)).toEqual(["trails", "town", "garden"]);
    expect(without.wonts).toEqual(["climate", "hospital"]);
    expect(getPref("ps.rubrics")!.factorsAdded).toEqual({ hospital: "undone", climate: "undone" });
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
