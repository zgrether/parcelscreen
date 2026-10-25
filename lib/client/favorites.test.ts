/** Favorites and History (step 8, docs/plans/step-8-favorites.md §1–§6). */
import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { ParcelRecord } from "@/lib/geo/parcels";
import {
  clearable,
  clearHistory,
  EMPTY_LOG,
  favoritesOf,
  historyAt,
  historyOf,
  inHistoryOf,
  matchesSaved,
  parcelNumbers,
  pastRecent,
  RECENT_DAYS,
  RECENT_MAX,
  recentOf,
  sortedIntoHistory,
  star,
  starName,
  unstar,
  visibleTo,
  withGraded,
  withOpened,
  type HistoryLog,
} from "./favorites";
import { plainParcel, type ParcelStore, type WorkingParcel } from "./parcelStore";

const county = (id: string): ParcelRecord => ({
  geo: polygon([
    [
      [-81.355, 36.628],
      [-81.353, 36.628],
      [-81.353, 36.63],
      [-81.355, 36.63],
      [-81.355, 36.628],
    ],
  ]),
  props: { PARCELID: id },
  source: "https://vginmaps.vdem.virginia.gov/x",
  multiPart: false,
});
const T0 = "2026-10-20T10:00:00.000Z";
const parcel = (key: string, more: Partial<WorkingParcel> = {}): WorkingParcel => ({
  ...plainParcel(county(`52-${key}`), T0),
  key,
  addedBy: "zach",
  ...more,
});
const store = (...built: WorkingParcel[]): ParcelStore => ({ v: 2, open: null, built });
const keysOf = (ps: readonly WorkingParcel[]) => ps.map((p) => p.key);

// Zach's: a, graded at 11; b, changed at 12 and never graded; f, a favorite Julie graded; old, archived.
const A = parcel("a", { updatedAt: T0 });
const B = parcel("b", { updatedAt: "2026-10-20T12:00:00.000Z" });
const F = parcel("f", { status: "saved" });
const OLD = parcel("old", { status: "archived", archived: { reason: "Sold", at: T0, from: "saved" } });
// Julie's own, not starred.
const J = parcel("j", { addedBy: "julie" });
const S = store(A, B, F, OLD, J);
const ZACH_LOG: HistoryLog = withGraded(EMPTY_LOG, "a", "2026-10-20T11:00:00.000Z");
const JULIE_LOG: HistoryLog = withGraded(EMPTY_LOG, "f", "2026-10-20T13:00:00.000Z");

describe("the views", () => {
  it("Favorites: the starred and the archived, the household's", () => {
    expect(keysOf(favoritesOf(S.built))).toEqual(["f", "old"]);
  });

  it("History: my unstarred parcels, newest first by grading, else by change; and favorites I graded", () => {
    expect(keysOf(historyOf(S.built, "zach", ZACH_LOG))).toEqual(["b", "a"]);
    expect(keysOf(historyOf(S.built, "julie", JULIE_LOG))).toEqual(["f", "j"]);
  });

  it("someone else's unstarred parcel is in none of my views", () => {
    expect(inHistoryOf(J, "zach", ZACH_LOG)).toBe(false);
    expect(visibleTo(J, "zach", ZACH_LOG)).toBe(false);
    expect(visibleTo(F, "zach", ZACH_LOG)).toBe(true);
    // Even one I graded, once it's unstarred (plan §2: for the others it's gone).
    expect(visibleTo(unstarred(F), "julie", JULIE_LOG)).toBe(false);
  });
});

const unstarred = (p: WorkingParcel): WorkingParcel => ({ ...p, status: "inProgress", archived: null });

describe("starring and unstarring", () => {
  it("star: a favorite with its name; its adder stays", () => {
    const s = star(S, "a", "  24.6 ac on Rte 600  ", T0);
    const a = s.built.find((p) => p.key === "a")!;
    expect([a.status, a.name, a.addedBy]).toEqual(["saved", "24.6 ac on Rte 600", "zach"]);
  });

  it("unstar: back to its adder's History, archived or not; the others lose it", () => {
    const s = unstar(unstar(S, "f", T0), "old", T0);
    expect(favoritesOf(s.built)).toEqual([]);
    expect(keysOf(historyOf(s.built, "zach", ZACH_LOG))).toEqual(expect.arrayContaining(["f", "old"]));
    expect(keysOf(historyOf(s.built, "julie", JULIE_LOG))).toEqual(["j"]);
  });
});

describe("clearing History", () => {
  it("Clear history: every unstarred parcel of mine, gone; favorites stay, and their log", () => {
    const log = withGraded(ZACH_LOG, "f", T0);
    expect(keysOf(clearable(S.built, "zach", log))).toEqual(["b", "a"]);
    const out = clearHistory(S, "zach", log);
    expect(keysOf(out.store.built)).toEqual(["f", "old", "j"]);
    expect(keysOf(out.removed)).toEqual(["a", "b"]);
    expect(Object.keys(out.log.graded)).toEqual(["f"]);
  });

  it("✕ on one row; a favorite or another's parcel isn't cleared", () => {
    const out = clearHistory(S, "zach", ZACH_LOG, ["a", "f", "j"]);
    expect(keysOf(out.store.built)).toEqual(["b", "f", "old", "j"]);
  });
});

