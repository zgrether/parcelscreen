import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { ParcelRecord } from "@/lib/geo/parcels";
import type { LatLon } from "@/lib/geo/types";
import {
  decideTap,
  exploreReducer,
  INITIAL,
  type ExploreAction,
  type ExploreState,
  type Stamp,
} from "./exploreState";

const run = (actions: ExploreAction[], from: ExploreState = INITIAL) => actions.reduce(exploreReducer, from);
let n = 0;
const at = (): Stamp => ({ now: `2026-10-05T12:00:${String(n % 60).padStart(2, "0")}.000Z`, key: `k${++n}` });

const sq = (x0: number) =>
  polygon([
    [
      [x0, 36.628],
      [x0 + 0.002, 36.628],
      [x0 + 0.002, 36.63],
      [x0, 36.63],
      [x0, 36.628],
    ],
  ]);
const record = (x0: number, id: string): ParcelRecord => ({
  geo: sq(x0),
  props: { PARCELID: id, OWNER: "R. & J. Hale" },
  source: "https://vginmaps.vdem.virginia.gov/x",
  multiPart: false,
});
const a = record(-81.355, "52-47A"),
  b = record(-81.353, "52-42A");
const selectA = (): ExploreAction => ({ type: "select", record: a, stamp: at() });
const house = (ll: LatLon | null = [36.629, -81.354]): ExploreAction => ({ type: "house", ll, stamp: at() });

describe("the open parcel and History", () => {
  it("a tapped parcel opens plain: not in History", () => {
    const s = run([selectA()]);
    expect(s.store.open?.pieces).toEqual([a]);
    expect(s.store.open?.key).toBeNull();
    expect(s.store.built).toEqual([]);
  });

  it("marking the house builds it: saved to History, house kept to 6 decimals, house mode ends", () => {
    const s = run([selectA(), { type: "mode", mode: "house" }, house([36.62912345678, -81.35421987654])]);
    expect(s.store.open?.house).toEqual([36.629123, -81.35422]);
    expect(s.store.open?.key).not.toBeNull();
    expect(s.store.built.map((x) => x.key)).toEqual([s.store.open?.key]);
    expect(s.mode).toBeNull();
  });

  it("closing keeps a built parcel in History; it reopens; removing it takes it out (and closes it)", () => {
    const built = run([selectA(), house()]);
    const key = built.store.open!.key!;
    const closed = exploreReducer(built, { type: "close" });
    expect(closed.store.open).toBeNull();
    expect(closed.store.built).toHaveLength(1);
    const reopened = exploreReducer(closed, { type: "openSaved", key });
    expect(reopened.store.open?.house).toEqual([36.629, -81.354]);
    expect(exploreReducer(reopened, { type: "removeSaved", key }).store).toEqual({
      v: 2,
      open: null,
      built: [],
    });
  });

  it("drawing with nothing open makes a new (built) parcel; with one open, adds a drawn piece", () => {
    const corners: LatLon[] = [
      [36.63, -81.351],
      [36.63, -81.35],
      [36.631, -81.35],
    ];
    const draw = (): ExploreAction[] => [
      { type: "startDraw" },
      ...corners.map((ll) => ({ type: "draftAdd" as const, ll })),
      { type: "finishDraw", stamp: at() },
    ];
    const alone = run(draw());
    expect(alone.store.open?.pieces.map((p) => p.source)).toEqual(["drawn"]);
    expect(alone.store.built).toHaveLength(1);
    const added = run([selectA(), ...draw()]);
    expect(added.store.open?.pieces.map((p) => p.source)).toEqual([a.source, "drawn"]);
    expect(added.mode).toBeNull();
    // Undo takes the last corner back.
    expect(
      run([
        { type: "startDraw" },
        { type: "draftAdd", ll: corners[0]! },
        { type: "draftAdd", ll: corners[1]! },
        { type: "draftUndo" },
      ]).draft,
    ).toEqual([corners[0]]);
    // Fewer than three corners: nothing changes.
    const two = run([
      selectA(),
      { type: "startDraw" },
      { type: "draftAdd", ll: corners[0]! },
      { type: "draftAdd", ll: corners[1]! },
    ]);
    expect(exploreReducer(two, { type: "finishDraw", stamp: at() })).toBe(two);
  });

  it("a split saves the line and the side kept, so it can be edited later from where it was", () => {
    const line = { a: [36.627, -81.354] as LatLon, b: [36.631, -81.354] as LatLon };
    const s = run([
      selectA(),
      { type: "startSplit" },
      { type: "splitTap", ll: line.a },
      { type: "splitTap", ll: line.b },
      { type: "keepPiece", side: -1, stamp: at() },
    ]);
    expect(s.store.open?.split).toEqual({ ...line, keep: -1 });
    expect(s.store.open?.pieces).toEqual([a]); // the pieces stay whole: the split is applied when derived
    expect(s.store.built).toHaveLength(1);
    // Editing starts from the saved line.
    expect(exploreReducer(s, { type: "startSplit" }).split).toEqual(line);
  });

  it("combining starts from the open parcel's pieces and saves the new pieces, keeping the split", () => {
    const split = run([
      selectA(),
      { type: "startSplit" },
      { type: "splitTap", ll: [36.627, -81.354] },
      { type: "splitTap", ll: [36.631, -81.354] },
      { type: "keepPiece", side: 1, stamp: at() },
    ]);
    const s0 = exploreReducer(split, { type: "startCombine" });
    expect(s0.combine).toEqual([a]);
    const s = run(
      [
        { type: "combineToggle", parcel: b },
        { type: "applyCombine", stamp: at() },
      ],
      s0,
    );
    expect(s.store.open?.pieces).toEqual([a, b]);
    expect(s.store.open?.split?.keep).toBe(1);
    expect(s.store.built).toHaveLength(1); // the same History entry, updated
  });

  it("a drawn piece is never matched: adding the same drawn shape twice keeps both, and parcels still toggle", () => {
    const drawn: ParcelRecord = {
      geo: b.geo,
      props: { PARCELID: "52-42A" },
      source: "drawn",
      multiPart: false,
    };
    const s = run([
      { type: "startCombine" },
      { type: "combineToggle", parcel: b },
      { type: "combineToggle", parcel: drawn },
      { type: "combineToggle", parcel: drawn },
    ]);
    expect(s.combine?.map((m) => m.source)).toEqual([b.source, "drawn", "drawn"]);
    expect(exploreReducer(s, { type: "combineToggle", parcel: b }).combine?.map((m) => m.source)).toEqual([
      "drawn",
      "drawn",
    ]);
  });

  it("a different parcel, closing, or reopening ends any tool in progress", () => {
    const busy = run([selectA(), { type: "startDraw" }, { type: "draftAdd", ll: [36.63, -81.35] }]);
    for (const act of [{ type: "select", record: b, stamp: at() }, { type: "close" }] as ExploreAction[])
      expect(exploreReducer(busy, act)).toMatchObject({ mode: null, draft: [], split: null, combine: null });
  });
});

