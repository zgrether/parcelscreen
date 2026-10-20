/**
 * Local profiles (roadmap step 1, PR 4; docs/plans/step-1-profiles-grading.md §3.4): the boot creates a first profile
 * and remembers it, picks the remembered one next time, drops the data from before profiles (step 2 plan §9: step 1's
 * ps.legacy.* copies silently; pre-profile keys and screens with the menu's one-time line), and makes the profile's
 * documents the prefs' store; the key-value store writes through in order and flushes.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import { MINE } from "../rubric/types";
import { MOVED_PREFIX, PRE_PROFILE_KEYS, type DeviceStore } from "./oldData";
import { getPref, setPref } from "./prefs";
import { activeKv, PROFILE_KEYS, ProfileKv, sharedKv, SPACE_ID } from "./profileKv";
import { memoryProfileStorage } from "./profileStore";
import {
  bootProfiles,
  CURRENT_PROFILE_KEY,
  currentProfile,
  FIRST_PROFILE_NAME,
  newProfile,
  oldDataDropped,
  resetProfilesForTests,
} from "./profiles";
import { loadUserConfig, saveUserConfig } from "./userConfig";

/** A localStorage stand-in. */
const fakeLs = (init: Record<string, string> = {}): DeviceStore & { data: Map<string, string> } => {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const PARCELS = JSON.stringify({ v: 2, open: null, built: [] });
const CFG = JSON.stringify({ ...DEFAULT_USER_CONFIG, sunHoursWanted: 5 });

afterEach(() => resetProfilesForTests());

describe("the boot", () => {
  it("a first visit creates 'Profile 1', remembers it on the device, and makes it current", async () => {
    const storage = memoryProfileStorage();
    const ls = fakeLs();
    const b = await bootProfiles({ storage, ls, now: "2026-10-16T12:00:00.000Z" });
    expect(b.created).toBe(true);
    expect(b.profile.name).toBe(FIRST_PROFILE_NAME);
    expect(ls.getItem(CURRENT_PROFILE_KEY)).toBe(b.profile.id);
    expect(currentProfile()?.id).toBe(b.profile.id);
    expect(await storage.profiles()).toEqual([b.profile]);
    expect(b.droppedOld).toBe(false);
    expect(oldDataDropped()).toBe(false);
  });

  it("picks the most recently opened profile without a memory, the remembered one with; opening moves it to the front", async () => {
    const storage = memoryProfileStorage();
    const a = newProfile("A", "2026-10-01T00:00:00.000Z");
    const z = newProfile("Z", "2026-10-10T00:00:00.000Z");
    await storage.putProfile(a);
    await storage.putProfile(z);
    const recent = await bootProfiles({ storage, ls: fakeLs(), now: "2026-10-16T00:00:00.000Z" });
    expect([recent.profile.id, recent.created]).toEqual([z.id, false]);
    resetProfilesForTests();
    const remembered = await bootProfiles({
      storage,
      ls: fakeLs({ [CURRENT_PROFILE_KEY]: a.id }),
      now: "2026-10-17T00:00:00.000Z",
    });
    expect(remembered.profile.id).toBe(a.id);
    expect((await storage.profiles()).find((p) => p.id === a.id)?.openedAt).toBe("2026-10-17T00:00:00.000Z");
    resetProfilesForTests();
    const again = await bootProfiles({ storage, ls: fakeLs(), now: "2026-10-18T00:00:00.000Z" });
    expect(again.profile.id).toBe(a.id);
  });

  it("without IndexedDB or localStorage it still boots, in memory", async () => {
    const b = await bootProfiles({ storage: memoryProfileStorage(), ls: null });
    expect(b.profile.name).toBe(FIRST_PROFILE_NAME);
    expect(activeKv()?.profile).toBe(b.profile.id);
  });
});

describe("data from before profiles is dropped (step 2 plan §9)", () => {
  it("step 1's ps.legacy.* copies go without a word; the profile's documents and the device keys stay", async () => {
    const storage = memoryProfileStorage();
    const existing = newProfile("Mine");
    await storage.putProfile(existing);
    await storage.putDoc({ profile: existing.id, key: "ps.cfg", value: CFG });
    // The household's list is already there (step 6), so this boot has no clean break of its own.
    await storage.putDoc({ profile: SPACE_ID, key: "ps.parcels", value: PARCELS });
    const ls = fakeLs({
      [CURRENT_PROFILE_KEY]: existing.id,
      [MOVED_PREFIX + "ps.parcels"]: PARCELS,
      [MOVED_PREFIX + "ps.cfg"]: CFG,
      [MOVED_PREFIX + "ps.person"]: "julie",
      "ps.view": "{}",
    });
    const b = await bootProfiles({ storage, ls });
    expect(b.profile.id).toBe(existing.id);
    expect(b.droppedOld).toBe(false);
    expect(oldDataDropped()).toBe(false);
    expect([...ls.data.keys()].filter((k) => k.startsWith(MOVED_PREFIX))).toEqual([]);
    expect(ls.getItem("ps.view")).toBe("{}");
    expect((await storage.docs(existing.id)).map((d) => d.key)).toEqual(["ps.cfg"]);
  });

  it("a browser that never opened step 1: its keys and unstamped screens go, nothing moves, and the menu says so", async () => {
    const storage = memoryProfileStorage();
    storage.state.screens.set("s1", {});
    storage.state.screens.set("s2", { profile: SPACE_ID });
    const ls = fakeLs({ "ps.parcels": PARCELS, "ps.cfg": CFG, "ps.person": "julie", "ps.view": "{}" });
    const b = await bootProfiles({ storage, ls });
    expect(b.droppedOld).toBe(true);
    expect(oldDataDropped()).toBe(true);
    for (const key of PRE_PROFILE_KEYS) expect(ls.getItem(key)).toBeNull();
    expect(ls.getItem("ps.view")).toBe("{}");
    // Nothing moved: the new profile holds only the interview it starts with (step 4).
    expect((await storage.docs(b.profile.id)).map((d) => d.key)).toEqual(["ps.interview"]);
    expect(loadUserConfig().sunHoursWanted).toBe(DEFAULT_USER_CONFIG.sunHoursWanted);
    expect([...storage.state.screens.keys()]).toEqual(["s2"]);
  });

  it("says so once: the next boot finds nothing to drop", async () => {
    const storage = memoryProfileStorage();
    const ls = fakeLs({ "ps.parcels": PARCELS });
    expect((await bootProfiles({ storage, ls })).droppedOld).toBe(true);
    resetProfilesForTests();
    expect((await bootProfiles({ storage, ls })).droppedOld).toBe(false);
    expect(oldDataDropped()).toBe(false);
  });

  it("the pre-profile keys are the profile keys of the time and the weight switch, never a device key", () => {
    expect(PRE_PROFILE_KEYS).toContain("ps.parcels");
    expect(PRE_PROFILE_KEYS).toContain("ps.person");
    expect(PRE_PROFILE_KEYS).not.toContain("ps.rubrics");
    expect(PRE_PROFILE_KEYS).not.toContain("ps.view");
    expect(PRE_PROFILE_KEYS).not.toContain(CURRENT_PROFILE_KEY);
    expect([...PROFILE_KEYS]).toContain("ps.library");
  });
});

describe("the profile's key-value store", () => {
  it("writes through to storage in order, and flush waits for them; the prefs route their profile keys to it", async () => {
    const storage = memoryProfileStorage();
    const b = await bootProfiles({ storage, ls: fakeLs() });
    const kv = b.kv;
    expect(kv).toBeInstanceOf(ProfileKv);
    setPref("ps.rubricView", "r2");
    saveUserConfig({ ...DEFAULT_USER_CONFIG, canopyDeg: 7 });
    expect(getPref("ps.rubricView")).toBe("r2");
    expect(loadUserConfig().canopyDeg).toBe(7);
    await kv.flush();
    const docs = await storage.docs(b.profile.id);
    expect(docs.find((d) => d.key === "ps.rubricView")?.value).toBe("r2");
    expect(JSON.parse(docs.find((d) => d.key === "ps.cfg")!.value).canopyDeg).toBe(7);
    kv.removeItem("ps.rubricView");
    await kv.flush();
    // (The first profile also holds the interview it starts with: step 4.)
    const others = (keys: string[]) => keys.filter((k) => k !== "ps.interview");
    expect(others((await storage.docs(b.profile.id)).map((d) => d.key))).toEqual(["ps.cfg"]);
    // A device key never reaches the profile's documents (no localStorage here: it reads as its default).
    setPref("ps.dim", true);
    expect(others(kv.keys())).toEqual(["ps.cfg"]);
    expect(getPref("ps.dim")).toBe(false);
  });

  it("a profile's documents are its own: another profile's store doesn't see them", async () => {
    const storage = memoryProfileStorage();
    const a = await bootProfiles({ storage, ls: fakeLs() });
    setPref("ps.rubricView", "r2");
    await a.kv.flush();
    resetProfilesForTests();
    const other = newProfile("Visitor");
    await storage.putProfile(other);
    const b = await bootProfiles({ storage, ls: fakeLs({ [CURRENT_PROFILE_KEY]: other.id }) });
    expect(b.profile.id).toBe(other.id);
    expect(getPref("ps.rubricView")).toBe(MINE); // the default
    expect(getPref("ps.parcels")).toBeNull();
  });

  it("deleting a profile takes its documents and its screens, and nothing else", async () => {
    const storage = memoryProfileStorage();
    const a = newProfile("A"),
      b = newProfile("B");
    await storage.putProfile(a);
    await storage.putProfile(b);
    await storage.putDoc({ profile: a.id, key: "ps.cfg", value: "{}" });
    await storage.putDoc({ profile: b.id, key: "ps.cfg", value: "{}" });
    storage.state.screens.set("sa", { profile: a.id });
    storage.state.screens.set("sb", { profile: b.id });
    await storage.deleteProfile(a.id);
    expect((await storage.profiles()).map((p) => p.id)).toEqual([b.id]);
    expect(await storage.docs(a.id)).toEqual([]);
    expect((await storage.docs(b.id)).length).toBe(1);
    expect(await storage.screenIds(a.id)).toEqual([]);
    expect(await storage.screenIds(b.id)).toEqual(["sb"]);
  });
});

describe("the household's one list (step 6, docs/plans/step-6-household.md §1)", () => {
  it("the parcels and the household's document are shared: every profile reads and writes the same ones", async () => {
    const storage = memoryProfileStorage();
    const a = await bootProfiles({ storage, ls: fakeLs() });
    setPref("ps.parcels", { v: 2, open: null, built: [] });
    await sharedKv()!.flush();
    expect((await storage.docs(SPACE_ID)).map((d) => d.key)).toContain("ps.parcels");
    expect((await storage.docs(a.profile.id)).map((d) => d.key)).not.toContain("ps.parcels");
    resetProfilesForTests();
    const other = newProfile("Julie");
    await storage.putProfile(other);
    await bootProfiles({ storage, ls: fakeLs({ [CURRENT_PROFILE_KEY]: other.id }) });
    expect(getPref("ps.parcels")).toEqual({ v: 2, open: null, built: [] });
  });

  it("the clean break: each profile's own list and the screens stamped with a profile go, once, and the menu says so", async () => {
    const storage = memoryProfileStorage();
    const zach = newProfile("Zach");
    const julie = newProfile("Julie");
    await storage.putProfile(zach);
    await storage.putProfile(julie);
    await storage.putDoc({ profile: zach.id, key: "ps.parcels", value: PARCELS });
    await storage.putDoc({ profile: zach.id, key: "ps.cfg", value: CFG });
    await storage.putDoc({ profile: julie.id, key: "ps.parcels", value: PARCELS });
    storage.state.screens.set("old", { profile: zach.id });
    const b = await bootProfiles({ storage, ls: fakeLs({ [CURRENT_PROFILE_KEY]: zach.id }) });
    expect(b.droppedOld).toBe(true);
    expect(oldDataDropped()).toBe(true);
    expect((await storage.docs(zach.id)).map((d) => d.key)).toEqual(["ps.cfg"]);
    expect(await storage.docs(julie.id)).toEqual([]);
    expect([...storage.state.screens.keys()]).toEqual([]);
    // Once there's a shared list, there's nothing more to break.
    setPref("ps.parcels", { v: 2, open: null, built: [] });
    await sharedKv()!.flush();
    resetProfilesForTests();
    expect((await bootProfiles({ storage, ls: fakeLs() })).droppedOld).toBe(false);
  });

  it("deleting a profile leaves the household's list and its screens", async () => {
    const storage = memoryProfileStorage();
    const a = newProfile("A");
    await storage.putProfile(a);
    await storage.putDoc({ profile: SPACE_ID, key: "ps.parcels", value: PARCELS });
    storage.state.screens.set("shared", { profile: SPACE_ID });
    await storage.deleteProfile(a.id);
    expect((await storage.docs(SPACE_ID)).length).toBe(1);
    expect(await storage.screenIds(SPACE_ID)).toEqual(["shared"]);
  });
});