describe("Recent (8c; Z-8: 50 for 60 days)", () => {
  const NOW = "2026-10-21T10:00:00.000Z";
  // 55 of Zach's, an hour apart, the newest graded an hour before NOW; and one 61 days old.
  const hourly = Array.from({ length: 55 }, (_, i) =>
    parcel(`r${i}`, { updatedAt: new Date(Date.parse(NOW) - (i + 1) * 3_600_000).toISOString() }),
  );
  const stale = parcel("stale", { updatedAt: "2026-08-21T09:00:00.000Z" });
  const many = store(...hourly, stale, F, J);

  it("my unstarred parcels only, newest first, the 50 newest", () => {
    expect([RECENT_MAX, RECENT_DAYS]).toEqual([50, 60]);
    const recent = recentOf(many.built, "zach", EMPTY_LOG, NOW);
    expect(recent).toHaveLength(RECENT_MAX);
    expect(keysOf(recent).slice(0, 2)).toEqual(["r0", "r1"]);
    expect(keysOf(recent)).not.toContain("f");
  });

  it("a favorite I graded isn't in Recent: it's on the list", () => {
    expect(keysOf(recentOf(S.built, "julie", JULIE_LOG, NOW))).toEqual(["j"]);
  });

  it("older than 60 days by its grading or opening, it falls out; graded or opened since, it's back", () => {
    const s = store(stale, A);
    expect(keysOf(recentOf(s.built, "zach", EMPTY_LOG, NOW))).toEqual(["a"]);
    const graded = withGraded(EMPTY_LOG, "stale", "2026-10-21T09:30:00.000Z");
    expect(keysOf(recentOf(s.built, "zach", graded, NOW))).toEqual(["stale", "a"]);
    // §9 Q4: the later of the last grade and the last opening counts.
    const opened = withOpened(EMPTY_LOG, "stale", "2026-10-21T09:30:00.000Z");
    expect(keysOf(recentOf(s.built, "zach", opened, NOW))).toEqual(["stale", "a"]);
    const oldGrade = withOpened(withGraded(EMPTY_LOG, "stale", "2026-08-01T00:00:00.000Z"), "stale", NOW);
    expect(historyAt(stale, oldGrade)).toBe(NOW);
  });

  it("what falls out is dropped, but never the open parcel, a favorite or another's", () => {
    const out = pastRecent(many.built, "zach", EMPTY_LOG, NOW, "r54");
    expect(out.sort()).toEqual(["r50", "r51", "r52", "r53", "stale"]);
    expect(pastRecent(S.built, "zach", ZACH_LOG, NOW, null)).toEqual([]);
  });
});

describe("the one-time sort (plan §6)", () => {
  it("In progress parcels with no adder go to the current profile's History; favorites and the rest stay", () => {
    const legacy = store(parcel("x", { addedBy: null }), parcel("y", { addedBy: null, status: "saved" }), J);
    const s = sortedIntoHistory(legacy, "zach")!;
    expect(s.built.map((p) => [p.key, p.addedBy, p.status])).toEqual([
      ["x", "zach", "inProgress"],
      ["y", null, "saved"],
      ["j", "julie", "inProgress"],
    ]);
    expect(sortedIntoHistory(s, "zach")).toBeNull();
  });
});

describe("Search and the name", () => {
  it("matches a saved parcel by name, or by a piece's parcel number with separators ignored", () => {
    expect(parcelNumbers(A)).toEqual(["52-a"]);
    expect(matchesSaved("Ferney Creek", ["52-47A"], "ferney")).toBe(true);
    expect(matchesSaved("Ferney Creek", ["52-47A"], "52 47")).toBe(true);
    expect(matchesSaved("Ferney Creek", ["52-47A"], "5247a")).toBe(true);
    expect(matchesSaved("Ferney Creek", ["52-47A"], "47")).toBe(false);
  });

  it("the name sheet's start: its own name, the listing's address, or a description", () => {
    const facts = { acres: 24.61, road: "Rte 600", county: "Grayson" };
    expect(starName({ ...A, name: "The bench" }, facts)).toBe("The bench");
    expect(
      starName(
        {
          ...A,
          listingUrl: "https://www.zillow.com/homedetails/123-Mud-Creek-Ln-Troutdale-VA-24378/1_zpid/",
        },
        facts,
      ),
    ).toMatch(/Mud Creek/i);
    expect(starName(A, facts)).toBe("24.6 ac on Rte 600, Grayson");
    expect(starName(A, { ...facts, road: null })).toBe("24.6 ac in Grayson");
  });
});
