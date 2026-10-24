import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { ZACH } from "@/test/support/rubrics";
import type { ParcelRecord } from "@/lib/geo/parcels";
import type { LatLon } from "@/lib/geo/types";
import type { SplitCut } from "@/lib/geo/recipe";
import { plainParcel, type EasementType } from "@/lib/client/parcelStore";
import {
  decideTap,
  exploreReducer,
  INITIAL,
  panelView,
  type ExploreAction,
  type ExploreState,
  type Stamp,
} from "./exploreState";
import { lineLayer } from "./layers";
import { reportCard } from "@/lib/report/card";
import { drawnOf } from "@/lib/report/marks";
import { expectedOf } from "@/test/support/expected";

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
/** A parcel saved with a split before step 14 (the Split tool tries a scenario now): its kept side, read as before. */
const withOldSplit = (s: ExploreState, split: SplitCut): ExploreState => {
  const open = { ...s.store.open!, split, key: s.store.open!.key ?? "old" };
  return {
    ...s,
    store: { ...s.store, open, built: [...s.store.built.filter((x) => x.key !== open.key), open] },
  };
};
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

  it("a split (step 14) places a line, and Grade both pieces keeps it as a scenario: the boundary stays whole", () => {
    const line = { a: [36.627, -81.354] as LatLon, b: [36.631, -81.354] as LatLon };
    const placed = run([
      selectA(),
      { type: "startSplit" },
      { type: "splitTap", ll: line.a },
      { type: "splitTap", ll: line.b },
    ]);
    // With the line placed, a tap changes nothing: its ends are dragged, and Grade both pieces takes it.
    expect(placed.mode).toBe("split");
    expect(placed.split).toEqual(line);
    expect(exploreReducer(placed, { type: "splitTap", ll: [36.629, -81.355] })).toBe(placed);
    const s = exploreReducer(placed, { type: "placeScenario", id: "sc1", stamp: at() });
    expect(s).toMatchObject({ mode: null, split: null, uses: true, info: false });
    expect(s.store.open?.split).toBeNull();
    expect(s.store.open?.scenarios).toEqual([
      { id: "sc1", name: "Split 1", ...line, screens: { left: null, right: null }, at: expect.any(String) },
    ]);
    expect(s.store.built).toHaveLength(1); // a split tried builds the parcel
    expect(s.gradeScenario).toEqual({ id: "sc1", sides: ["left", "right"], serial: s.serial });
  });

  it("combining starts from the open parcel's pieces and saves the new pieces, keeping the split", () => {
    const split = withOldSplit(run([selectA()]), { a: [36.627, -81.354], b: [36.631, -81.354], keep: 1 });
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

  it("the parcel next door (step 12): a new parcel by its name, graded as it opens; this one stays as it was", () => {
    // Graded, so it's in History.
    const picked = run([selectA()]);
    const opened = exploreReducer(picked, { type: "screened", id: "s1", serial: picked.serial, stamp: at() });
    expect(opened.store.built).toHaveLength(1);
    const s = run(
      [
        { type: "startCombine", asNew: "Ferney + next door" },
        { type: "combineToggle", parcel: b },
        { type: "applyCombine", stamp: at() },
      ],
      opened,
    );
    expect(s.store.open).toMatchObject({ name: "Ferney + next door", pieces: [a, b] });
    expect(s.store.open?.key).not.toBe(opened.store.open?.key);
    expect(s.store.built.find((x) => x.key === opened.store.open?.key)?.pieces).toEqual([a]);
    expect(s.serial).toBe(opened.serial + 1);
    expect(s.gradeOnOpen).toBe(s.serial);
    expect(s).toMatchObject({ combine: null, combineAsNew: null, mode: null });
    expect(exploreReducer(s, { type: "gradedOnOpen" }).gradeOnOpen).toBeNull();
    // Cancelled: nothing made, and the next combination changes the open parcel as before.
    const cancelled = run([{ type: "startCombine", asNew: "x" }, { type: "combineCancel" }], opened);
    expect(cancelled.combineAsNew).toBeNull();
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

  it("a split saved before step 14 can be switched to its other side, or removed", () => {
    const saved = withOldSplit(run([selectA()]), { a: [36.627, -81.354], b: [36.631, -81.354], keep: -1 });
    const s = exploreReducer(saved, { type: "keepSide", side: 1, stamp: at() });
    expect(s.store.open?.split?.keep).toBe(1);
    expect(exploreReducer(s, { type: "removeSplit", stamp: at() }).store.open?.split).toBeNull();
    // The Split tool doesn't move it: it starts a new line for a scenario.
    expect(exploreReducer(s, { type: "startSplit" })).toMatchObject({ split: null, scenarioLine: null });
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

  it("the asking price (owner, #101): saved with its entry date, builds the parcel; cleared, no date", () => {
    const s = run([selectA()]);
    const priced = exploreReducer(s, { type: "askingPrice", price: 185_000, serial: s.serial, stamp: at() });
    expect(priced.store.open).toMatchObject({ askingPrice: 185_000 });
    expect(priced.store.open?.askingPriceAt).not.toBeNull();
    expect(priced.store.built).toHaveLength(1);
    const cleared = exploreReducer(priced, {
      type: "askingPrice",
      price: null,
      serial: s.serial,
      stamp: at(),
    });
    expect(cleared.store.open).toMatchObject({ askingPrice: null, askingPriceAt: null });
    // A save after another parcel opened is dropped, as notes are.
    const other = exploreReducer(s, { type: "select", record: b, stamp: at() });
    expect(exploreReducer(other, { type: "askingPrice", price: 1, serial: s.serial, stamp: at() })).toBe(
      other,
    );
  });

  it("the listing's facts (WF1): saved, and the parcel built; an edit that changes nothing, or late, saves nothing", () => {
    const s = run([selectA()]);
    const facts = {
      name: "Ferney Creek 43 ac",
      listingUrl: "https://www.redfin.com/VA/Floyd/0-Ferney-Creek-Rd-24091/home/1",
      listingAcres: 52,
      agent: "A. Agent, 540-555-0100",
    };
    const named = exploreReducer(s, { type: "listing", patch: facts, serial: s.serial, stamp: at() });
    expect(named.store.open).toMatchObject(facts);
    expect(named.store.built).toHaveLength(1);
    expect(named.store.built[0]).toMatchObject(facts);
    expect(
      exploreReducer(named, { type: "listing", patch: { name: facts.name }, serial: s.serial, stamp: at() }),
    ).toBe(named);
    const other = exploreReducer(named, { type: "select", record: b, stamp: at() });
    expect(
      exploreReducer(other, { type: "listing", patch: { name: "late" }, serial: s.serial, stamp: at() }),
    ).toBe(other);
    // Each field alone: a name only builds the parcel too.
    const justAName = exploreReducer(s, {
      type: "listing",
      patch: { name: "X" },
      serial: s.serial,
      stamp: at(),
    });
    expect(justAName.store.built).toHaveLength(1);
  });

  it("the status (WF2, step 8): starred; archived with a reason (blank or 'Rejected:' alone refused); restored to the favorites; unstarred", () => {
    const s = run([selectA()]);
    const go = (st: ExploreState, a: ExploreAction) => exploreReducer(st, a);
    const saved = go(s, { type: "star", name: " The bench ", serial: s.serial, stamp: at() });
    expect(saved.store.open).toMatchObject({ status: "saved", archived: null, name: "The bench" });
    expect(saved.store.built).toHaveLength(1); // starring builds the parcel
    for (const reason of ["", "   ", "Rejected: ", "rejected"])
      expect(go(saved, { type: "archive", reason, serial: s.serial, stamp: at() }), reason).toBe(saved);
    const archived = go(saved, {
      type: "archive",
      reason: "  Rejected: no winter sun ",
      serial: s.serial,
      stamp: at(),
    });
    expect(archived.store.open).toMatchObject({
      status: "archived",
      archived: { reason: "Rejected: no winter sun", from: "saved" },
    });
    expect(archived.store.open!.archived!.at).toMatch(/^2026-/);
    // Archived: archiving again does nothing.
    expect(go(archived, { type: "archive", reason: "Sold", serial: s.serial, stamp: at() })).toBe(archived);
    const restored = go(archived, { type: "restore", serial: s.serial, stamp: at() });
    expect(restored.store.open).toMatchObject({ status: "saved", archived: null });
    // Unstarred, archived or not: back to History, still built.
    const unstarred = go(archived, { type: "unstar", serial: s.serial, stamp: at() });
    expect(unstarred.store.open).toMatchObject({ status: "inProgress", archived: null });
    expect(unstarred.store.built).toHaveLength(1);
    // Late, from another parcel: dropped.
    const other = go(s, { type: "select", record: b, stamp: at() });
    expect(go(other, { type: "star", name: "x", serial: s.serial, stamp: at() })).toBe(other);
  });

  it("milestones (WF2): a date each, changed or cleared; the same date again saves nothing", () => {
    const s = run([selectA()]);
    const walked = exploreReducer(s, {
      type: "milestone",
      which: "walked",
      date: "2026-10-20",
      serial: s.serial,
      stamp: at(),
    });
    expect(walked.store.open!.milestones).toEqual({ walked: "2026-10-20", offered: null });
    expect(walked.store.built).toHaveLength(1);
    expect(
      exploreReducer(walked, {
        type: "milestone",
        which: "walked",
        date: "2026-10-20",
        serial: s.serial,
        stamp: at(),
      }),
    ).toBe(walked);
    const cleared = exploreReducer(walked, {
      type: "milestone",
      which: "walked",
      date: null,
      serial: s.serial,
      stamp: at(),
    });
    expect(cleared.store.open!.milestones).toEqual({ walked: null, offered: null });
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

  it("tapping the open parcel, or empty map, does nothing: ×, Esc or another parcel close it (17e)", () => {
    for (const s of [plain, built]) {
      expect(decideTap(s, { ...none, insideOpen: true, outline: a })).toEqual({ kind: "none" });
      expect(decideTap(s, none)).toEqual({ kind: "none" });
    }
  });

  it("with a layer selected, the first tap only clears it", () => {
    const s = exploreReducer(built, { type: "layer", id: "house" });
    for (const hit of [none, { ...none, insideOpen: true }, { ...none, outline: b }])
      expect(decideTap(s, hit)).toEqual({ kind: "clearLayer" });
  });

  it("another parcel switches at once, plain or built (17e); not while a screen runs", () => {
    expect(decideTap(plain, { ...none, outline: b })).toEqual({ kind: "select", record: b });
    expect(decideTap(built, { ...none, outline: b })).toEqual({ kind: "select", record: b });
    expect(decideTap(built, { ...none, outline: b }, true)).toEqual({ kind: "busy" });
    expect(decideTap(built, { ...none, savedKey: "other" }, true)).toEqual({ kind: "busy" });
    // Busy changes nothing that isn't a switch.
    expect(decideTap(built, none, true)).toEqual({ kind: "none" });
    expect(decideTap(INITIAL, { ...none, outline: b }, true)).toEqual({ kind: "select", record: b });
    const plainWithSaved = run([selectA()], withSaved);
    expect(decideTap(plainWithSaved, { ...none, outline: b, savedKey: builtKey })).toEqual({
      kind: "openSaved",
      key: builtKey,
    });
  });
});

describe("panels (17e; step 8b): Map layers beside the parcel panel's Details", () => {
  it("Map layers opens and closes on its own; Details and its open row stay", () => {
    const s = run([selectA(), { type: "info", open: true }, { type: "layer", id: "house" }]);
    const m = exploreReducer(s, { type: "mapPanel", open: true });
    expect([m.mapPanel, m.info, m.layer]).toEqual([true, true, "house"]);
    const l = exploreReducer(m, { type: "layer", id: null });
    expect([l.mapPanel, l.info, l.layer]).toEqual([true, true, null]);
    // Grade (info off) closes the open row; Map layers stays.
    const g = exploreReducer(m, { type: "info", open: false });
    expect([g.mapPanel, g.info, g.layer]).toEqual([true, false, null]);
    expect(exploreReducer(m, { type: "mapPanel", open: false })).toMatchObject({
      mapPanel: false,
      info: true,
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

describe("adopting what another page wrote (step 4b: the map stays mounted behind the tabs)", () => {
  it("the same parcel open: its data changes, the tool and the panel stay", () => {
    const s = run([selectA(), house(), { type: "info", open: true }]);
    const renamed = { ...s.store.open!, name: "Renamed on Your list" };
    const t = exploreReducer(s, {
      type: "adopt",
      store: {
        ...s.store,
        open: renamed,
        built: s.store.built.map((b) => (b.key === renamed.key ? renamed : b)),
      },
    });
    expect(t.store.open!.name).toBe("Renamed on Your list");
    expect([t.serial, t.info, t.mode]).toEqual([s.serial, s.info, s.mode]);
  });

  it("another parcel open, or none: as a switch, the tool and the panel closed", () => {
    const s = run([selectA(), house(), { type: "info", open: true }]);
    const t = exploreReducer(s, { type: "adopt", store: { ...s.store, open: null } });
    expect(t.store.open).toBeNull();
    expect([t.serial, t.info, t.mode]).toEqual([s.serial + 1, false, null]);
  });
});

describe("drawn lines (follow-up 34)", () => {
  const draw = (kind: "track" | "easement", pts: LatLon[]): ExploreAction[] => [
    { type: "startLine", kind },
    ...pts.map((ll): ExploreAction => ({ type: "draftAdd", ll })),
    { type: "finishLine", id: `line-${kind}`, stamp: at() },
  ];

  it("a line needs a parcel open, and at least two different points", () => {
    expect(run([{ type: "startLine", kind: "track" }]).mode).toBeNull();
    const one = run([selectA(), ...draw("track", [[36.629, -81.354]])]);
    expect(one.store.open!.markup).toEqual([]);
    // A double-click to finish also taps twice: the repeat isn't a second point.
    const twice = run([
      selectA(),
      ...draw("track", [
        [36.629, -81.354],
        [36.629, -81.354],
      ]),
    ]);
    expect(twice.store.open!.markup).toEqual([]);
  });

  it("finishing keeps the line with the parcel, which makes it built; an easement gets the default width", () => {
    const s = run([
      selectA(),
      ...draw("track", [
        [36.629, -81.354],
        [36.6295, -81.3535],
        [36.6295, -81.3535],
      ]),
      ...draw("easement", [
        [36.628, -81.356],
        [36.6285, -81.3555],
      ]),
    ]);
    expect(s.mode).toBeNull();
    expect(s.draft).toEqual([]);
    expect(s.store.open!.markup).toMatchObject([
      {
        id: "line-track",
        kind: "track",
        widthFt: 10, // owner, #127: every kind has a width; not used in costs yet but an easement's
        note: "",
        line: [
          [36.629, -81.354],
          [36.6295, -81.3535],
        ],
      },
      { id: "line-easement", kind: "easement", widthFt: 30 },
    ]);
    expect(s.store.open!.key).not.toBeNull();
    expect(s.store.built).toHaveLength(1);
  });

  it("a note, a width and a removal; an edit after another parcel opened is dropped", () => {
    const s = run([
      selectA(),
      ...draw("easement", [
        [36.628, -81.356],
        [36.6285, -81.3555],
      ]),
    ]);
    const noted = exploreReducer(s, {
      type: "markupNote",
      id: "line-easement",
      note: "Deed book 412, p. 88",
      serial: s.serial,
      stamp: at(),
    });
    const wide = exploreReducer(noted, {
      type: "markupWidth",
      id: "line-easement",
      widthFt: 50,
      serial: s.serial,
      stamp: at(),
    });
    expect(wide.store.open!.markup[0]).toMatchObject({ note: "Deed book 412, p. 88", widthFt: 50 });
    expect(
      exploreReducer(wide, {
        type: "markupNote",
        id: "line-easement",
        note: "late",
        serial: s.serial - 1,
        stamp: at(),
      }),
    ).toBe(wide);
    const gone = exploreReducer(wide, {
      type: "markupDelete",
      id: "line-easement",
      serial: s.serial,
      stamp: at(),
    });
    expect(gone.store.open!.markup).toEqual([]);
  });
});

describe("a drawn line's layer, kind, condition, width, path and undo (owner, A; #127)", () => {
  const two: LatLon[] = [
    [36.629, -81.354],
    [36.6295, -81.3535],
  ];
  const withTrack = () =>
    run([
      selectA(),
      { type: "startLine", kind: "track" },
      ...two.map((ll): ExploreAction => ({ type: "draftAdd", ll })),
      { type: "finishLine", id: "t", stamp: at() },
    ]);

  it("a new line gets its kind's condition: a track pioneer, an easement uncleared", () => {
    expect(withTrack().store.open!.markup[0]).toMatchObject({ kind: "track", condition: "pioneer" });
  });

  it("names: numbered per kind; renamed (a blank name is ignored); a new kind renumbers a default name only", () => {
    const more = (s: ExploreState, kind: "track" | "easement", id: string) =>
      run(
        [
          { type: "startLine", kind },
          ...two.map((ll): ExploreAction => ({ type: "draftAdd", ll })),
          { type: "finishLine", id, stamp: at() },
        ],
        s,
      );
    const s = more(more(withTrack(), "track", "t2"), "easement", "e");
    expect(s.store.open!.markup.map((m) => m.name)).toEqual(["Track 1", "Track 2", "Easement 1"]);
    const name = (st: ExploreState, id: string, n: string) =>
      exploreReducer(st, { type: "markupName", id, name: n, serial: st.serial, stamp: at() });
    const kind = (st: ExploreState, id: string, k: "track" | "easement" | "drive") =>
      exploreReducer(st, { type: "markupKind", id, kind: k, serial: st.serial, stamp: at() });
    const renamed = name(s, "t", "  Logging road ");
    expect(renamed.store.open!.markup[0]!.name).toBe("Logging road");
    expect(name(renamed, "t", "   ")).toBe(renamed);
    // A default name follows the kind; a typed one stays. The numbers count up past the highest in use.
    expect(kind(s, "t2", "drive").store.open!.markup[1]!.name).toBe("Existing drive 1");
    expect(kind(s, "t", "easement").store.open!.markup[0]!.name).toBe("Easement 2");
    expect(kind(renamed, "t", "drive").store.open!.markup[0]!.name).toBe("Logging road");
    // The note is separate.
    expect(renamed.store.open!.markup[0]!.note).toBe("");
  });

  it("a line is a layer: selecting it opens the Info panel; deleting it clears the selection", () => {
    const s = withTrack();
    const p = exploreReducer(s, { type: "layer", id: lineLayer("t") });
    expect([p.layer, p.info]).toEqual(["line:t", true]);
    expect(exploreReducer(p, { type: "close" }).layer).toBeNull();
    const gone = exploreReducer(p, { type: "markupDelete", id: "t", serial: p.serial, stamp: at() });
    expect(gone.layer).toBeNull();
    // Another layer stays selected when a line goes.
    const house = exploreReducer(s, { type: "layer", id: "house" });
    expect(
      exploreReducer(house, { type: "markupDelete", id: "t", serial: s.serial, stamp: at() }).layer,
    ).toBe("house");
  });

  it("a new kind brings its own width and condition, unless the user chose them", () => {
    const s = withTrack();
    const k = (st: typeof s, kind: "track" | "easement" | "drive") =>
      exploreReducer(st, { type: "markupKind", id: "t", kind, serial: st.serial, stamp: at() });
    const drive = k(s, "drive");
    expect(drive.store.open!.markup[0]).toMatchObject({
      kind: "drive",
      condition: "improved",
      widthFt: 12,
    });
    const easement = k(drive, "easement");
    expect(easement.store.open!.markup[0]).toMatchObject({
      kind: "easement",
      condition: "uncleared",
      widthFt: 30,
    });
    const paved = exploreReducer(easement, {
      type: "markupCondition",
      id: "t",
      condition: "paved",
      serial: easement.serial,
      stamp: at(),
    });
    // Chosen, so kept through a change of kind; the width too.
    const wide = exploreReducer(paved, {
      type: "markupWidth",
      id: "t",
      widthFt: 40,
      serial: paved.serial,
      stamp: at(),
    });
    expect(k(wide, "track").store.open!.markup[0]).toMatchObject({
      kind: "track",
      condition: "paved",
      widthFt: 40,
    });
    expect(k(paved, "track").store.open!.markup[0]).toMatchObject({ widthFt: 10 });
  });

  it("Edit redraws the path: the line tool opens with its points; Finish keeps its id, kind, note and condition", () => {
    const s = exploreReducer(
      exploreReducer(withTrack(), { type: "markupNote", id: "t", note: "seen", serial: 0, stamp: at() }),
      { type: "markupCondition", id: "t", condition: "improved", serial: 0, stamp: at() },
    );
    const noted = exploreReducer(s, {
      type: "markupNote",
      id: "t",
      note: "seen",
      serial: s.serial,
      stamp: at(),
    });
    const e = exploreReducer(exploreReducer(noted, { type: "layer", id: lineLayer("t") }), {
      type: "editLine",
      id: "t",
    });
    expect([e.mode, e.editing, e.draft, e.layer]).toEqual(["track", "t", two, null]);
    const longer = exploreReducer(exploreReducer(e, { type: "draftAdd", ll: [36.63, -81.353] }), {
      type: "finishLine",
      id: "ignored",
      stamp: at(),
    });
    expect(longer.store.open!.markup).toHaveLength(1);
    expect(longer.store.open!.markup[0]).toMatchObject({
      id: "t",
      note: "seen",
      line: [...two, [36.63, -81.353]],
    });
    // Back to its details in Layers.
    expect([longer.mode, longer.editing, longer.layer, longer.info]).toEqual([null, null, "line:t", true]);
    // Cancelled: nothing changes, and its details come back.
    const cancelled = exploreReducer(e, { type: "draftCancel" });
    expect(cancelled.store).toBe(e.store);
    expect([cancelled.mode, cancelled.layer]).toEqual([null, "line:t"]);
  });

  it("Undo puts a deleted line back where it was, only on the same parcel and only once", () => {
    const s = withTrack();
    const m = s.store.open!.markup[0]!;
    const gone = exploreReducer(s, { type: "markupDelete", id: "t", serial: s.serial, stamp: at() });
    const back = exploreReducer(gone, {
      type: "markupRestore",
      markup: m,
      index: 0,
      serial: s.serial,
      stamp: at(),
    });
    expect(back.store.open!.markup).toEqual([m]);
    expect(
      exploreReducer(back, { type: "markupRestore", markup: m, index: 0, serial: s.serial, stamp: at() }),
    ).toBe(back);
    expect(
      exploreReducer(gone, { type: "markupRestore", markup: m, index: 0, serial: s.serial + 1, stamp: at() }),
    ).toBe(gone);
  });
});

describe("point and area markers (WF4)", () => {
  const spot: LatLon = [36.629, -81.354];
  const corners: LatLon[] = [
    [36.6285, -81.3545],
    [36.6285, -81.354],
    [36.629, -81.354],
  ];
  const withSpring = () =>
    run([
      selectA(),
      { type: "startMark", kind: null, shape: "point" },
      { type: "startMark", kind: "spring", shape: "point" },
      { type: "placePoint", id: "s", ll: spot, stamp: at() },
    ]);

  it("a point: the kind first, then one tap; named per kind, its details open, the tool done", () => {
    // No kind yet: a tap places nothing.
    const none = run([selectA(), { type: "startMark", kind: null, shape: "point" }]);
    expect(exploreReducer(none, { type: "placePoint", id: "x", ll: spot, stamp: at() })).toBe(none);
    const s = withSpring();
    expect(s.store.open!.markup).toEqual([
      expect.objectContaining({
        id: "s",
        shape: "point",
        kind: "spring",
        name: "Spring 1",
        ll: spot,
        septicClass: null,
      }),
    ]);
    expect([s.mode, s.markKind, s.layer, s.info]).toEqual([null, null, lineLayer("s"), true]);
    // Built, so kept in History.
    expect(s.store.built[0]!.markup).toHaveLength(1);
  });

  it("an area: three corners or more, then Finish; redrawn, it keeps its name and note", () => {
    const start = run([selectA(), { type: "startMark", kind: "clearing", shape: "area" }]);
    expect(start.mode).toBe("area");
    const two = run(
      corners.slice(0, 2).map((ll): ExploreAction => ({ type: "draftAdd", ll })),
      start,
    );
    expect(exploreReducer(two, { type: "finishArea", id: "c", stamp: at() })).toBe(two);
    const s = run(
      [
        { type: "draftAdd", ll: corners[2]! },
        { type: "finishArea", id: "c", stamp: at() },
      ],
      two,
    );
    expect(s.store.open!.markup[0]).toMatchObject({
      shape: "area",
      kind: "clearing",
      name: "Clearing 1",
      ring: corners,
    });
    const noted = exploreReducer(s, {
      type: "markupNote",
      id: "c",
      note: "cut in 2019",
      serial: s.serial,
      stamp: at(),
    });
    const redrawing = exploreReducer(noted, { type: "editLine", id: "c" });
    expect([redrawing.mode, redrawing.markKind, redrawing.draft, redrawing.editing]).toEqual([
      "area",
      "clearing",
      corners,
      "c",
    ]);
    const bigger: LatLon = [36.629, -81.3545];
    const redrawn = run(
      [
        { type: "draftAdd", ll: bigger },
        { type: "finishArea", id: "unused", stamp: at() },
      ],
      redrawing,
    );
    expect(redrawn.store.open!.markup).toEqual([
      expect.objectContaining({
        id: "c",
        name: "Clearing 1",
        note: "cut in 2019",
        ring: [...corners, bigger],
      }),
    ]);
  });

  it("a point moves by a drag, or by Move it and a tap", () => {
    const s = withSpring();
    const to: LatLon = [36.6292, -81.3538];
    const dragged = exploreReducer(s, { type: "movePoint", id: "s", ll: to, serial: s.serial, stamp: at() });
    expect(dragged.store.open!.markup[0]).toMatchObject({ ll: to });
    // A drag for a parcel no longer open is dropped.
    expect(exploreReducer(s, { type: "movePoint", id: "s", ll: to, serial: s.serial + 1, stamp: at() })).toBe(
      s,
    );
    const moving = exploreReducer(s, { type: "editLine", id: "s" });
    expect([moving.mode, moving.markKind, moving.editing]).toEqual(["point", "spring", "s"]);
    const moved = exploreReducer(moving, { type: "placePoint", id: "unused", ll: to, stamp: at() });
    expect(moved.store.open!.markup).toEqual([
      expect.objectContaining({ id: "s", name: "Spring 1", ll: to }),
    ]);
  });

  it("another kind of its shape (the default name follows); a class on a septic permit only, optional", () => {
    const s = withSpring();
    const kind = (st: ExploreState, k: "septic" | "clearing" | "track" | "well") =>
      exploreReducer(st, { type: "markupKind", id: "s", kind: k, serial: st.serial, stamp: at() });
    const septicClass = (st: ExploreState, c: "conventional" | null) =>
      exploreReducer(st, { type: "markupSeptic", id: "s", septicClass: c, serial: st.serial, stamp: at() });
    // A spring isn't a permit: no class.
    expect(septicClass(s, "conventional")).toBe(s);
    const permit = septicClass(kind(s, "septic"), "conventional");
    expect(permit.store.open!.markup[0]).toMatchObject({
      kind: "septic",
      name: "Septic permit 1",
      septicClass: "conventional",
    });
    expect(septicClass(permit, null).store.open!.markup[0]).toMatchObject({ septicClass: null });
    // A point can't become an area's kind or a line's; another point kind drops the class.
    expect(kind(permit, "clearing")).toBe(permit);
    expect(kind(permit, "track")).toBe(permit);
    expect(kind(permit, "well").store.open!.markup[0]).toMatchObject({
      kind: "well",
      name: "Well 1",
      septicClass: null,
    });
  });

  it("deleting a septic permit brings back the Septic warn and its 'Check first' line (owner, WF4 review)", () => {
    // Ferney, its road in taken as its own drive (as card.test's ferney()), with every soil very limited: the septic
    // warn is the card's only warn, so its reason line quotes it.
    const r = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
    const d = r.driveway!;
    const e = d.entrances[d.routes[0]!.entranceIndex]!;
    e.roadClass = { ...e.roadClass!, osm: { ...e.roadClass!.osm!, outsideFt: 0 } };
    for (const rt of d.routes) rt.metrics.privateFt = 0;
    r.soils = r.soils!.map((x) => ({ ...x, septic: "Very limited" }));
    const CHECK_FIRST =
      "Check first: no soil on the parcel rates better than very limited for a septic field";
    const card = (st: ExploreState) => reportCard(r, ZACH, drawnOf(st.store.open!.markup));
    const septic = (st: ExploreState) => card(st).gates.find((g) => g.key === "septic")!;

    const plain = run([selectA()]);
    expect(septic(plain).status).toBe("warn");
    expect(card(plain).reason).toContain(CHECK_FIRST);

    const marked = run(
      [
        { type: "startMark", kind: "septic", shape: "point" },
        { type: "placePoint", id: "p", ll: r.sites![0]!.ll, stamp: at() },
      ],
      plain,
    );
    expect(septic(marked).status).toBe("pass");
    expect(card(marked).reason).not.toContain(CHECK_FIRST);

    const deleted = exploreReducer(marked, {
      type: "markupDelete",
      id: "p",
      serial: marked.serial,
      stamp: at(),
    });
    expect(septic(deleted)).toEqual(septic(plain));
    expect(card(deleted).reason).toBe(card(plain).reason);
  });
});

describe("the Mark picker's tools (owner, after #136)", () => {
  const corners: LatLon[] = [
    [36.6285, -81.3545],
    [36.6285, -81.354],
    [36.629, -81.354],
  ];
  const septic = (taps: LatLon[]) =>
    run([
      selectA(),
      { type: "startMark", kind: "septic", shape: "area" },
      ...taps.map((ll): ExploreAction => ({ type: "draftAdd", ll })),
      { type: "finishArea", id: "p", stamp: at() },
    ]);

  it("a septic permit: one tap is its point; three or more its field; two aren't either", () => {
    expect(septic(corners.slice(0, 1)).store.open!.markup).toEqual([
      expect.objectContaining({
        id: "p",
        shape: "point",
        kind: "septic",
        name: "Septic permit 1",
        ll: corners[0],
      }),
    ]);
    expect(septic(corners).store.open!.markup).toEqual([
      expect.objectContaining({
        id: "p",
        shape: "area",
        kind: "septic",
        name: "Septic permit 1",
        ring: corners,
      }),
    ]);
    const two = septic(corners.slice(0, 2));
    expect(two.store.open!.markup).toEqual([]);
    expect(two.mode).toBe("area");
  });

  it("an existing drive is drawn as its own kind", () => {
    const s = run([
      selectA(),
      { type: "startLine", kind: "drive" },
      { type: "draftAdd", ll: corners[0]! },
      { type: "draftAdd", ll: corners[2]! },
      { type: "finishLine", id: "d", stamp: at() },
    ]);
    expect(s.store.open!.markup[0]).toMatchObject({
      shape: "line",
      kind: "drive",
      name: "Existing drive 1",
      condition: "improved",
      widthFt: 12,
    });
    // Its Edit redraws it as a drive.
    expect(exploreReducer(s, { type: "editLine", id: "d" }).mode).toBe("drive");
  });
});

describe("WF5: a line as the driveway, and where an easement is recorded", () => {
  const two: LatLon[] = [
    [36.629, -81.354],
    [36.6295, -81.3535],
  ];
  const withEasement = () =>
    run([
      selectA(),
      { type: "startLine", kind: "easement" },
      ...two.map((ll): ExploreAction => ({ type: "draftAdd", ll })),
      { type: "finishLine", id: "e", stamp: at() },
    ]);

  it("chosen, and the app's pick again; only a line of the parcel, for the parcel open", () => {
    const s = withEasement();
    expect(s.store.open!.drivewayLine).toBeNull();
    const chosen = exploreReducer(s, { type: "drivewayLine", line: "e", serial: s.serial, stamp: at() });
    expect(chosen.store.open!.drivewayLine).toBe("e");
    expect(chosen.store.built[0]!.drivewayLine).toBe("e");
    expect(
      exploreReducer(chosen, { type: "drivewayLine", line: null, serial: s.serial, stamp: at() }).store.open!
        .drivewayLine,
    ).toBeNull();
    // Not one of its lines, or another parcel's choice: nothing.
    expect(exploreReducer(s, { type: "drivewayLine", line: "nope", serial: s.serial, stamp: at() })).toBe(s);
    expect(exploreReducer(s, { type: "drivewayLine", line: "e", serial: s.serial + 1, stamp: at() })).toBe(s);
  });

  it("deleting the chosen line returns to the app's pick; Undo restores both", () => {
    const base = withEasement();
    const chosen = exploreReducer(base, {
      type: "drivewayLine",
      line: "e",
      serial: base.serial,
      stamp: at(),
    });
    const line = chosen.store.open!.markup[0]!;
    const gone = exploreReducer(chosen, {
      type: "markupDelete",
      id: "e",
      serial: chosen.serial,
      stamp: at(),
    });
    expect(gone.store.open!.drivewayLine).toBeNull();
    const back = exploreReducer(gone, {
      type: "markupRestore",
      markup: line,
      index: 0,
      driveway: true,
      serial: chosen.serial,
      stamp: at(),
    });
    expect(back.store.open!.markup).toEqual([line]);
    expect(back.store.open!.drivewayLine).toBe("e");
  });

  it("Recorded in: kept trimmed; blank clears it; only on a line", () => {
    const s = withEasement();
    const rec = (st: ExploreState, text: string) =>
      exploreReducer(st, {
        type: "markupRecorded",
        id: "e",
        recordedIn: text,
        serial: st.serial,
        stamp: at(),
      });
    expect(s.store.open!.markup[0]).toMatchObject({ recordedIn: "" });
    const typed = rec(s, "  Ashe Co. Plat Bk 574 Pg 1132 ");
    expect(typed.store.open!.markup[0]).toMatchObject({ recordedIn: "Ashe Co. Plat Bk 574 Pg 1132" });
    expect(rec(typed, "Ashe Co. Plat Bk 574 Pg 1132")).toBe(typed);
    expect(rec(typed, "   ").store.open!.markup[0]).toMatchObject({ recordedIn: "" });
  });

  it("What it's for (step 14): set, changed, cleared; the same choice saves nothing", () => {
    const s = withEasement();
    const set = (st: ExploreState, easementType: EasementType | null) =>
      exploreReducer(st, {
        type: "markupEasementType",
        id: "e",
        easementType,
        serial: st.serial,
        stamp: at(),
      });
    const row = set(s, "row");
    expect(row.store.open!.markup[0]).toMatchObject({ easementType: "row" });
    expect(set(row, "row")).toBe(row);
    expect(set(row, "utility").store.open!.markup[0]).toMatchObject({ easementType: "utility" });
    expect(set(row, null).store.open!.markup[0]).toMatchObject({ easementType: null });
    // Unset is the same as cleared.
    expect(set(s, null)).toBe(s);
    // Another parcel's edit is dropped.
    expect(
      exploreReducer(row, {
        type: "markupEasementType",
        id: "e",
        easementType: "scenic",
        serial: row.serial + 1,
        stamp: at(),
      }),
    ).toBe(row);
  });
});

describe("the panel's segments (step 14: Grade | Uses | Details)", () => {
  it("Uses, then Details over it, then Grade; each parcel opens without Uses", () => {
    const s = run([selectA()]);
    expect(panelView(s)).toBe("grade");
    const uses = exploreReducer(s, { type: "uses", open: true });
    expect(panelView(uses)).toBe("uses");
    // A line or mark selected opens Details whatever the segment.
    const details = exploreReducer(uses, { type: "layer", id: "part:0" });
    expect(panelView(details)).toBe("details");
    expect(panelView(exploreReducer(details, { type: "uses", open: true }))).toBe("uses");
    expect(exploreReducer(details, { type: "uses", open: true }).layer).toBeNull();
    expect(panelView(exploreReducer(uses, { type: "info", open: false }))).toBe("grade");
    expect(panelView(exploreReducer(uses, { type: "uses", open: false }))).toBe("grade");
    for (const act of [
      { type: "close" },
      { type: "select", record: b, stamp: at(), keepPanel: true },
    ] as ExploreAction[])
      expect(exploreReducer(uses, act).uses).toBe(false);
  });
});

describe("split scenarios (step 14, plan §5)", () => {
  const line = { a: [36.627, -81.354] as LatLon, b: [36.631, -81.354] as LatLon };
  const placed = () =>
    run([
      selectA(),
      { type: "startSplit" },
      { type: "splitTap", ll: line.a },
      { type: "splitTap", ll: line.b },
      { type: "placeScenario", id: "sc1", stamp: at() },
    ]);

  it("the grading hook takes the request once; Try again asks for the pieces given", () => {
    const s = exploreReducer(placed(), { type: "scenarioGrading" });
    expect(s.gradeScenario).toBeNull();
    expect(exploreReducer(s, { type: "scenarioGrading" })).toBe(s);
    const again = exploreReducer(s, { type: "regradeScenario", id: "sc1", sides: ["right"] });
    expect(again.gradeScenario).toEqual({ id: "sc1", sides: ["right"], serial: s.serial });
    expect(exploreReducer(s, { type: "regradeScenario", id: "nope", sides: ["right"] })).toBe(s);
  });

  it("each piece's screen is kept under its scenario, not in the parcel's screens", () => {
    const s0 = placed();
    const s = exploreReducer(s0, {
      type: "pieceScreened",
      id: "sc1",
      side: "left",
      screenId: "scr-left",
      serial: s0.serial,
      stamp: at(),
    });
    expect(s.store.open?.scenarios[0]?.screens).toEqual({ left: "scr-left", right: null });
    expect(s.store.open?.screenIds).toEqual([]);
    expect(s.store.built[0]?.scenarios[0]?.screens.left).toBe("scr-left");
    // One that lands after another parcel opened is dropped.
    const other = exploreReducer(s0, { type: "select", record: b, stamp: at() });
    expect(
      exploreReducer(other, {
        type: "pieceScreened",
        id: "sc1",
        side: "right",
        screenId: "x",
        serial: s0.serial,
        stamp: at(),
      }),
    ).toBe(other);
  });

  it("Rename (a blank name is ignored), Remove scenario", () => {
    const s0 = placed();
    const named = exploreReducer(s0, {
      type: "scenarioName",
      id: "sc1",
      name: "  Sell the north  ",
      serial: s0.serial,
      stamp: at(),
    });
    expect(named.store.open?.scenarios[0]?.name).toBe("Sell the north");
    expect(
      exploreReducer(named, { type: "scenarioName", id: "sc1", name: " ", serial: s0.serial, stamp: at() }),
    ).toBe(named);
    const gone = exploreReducer(named, { type: "scenarioRemove", id: "sc1", serial: s0.serial, stamp: at() });
    expect(gone.store.open?.scenarios).toEqual([]);
  });

  it("Adjust the line starts from the scenario's line; Grade both pieces moves it and asks for both again", () => {
    const s0 = exploreReducer(placed(), {
      type: "pieceScreened",
      id: "sc1",
      side: "left",
      screenId: "scr-left",
      serial: placed().serial,
      stamp: at(),
    });
    const adjusting = exploreReducer(s0, { type: "startSplit", scenario: "sc1" });
    expect(adjusting).toMatchObject({ mode: "split", split: line, scenarioLine: "sc1" });
    const b2: LatLon = [36.631, -81.3535];
    const s = run(
      [
        { type: "splitMove", a: line.a, b: b2 },
        { type: "placeScenario", id: "unused", stamp: at() },
      ],
      adjusting,
    );
    expect(s.store.open?.scenarios).toHaveLength(1);
    expect(s.store.open?.scenarios[0]).toMatchObject({
      id: "sc1",
      a: line.a,
      b: b2,
      screens: { left: null, right: null },
    });
    expect(s.gradeScenario).toMatchObject({ id: "sc1", sides: ["left", "right"] });
    expect(s.scenarioLine).toBeNull();
    // Cancel leaves the scenario as it was.
    const cancelled = exploreReducer(adjusting, { type: "splitCancel" });
    expect(cancelled).toMatchObject({ mode: null, split: null, scenarioLine: null });
    expect(cancelled.store).toBe(s0.store);
  });

  it("a second scenario is Split 2", () => {
    const s = run(
      [
        { type: "startSplit" },
        { type: "splitTap", ll: line.a },
        { type: "splitTap", ll: [36.631, -81.3535] },
        { type: "placeScenario", id: "sc2", stamp: at() },
      ],
      placed(),
    );
    expect(s.store.open?.scenarios.map((x) => x.name)).toEqual(["Split 1", "Split 2"]);
  });

  it("Add this piece to the list opens the new parcel; graded as it opens only when the piece had no screen", () => {
    const s0 = placed();
    const piece = { ...plainParcel(a, "2026-10-24T00:00:00.000Z"), name: "Ferney, West piece" };
    const s = exploreReducer(s0, { type: "addPiece", parcel: piece, stamp: at() });
    expect(s.store.open).toMatchObject({ name: "Ferney, West piece" });
    expect(s.store.open?.key).not.toBe(s0.store.open?.key);
    expect(s.store.built).toHaveLength(2);
    expect(s.serial).toBe(s0.serial + 1);
    expect(s.gradeOnOpen).toBe(s.serial);
    const graded = exploreReducer(s0, {
      type: "addPiece",
      parcel: { ...piece, screenIds: ["p1"] },
      stamp: at(),
    });
    expect(graded.gradeOnOpen).toBeNull();
  });
});
