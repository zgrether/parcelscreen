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
    const placed = run([
      selectA(),
      { type: "startSplit" },
      { type: "splitTap", ll: line.a },
      { type: "splitTap", ll: line.b },
    ]);
    // With the line placed, the tool waits for a tap on the piece to keep.
    expect(placed.mode).toBe("split");
    expect(placed.split).toEqual(line);
    expect(exploreReducer(placed, { type: "splitTap", ll: [36.629, -81.355] })).toBe(placed);
    const s = exploreReducer(placed, { type: "keepPiece", side: -1, stamp: at() });
    expect(s.mode).toBeNull();
    expect(s.split).toBeNull();
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

describe("the Info panel and its layers (13e-4)", () => {
  const combined = () =>
    run([
      selectA(),
      { type: "startCombine" },
      { type: "combineToggle", parcel: b },
      { type: "applyCombine", stamp: at() },
    ]);

  it("selecting a layer opens the panel; closing the panel clears the layer", () => {
    const s = run([selectA(), { type: "layer", id: "part:0" }]);
    expect(s).toMatchObject({ info: true, layer: "part:0" });
    expect(exploreReducer(s, { type: "layer", id: null })).toMatchObject({ info: true, layer: null });
    expect(exploreReducer(s, { type: "info", open: false })).toMatchObject({ info: false, layer: null });
  });

  it("unselecting the parcel, or opening another, always closes the panel", () => {
    const s = run([selectA(), house(), { type: "layer", id: "house" }]);
    for (const act of [
      { type: "close" },
      { type: "select", record: b, stamp: at() },
      { type: "removeSaved", key: s.store.open!.key! },
    ] as ExploreAction[])
      expect(exploreReducer(s, act)).toMatchObject({ info: false, layer: null });
  });

  it("switching parcels keeps a docked panel open on the new one (desktop), with no layer selected", () => {
    const s = run([selectA(), house(), { type: "layer", id: "house" }]);
    const key = s.store.open!.key!;
    expect(exploreReducer(s, { type: "select", record: b, stamp: at(), keepPanel: true })).toMatchObject({
      info: true,
      layer: null,
    });
    const other = run(
      [{ type: "close" }, { type: "select", record: b, stamp: at() }, { type: "info", open: true }],
      s,
    );
    expect(exploreReducer(other, { type: "openSaved", key, keepPanel: true })).toMatchObject({ info: true });
    // Not docked (phones): switching closes it. Unselecting always does.
    expect(exploreReducer(other, { type: "openSaved", key })).toMatchObject({ info: false });
    expect(exploreReducer(other, { type: "close" })).toMatchObject({ info: false });
    // A panel that wasn't open stays closed.
    const shut = exploreReducer(other, { type: "info", open: false });
    expect(exploreReducer(shut, { type: "openSaved", key, keepPanel: true })).toMatchObject({ info: false });
  });

  it("taking a part out keeps the parcel built, with the rest; the last part can't be taken out", () => {
    const s = run(
      [
        { type: "layer", id: "part:1" },
        { type: "removePart", index: 1, stamp: at() },
      ],
      combined(),
    );
    expect(s.store.open?.pieces).toEqual([a]);
    expect(s.store.open?.key).not.toBeNull();
    expect(s.layer).toBeNull();
    expect(exploreReducer(s, { type: "removePart", index: 0, stamp: at() })).toBe(s);
  });

  it("the split can be switched to its other side, or removed", () => {
    const s = run([
      selectA(),
      { type: "startSplit" },
      { type: "splitTap", ll: [36.627, -81.354] },
      { type: "splitTap", ll: [36.631, -81.354] },
      { type: "keepPiece", side: -1, stamp: at() },
      { type: "keepSide", side: 1, stamp: at() },
    ]);
    expect(s.store.open?.split?.keep).toBe(1);
    expect(exploreReducer(s, { type: "removeSplit", stamp: at() }).store.open?.split).toBeNull();
  });

  it("removing the house clears its selection; hiding toggles and is saved with the parcel", () => {
    const s = run([selectA(), house(), { type: "layer", id: "house" }]);
    expect(exploreReducer(s, house(null))).toMatchObject({ layer: null });
    const hid = exploreReducer(s, { type: "toggleHidden", id: "house", stamp: at() });
    expect(hid.store.open?.hidden).toEqual(["house"]);
    expect(hid.store.built[0]?.hidden).toEqual(["house"]);
    expect(
      exploreReducer(hid, { type: "toggleHidden", id: "house", stamp: at() }).store.open?.hidden,
    ).toEqual([]);
  });
});

