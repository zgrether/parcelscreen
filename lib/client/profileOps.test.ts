/**
 * The picker's operations (step 1, PR 5b; docs/plans/step-1-profiles-grading.md §3.4): list, add, rename and delete,
 * over the in-memory storage. Switching reloads the page, so it isn't tested here (e2e/profiles.spec.ts).
 */
import { afterEach, describe, expect, it } from "vitest";
import type { DeviceStore } from "./oldData";
import {
  addProfile,
  bootProfiles,
  CURRENT_PROFILE_KEY,
  currentProfile,
  deleteProfile,
  FIRST_PROFILE_NAME,
  listProfiles,
  reloadAfterWrites,
  renameProfile,
  resetProfilesForTests,
  switchProfile,
} from "./profiles";
import { getPref, setPref } from "./prefs";
import { memoryProfileStorage } from "./profileStore";

const fakeLs = (init: Record<string, string> = {}): DeviceStore & { data: Map<string, string> } => {
  const data = new Map<string, string>(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

afterEach(resetProfilesForTests);

describe("the picker's operations", () => {
  it("lists the most recently opened first; a new profile is kept, not made current", async () => {
    const storage = memoryProfileStorage();
    const ls = fakeLs();
    const first = await bootProfiles({ storage, ls, now: "2026-10-17T10:00:00.000Z" });
    const visitor = await addProfile("Visitor", "2026-10-17T11:00:00.000Z");
    expect((await listProfiles()).map((p) => p.name)).toEqual(["Visitor", FIRST_PROFILE_NAME]);
    expect(currentProfile()?.id).toBe(first.profile.id);
    expect(ls.getItem(CURRENT_PROFILE_KEY)).toBe(first.profile.id);
    expect(storage.state.profiles.get(visitor.id)?.name).toBe("Visitor");
  });

  it("renames in storage, and the current profile in place", async () => {
    const storage = memoryProfileStorage();
    const b = await bootProfiles({ storage, ls: fakeLs() });
    await renameProfile(b.profile.id, "Zach");
    expect(currentProfile()?.name).toBe("Zach");
    expect((await listProfiles()).map((p) => p.name)).toEqual(["Zach"]);
    await renameProfile("no-such-profile", "Nobody"); // nothing to rename: no error
    expect((await listProfiles()).map((p) => p.name)).toEqual(["Zach"]);
  });

  it("deletes another profile with its documents and screens; deleting the current one forgets the device's choice", async () => {
    const storage = memoryProfileStorage();
    const ls = fakeLs();
    const b = await bootProfiles({ storage, ls });
    const visitor = await addProfile("Visitor");
    await storage.putDoc({ profile: visitor.id, key: "ps.cfg", value: "{}" });
    storage.state.screens.set("sv", { profile: visitor.id });
    storage.state.screens.set("sb", { profile: b.profile.id });

    expect(await deleteProfile(visitor.id)).toEqual({ wasCurrent: false });
    expect((await listProfiles()).map((p) => p.id)).toEqual([b.profile.id]);
    expect(await storage.docs(visitor.id)).toEqual([]);
    expect([...storage.state.screens.keys()]).toEqual(["sb"]);
    expect(ls.getItem(CURRENT_PROFILE_KEY)).toBe(b.profile.id);

    expect(await deleteProfile(b.profile.id)).toEqual({ wasCurrent: true });
    expect(ls.getItem(CURRENT_PROFILE_KEY)).toBeNull();
    expect(await listProfiles()).toEqual([]);
  });
});

describe("a reload waits for the writes (#154 review)", () => {
  it("a write queued just before a switch is in storage after it, and before the device's choice changes", async () => {
    const storage = memoryProfileStorage({ delayWrites: 20 });
    const ls = fakeLs();
    const a = await bootProfiles({ storage, ls });
    const other = await addProfile("Visitor");
    // The device's choice is written only once the queued write has landed.
    let docsWhenSwitched: string[] | null = null;
    const setItem = ls.setItem;
    ls.setItem = (k, v) => {
      if (k === CURRENT_PROFILE_KEY) docsWhenSwitched = [...storage.state.docs.values()].map((d) => d.key);
      setItem(k, v);
    };
    setPref("ps.rubricView", "r2"); // queued: lands 20 ms later
    expect([...storage.state.docs.values()]).toEqual([]);
    await switchProfile(other.id);
    expect(docsWhenSwitched).toEqual(["ps.rubricView"]);
    expect(ls.getItem(CURRENT_PROFILE_KEY)).toBe(other.id);
    // Booted again as the first profile, the write is there.
    resetProfilesForTests();
    const again = await bootProfiles({ storage, ls: fakeLs({ [CURRENT_PROFILE_KEY]: a.profile.id }) });
    expect(again.profile.id).toBe(a.profile.id);
    expect(getPref("ps.rubricView")).toBe("r2");
  });

  it("reloadAfterWrites (a delete of the current profile) waits the same way", async () => {
    const storage = memoryProfileStorage({ delayWrites: 20 });
    await bootProfiles({ storage, ls: fakeLs() });
    setPref("ps.rubricView", "r3");
    expect([...storage.state.docs.values()]).toEqual([]);
    await reloadAfterWrites();
    expect([...storage.state.docs.values()].map((d) => d.value)).toEqual(["r3"]);
  });
});
