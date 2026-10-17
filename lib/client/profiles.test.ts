/**
 * Local profiles (roadmap step 1, PR 4; docs/plans/step-1-profiles-grading.md §3.4–§3.5): the boot creates a first
 * profile and remembers it, picks the remembered one next time, moves the browser's pre-profile data into the first
 * profile once (renaming the keys to ps.legacy.*, never deleting them), does nothing the second time, leaves the keys
 * untouched when storage refuses the move, and makes the profile's documents the prefs' store; the key-value store
 * writes through in order and flushes.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import { MINE } from "../rubric/types";
import {
  LEGACY_PREFIX,
  LEGACY_SECOND_ID,
  LEGACY_SECOND_NAME,
  legacyDocs,
  migrateLegacy,
  type LegacyStore,
} from "./migrateProfiles";
import { getPref, setPref } from "./prefs";
import { activeKv, PROFILE_KEYS, ProfileKv } from "./profileKv";
import { memoryProfileStorage } from "./profileStore";
import {
  bootProfiles,
  CURRENT_PROFILE_KEY,
  currentProfile,
  FIRST_PROFILE_NAME,
  newProfile,
  resetProfilesForTests,
} from "./profiles";
import { loadUserConfig, saveUserConfig } from "./userConfig";

/** A localStorage stand-in. */
const fakeLs = (init: Record<string, string> = {}): LegacyStore & { data: Map<string, string> } => {
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
    expect(b.migrated).toBe(false);
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

describe("the move into the first profile (approval C)", () => {
  it("moves every pre-profile key into the profile's documents, stamps the kept screens, and renames the keys", async () => {
    const storage = memoryProfileStorage();
    storage.state.screens.set("s1", {});
    storage.state.screens.set("s2", { profile: "other" });
    const ls = fakeLs({ "ps.parcels": PARCELS, "ps.cfg": CFG, "ps.person": "julie", "ps.view": "{}" });
    const b = await bootProfiles({ storage, ls });
    expect(b.migrated).toBe(true);
    const docs = await storage.docs(b.profile.id);
    // The weight switch (ps.person) becomes the rubric view, and the profile gets its rubrics: its own (the default)
    // and the second weight set the app shipped with, as another's (plan §8 Q3).
    expect(docs.map((d) => d.key).sort()).toEqual(["ps.cfg", "ps.parcels", "ps.rubricView", "ps.rubrics"]);
    expect(docs.find((d) => d.key === "ps.parcels")?.value).toBe(PARCELS);
    // The keys are renamed, not deleted (step 2's first PR deletes them); a device key stays.
    expect(ls.getItem("ps.parcels")).toBeNull();
    expect(ls.getItem(LEGACY_PREFIX + "ps.parcels")).toBe(PARCELS);
    expect(ls.getItem(LEGACY_PREFIX + "ps.cfg")).toBe(CFG);
    expect(ls.getItem("ps.view")).toBe("{}");
    // Unstamped screens are the profile's; one another profile holds stays its.
    expect(storage.state.screens.get("s1")).toEqual({ profile: b.profile.id });
    expect(storage.state.screens.get("s2")).toEqual({ profile: "other" });
    // The documents are what the prefs read now.
    expect(getPref("ps.rubricView")).toBe(LEGACY_SECOND_ID);
    expect(getPref("ps.rubrics")?.others.map((o) => [o.id, o.name])).toEqual([
      [LEGACY_SECOND_ID, LEGACY_SECOND_NAME],
    ]);
    expect(ls.getItem(LEGACY_PREFIX + "ps.person")).toBe("julie");
    expect(loadUserConfig().sunHoursWanted).toBe(5);
  });

  it("runs once: a second boot finds no pre-profile key and changes nothing", async () => {
    const storage = memoryProfileStorage();
    const ls = fakeLs({ "ps.parcels": PARCELS });
    const first = await bootProfiles({ storage, ls });
    const docsAfterFirst = JSON.stringify(await storage.docs(first.profile.id));
    resetProfilesForTests();
    const second = await bootProfiles({ storage, ls });
    expect(second.migrated).toBe(false);
    expect(second.profile.id).toBe(first.profile.id);
    expect(JSON.stringify(await storage.docs(first.profile.id))).toBe(docsAfterFirst);
    expect([...ls.data.keys()].filter((k) => k.startsWith(LEGACY_PREFIX))).toEqual([
      LEGACY_PREFIX + "ps.parcels",
    ]);
  });

  it("a move that storage refuses leaves the keys untouched, and the boot still completes", async () => {
    const storage = memoryProfileStorage({ failAdopt: true });
    const ls = fakeLs({ "ps.parcels": PARCELS, "ps.cfg": CFG });
    const b = await bootProfiles({ storage, ls });
    expect(b.migrated).toBe(false);
    expect(ls.getItem("ps.parcels")).toBe(PARCELS);
    expect(ls.getItem("ps.cfg")).toBe(CFG);
    expect(ls.getItem(LEGACY_PREFIX + "ps.parcels")).toBeNull();
    expect(await storage.docs(b.profile.id)).toEqual([]);
    await expect(migrateLegacy(storage, b.profile.id, ls)).rejects.toThrow("adopt failed");
  });

  it("legacyDocs lists exactly the profile-scoped keys the browser holds, in a fixed order", () => {
    const ls = fakeLs({ "ps.cfg": CFG, "ps.parcels": PARCELS, "ps.debug": "1" });
    const docs = legacyDocs(ls, "p");
    expect(docs.map((d) => d.key)).toEqual(["ps.parcels", "ps.cfg", "ps.rubrics", "ps.rubricView"]);
    // No weight switch kept: the profile's own rubric is on show.
    expect(docs.find((d) => d.key === "ps.rubricView")?.value).toBe(MINE);
    expect(legacyDocs(fakeLs({ "ps.debug": "1" }), "p")).toEqual([]);
    expect([...PROFILE_KEYS]).toContain("ps.library");
    expect([...PROFILE_KEYS]).not.toContain("ps.view");
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
    expect((await storage.docs(b.profile.id)).map((d) => d.key)).toEqual(["ps.cfg"]);
    // A device key never reaches the profile's documents (no localStorage here: it reads as its default).
    setPref("ps.dim", true);
    expect(kv.keys()).toEqual(["ps.cfg"]);
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
