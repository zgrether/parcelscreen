/**
 * The household's members (step 6, docs/plans/step-6-household.md §2): every profile, each with their own rubric once
 * they've set their priorities; the other members' rubrics grade beside the current profile's, and step 1's stored
 * \`others\` are no longer read.
 */
import { afterEach, describe, expect, it } from "vitest";
import { defaultRubric } from "../rubric/default";
import { MINE } from "../rubric/types";
import { loadHousehold, memberName, members, otherMembers } from "./household";
import { memoryProfileStorage } from "./profileStore";
import { bootProfiles, CURRENT_PROFILE_KEY, newProfile, resetProfilesForTests } from "./profiles";
import { profileRubrics } from "./rubrics";

const ls = (current: string) => {
  const data = new Map([[CURRENT_PROFILE_KEY, current]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
};

afterEach(() => resetProfilesForTests());

describe("the members", () => {
  it("every profile, in the order they joined; others' own rubrics grade beside mine; none without priorities", async () => {
    const storage = memoryProfileStorage();
    const zach = newProfile("Zach", "2026-10-01T00:00:00.000Z");
    const julie = newProfile("Julie", "2026-10-02T00:00:00.000Z");
    const guest = newProfile("Guest", "2026-10-03T00:00:00.000Z");
    for (const p of [zach, julie, guest]) await storage.putProfile(p);
    const hers = { ...defaultRubric(), wonts: ["sky" as const] };
    await storage.putDoc({
      profile: julie.id,
      key: "ps.rubrics",
      value: JSON.stringify({ mine: hers, others: [] }),
    });
    // Step 1's stand-in on Zach's own document: no longer read.
    const standIn = { id: "j1", name: "Old Julie", rubric: defaultRubric() };
    await storage.putDoc({
      profile: zach.id,
      key: "ps.rubrics",
      value: JSON.stringify({ mine: defaultRubric(), others: [standIn] }),
    });
    await bootProfiles({ storage, ls: ls(zach.id) });
    await loadHousehold();

    expect(members().map((m) => m.name)).toEqual(["Zach", "Julie", "Guest"]);
    expect(otherMembers().map((m) => m.name)).toEqual(["Julie", "Guest"]);
    expect(members().find((m) => m.name === "Guest")!.rubric).toBeNull();
    expect(memberName(julie.id)).toBe("Julie");
    expect(memberName("gone")).toBeNull();

    const rubrics = profileRubrics();
    expect(rubrics.map((r) => [r.id, r.name])).toEqual([
      [MINE, "Mine"],
      [julie.id, "Julie"],
    ]);
    // Step 11: a list saved before it gets its new factors in memory; Climate, unanswered, is Don't care.
    expect(rubrics[1]!.rubric.wonts).toEqual(["sky", "climate", "privacy", "longView", "airport"]);
  });
});