describe("notes (13e-5)", () => {
  it("a first note builds a plain parcel without changing which parcel is open (serial)", () => {
    const plain = run([selectA()]);
    const s = exploreReducer(plain, {
      type: "notes",
      text: "Creek on the north line",
      serial: plain.serial,
      stamp: at(),
    });
    expect(s.store.open).toMatchObject({ notes: "Creek on the north line" });
    expect(s.store.open?.notesAt).not.toBeNull();
    expect(s.store.open?.key).not.toBeNull();
    expect(s.store.built).toHaveLength(1);
    expect(s.serial).toBe(plain.serial);
  });

  it("a save for a parcel that's no longer open is dropped", () => {
    const first = run([selectA()]);
    const other = exploreReducer(first, { type: "select", record: b, stamp: at() });
    expect(other.serial).not.toBe(first.serial);
    expect(exploreReducer(other, { type: "notes", text: "late", serial: first.serial, stamp: at() })).toBe(
      other,
    );
  });

  it("clearing the notes keeps the parcel built, with no saved time", () => {
    const s = run([selectA()]);
    const noted = exploreReducer(s, { type: "notes", text: "x", serial: s.serial, stamp: at() });
    const cleared = exploreReducer(noted, { type: "notes", text: "", serial: s.serial, stamp: at() });
    expect(cleared.store.open).toMatchObject({ notes: "", notesAt: null });
    expect(cleared.store.built).toHaveLength(1);
  });

  it("serial: opening, closing or switching parcels bumps it; editing the open one doesn't", () => {
    const s = run([selectA()]);
    expect(run([house(), { type: "toggleHidden", id: "house", stamp: at() }], s).serial).toBe(s.serial);
    expect(exploreReducer(s, { type: "close" }).serial).toBe(s.serial + 1);
  });
});

describe("screens (14d)", () => {
  it("a finished screen is added to the parcel open when it started, which makes it built", () => {
    const s = run([selectA()]);
    const done = exploreReducer(s, { type: "screened", id: "scr-1", serial: s.serial, stamp: at() });
    expect(done.store.open?.screenIds).toEqual(["scr-1"]);
    expect(done.store.open?.key).not.toBeNull();
    expect(done.store.built).toHaveLength(1);
    // A re-assessed house is another screen; the same id twice is ignored.
    const again = exploreReducer(done, { type: "screened", id: "scr-2", serial: s.serial, stamp: at() });
    expect(again.store.open?.screenIds).toEqual(["scr-1", "scr-2"]);
    expect(exploreReducer(again, { type: "screened", id: "scr-2", serial: s.serial, stamp: at() })).toBe(
      again,
    );
  });

  it("a screen that finishes after another parcel opened is dropped, not misfiled", () => {
    const s = run([selectA()]);
    const other = exploreReducer(s, { type: "select", record: b, stamp: at() });
    expect(exploreReducer(other, { type: "screened", id: "late", serial: s.serial, stamp: at() })).toBe(
      other,
    );
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

  it("with a layer selected, the first tap only clears it", () => {
    const s = exploreReducer(built, { type: "layer", id: "house" });
    for (const hit of [none, { ...none, insideOpen: true }, { ...none, outline: b }])
      expect(decideTap(s, hit)).toEqual({ kind: "clearLayer" });
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

describe("import (16b)", () => {
  it("adds the parcels to History and leaves the open parcel, the tool and the panel alone", () => {
    const s = run([selectA(), house(), { type: "info", open: true }]);
    const extra = { ...s.store.open!, key: "imported", notes: "from a file" };
    const t = exploreReducer(s, { type: "imported", added: [extra] });
    expect(t.store.built.map((x) => x.key)).toEqual([s.store.open!.key, "imported"]);
    expect(t.store.open).toBe(s.store.open);
    expect([t.serial, t.info, t.mode]).toEqual([s.serial, s.info, s.mode]);
  });
});