describe("tap rules (decideTap)", () => {
  const none = { insideOpen: false, outline: null, savedKey: null };
  const plain = run([selectA()]);
  const built = run([selectA(), house()]);
  const builtKey = built.store.open!.key!;
  const withSaved = exploreReducer(built, { type: "close" });

  it("nothing open: an outline selects; a saved parcel opens (over the outline beneath it); empty map does nothing", () => {
    expect(decideTap(INITIAL, { ...none, outline: b })).toEqual({ kind: "select", record: b });
    expect(decideTap(withSaved, { ...none, outline: a, savedKey: builtKey })).toEqual({
      kind: "openSaved",
      key: builtKey,
    });
    expect(decideTap(INITIAL, none)).toEqual({ kind: "none" });
  });

  it("tapping the open parcel again, or empty map, unselects it (plain or built)", () => {
    for (const s of [plain, built]) {
      expect(decideTap(s, { ...none, insideOpen: true, outline: a })).toEqual({ kind: "close" });
      expect(decideTap(s, none)).toEqual({ kind: "close" });
    }
  });

  it("another parcel: a plain one swaps; a built one stays and nudges", () => {
    expect(decideTap(plain, { ...none, outline: b })).toEqual({ kind: "select", record: b });
    expect(decideTap(built, { ...none, outline: b })).toEqual({ kind: "nudge" });
    const plainWithSaved = run([selectA()], withSaved);
    expect(decideTap(plainWithSaved, { ...none, outline: b, savedKey: builtKey })).toEqual({
      kind: "openSaved",
      key: builtKey,
    });
  });
});
