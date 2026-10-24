import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { drawnPart } from "@/lib/geo/recipe";
import {
  closeOpen,
  commitOpen,
  DEFAULT_CONDITION,
  DEFAULT_WIDTH_FT,
  drawnInput,
  EMPTY_STORE,
  fromV1,
  nameFromNotes,
  withNameFromNotes,
  isBuilt,
  KIND_NAME,
  linesOf,
  loadParcelStore,
  openBuilt,
  plainParcel,
  rankBuilt,
  readParcelStore,
  removeBuilt,
  writeParcelStore,
  type WorkingParcel,
} from "./parcelStore";
import { getPref, setPref, type KeyValueStore } from "./prefs";
import { libraryRow } from "./library";
import { statusLine } from "./parcelStatus";
import { byRank } from "./myOrder";

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
const county = (x0: number, id: string): ParcelRecord => ({
  geo: sq(x0),
  props: { PARCELID: id },
  source: "https://vginmaps.vdem.virginia.gov/x",
  multiPart: false,
});
const T0 = "2026-10-05T12:00:00.000Z",
  T1 = "2026-10-05T12:05:00.000Z";
const keys = () => {
  let n = 0;
  return () => `k${++n}`;
};
const plain = plainParcel(county(-81.355, "52-47A"), T0);

describe("built parcels", () => {
  it("a plain parcel straight from a tap isn't built; any change makes it built", () => {
    expect(isBuilt(null)).toBe(false);
    expect(isBuilt(plain)).toBe(false);
    const changed: [string, WorkingParcel][] = [
      ["two parts", { ...plain, pieces: [county(-81.355, "a"), county(-81.353, "b")] }],
      ["a drawn part", { ...plain, pieces: [drawnPart(sq(-81.355))] }],
      ["a split piece from 13d", { ...plain, pieces: [{ ...county(-81.355, "a"), source: "split" }] }],
      [
        "a split",
        {
          ...plain,
          split: { a: [36.62, -81.354], b: [36.64, -81.354], keep: 1 },
        },
      ],
      ["a house", { ...plain, house: [36.629, -81.354] }],
      ["notes", { ...plain, notes: "Ask about the spring." }],
      ["a name (WF1)", { ...plain, name: "Ferney Creek" }],
      ["a listing link", { ...plain, listingUrl: "https://x.test/l" }],
      ["listing acres", { ...plain, listingAcres: 52 }],
      ["an agent", { ...plain, agent: "A. Agent" }],
      ["deed restrictions (step 14)", { ...plain, deedRestrictions: "No mobile homes" }],
      ["an HOA known", { ...plain, hoa: "no" }],
      ["a status (WF2)", { ...plain, status: "saved" }],
      ["a milestone", { ...plain, milestones: { walked: "2026-10-20", offered: null } }],
      ["results", { ...plain, screenIds: ["screen-1"] }],
      ["a key (it was built before)", { ...plain, key: "k9" }],
    ];
    for (const [why, p] of changed) expect(isBuilt(p), why).toBe(true);
    expect(isBuilt({ ...plain, notes: "   " })).toBe(false);
    expect(isBuilt({ ...plain, name: " ", agent: "" })).toBe(false);
  });

  it("saving: a plain parcel stays out of History; a built one gets a key and an entry, updated in place", () => {
    const next = keys();
    const s1 = commitOpen(EMPTY_STORE, plain, T0, next);
    expect(s1.open?.key).toBeNull();
    expect(s1.built).toEqual([]);
    const s2 = commitOpen(s1, { ...s1.open!, house: [36.629, -81.354] }, T0, next);
    expect(s2.open?.key).toBe("k1");
    expect(s2.built.map((b) => b.key)).toEqual(["k1"]);
    const s3 = commitOpen(s2, { ...s2.open!, notes: "Spring by the barn." }, T1, next);
    expect(s3.built).toHaveLength(1);
    expect(s3.built[0]).toMatchObject({ key: "k1", notes: "Spring by the barn.", updatedAt: T1 });
  });

  it("closing keeps it in History; it reopens from there; removing it closes it", () => {
    const s = commitOpen(EMPTY_STORE, { ...plain, house: [36.629, -81.354] }, T0, keys());
    const closed = closeOpen(s);
    expect(closed.open).toBeNull();
    expect(closed.built).toHaveLength(1);
    expect(openBuilt(closed, "k1").open?.key).toBe("k1");
    expect(openBuilt(closed, "nope")).toBe(closed);
    const removed = removeBuilt(openBuilt(closed, "k1"), "k1");
    expect(removed).toEqual(EMPTY_STORE);
  });
});

describe("History keeps everything until it's removed", () => {
  it("nothing expires or is trimmed: 200 built parcels, opened, closed and edited, are all still there", () => {
    const next = keys();
    let s = EMPTY_STORE;
    for (let i = 0; i < 200; i++) {
      s = commitOpen(
        s,
        { ...plainParcel(county(-81.355 + i * 0.003, "p" + i), T0), house: [36.629, -81.354] },
        T0,
        next,
      );
      s = closeOpen(s);
    }
    s = commitOpen(openBuilt(s, "k1"), { ...openBuilt(s, "k1").open!, notes: "Still here." }, T1, next);
    s = closeOpen(s);
    expect(s.built).toHaveLength(200);
    expect(readParcelStore(writeParcelStore(s))?.built).toHaveLength(200);
    expect(removeBuilt(s, "k7").built).toHaveLength(199);
  });
});

describe("13d's v1 record converts", () => {
  it("a combination becomes its members, built, with the house", () => {
    const a = county(-81.355, "52-47A"),
      b = county(-81.353, "52-42A");
    const v1 = {
      parcel: { ...a, source: "combined", props: { parno: "52-47A + 52-42A" }, members: [a, b] },
      house: [36.629, -81.354] as [number, number],
    };
    const s = fromV1(v1, T0, keys());
    expect(s.open?.pieces.map((p) => p.props.PARCELID)).toEqual(["52-47A", "52-42A"]);
    expect(s.open?.house).toEqual([36.629, -81.354]);
    expect(s.built.map((x) => x.key)).toEqual(["k1"]);
  });

  it("a plain county parcel opens plain; a drawn one is built; nothing stays nothing", () => {
    const plainS = fromV1({ parcel: county(-81.355, "52-47A"), house: null }, T0, keys());
    expect(plainS.open?.key).toBeNull();
    expect(plainS.built).toEqual([]);
    expect(fromV1({ parcel: drawnPart(sq(-81.355)), house: null }, T0, keys()).built).toHaveLength(1);
    expect(fromV1({ parcel: null, house: null }, T0, keys())).toEqual(EMPTY_STORE);
  });

  it("the v2 store wins over v1; v1 is only read when there's no v2", () => {
    const v2 = commitOpen(EMPTY_STORE, plain, T0, keys());
    expect(loadParcelStore(v2, { parcel: county(-81.353, "x"), house: null }, T0, keys())).toBe(v2);
    expect(loadParcelStore(null, null, T0, keys())).toEqual(EMPTY_STORE);
  });
});

describe("storage (ps.parcels)", () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it("once per browser (owner, #133): an unnamed parcel takes its name from its notes' 'Name:' line on load", () => {
    const kv = memory();
    const notes = "Name: Ferney Creek, Floyd County VA, parcel 52-47A\n\nSpring on the north line.";
    const s = commitOpen(EMPTY_STORE, { ...plain, notes }, T0, keys());
    const named = { ...s.built[0]!, key: "named", name: "Kept as typed", notes };
    kv.setItem("ps.parcels", writeParcelStore({ ...s, built: [...s.built, named] }));
    const first = getPref("ps.parcels", kv)!;
    expect(first.built.map((b) => b.name)).toEqual([
      "Ferney Creek, Floyd County VA, parcel 52-47A",
      "Kept as typed", // a name already there is left alone
    ]);
    expect(first.open!.name).toBe("Ferney Creek, Floyd County VA, parcel 52-47A");
    expect(first.built[0]!.notes).toBe(notes); // the notes stay
    expect(getPref("ps.namesFromNotes", kv)).toBe(true);
    // Saved back: and a name cleared on purpose afterwards isn't filled again.
    expect(readParcelStore(kv.getItem("ps.parcels")!)!.built[0]!.name).toBe(first.built[0]!.name);
    setPref(
      "ps.parcels",
      { ...first, open: { ...first.open!, name: "" }, built: [{ ...first.built[0]!, name: "" }] },
      kv,
    );
    expect(getPref("ps.parcels", kv)!.built[0]!.name).toBe("");
  });

  it("the 'Name:' line in any case, with or without spaces; 60 characters at most (owner, #130, #133)", () => {
    expect(nameFromNotes("Name: Ferney Creek")).toBe("Ferney Creek");
    expect(nameFromNotes("name:Ferney Creek\nmore")).toBe("Ferney Creek");
    expect(nameFromNotes("  NAME :   Ferney Creek  ")).toBe("Ferney Creek");
    expect(nameFromNotes("Gate code 1234\nName: later")).toBe("Gate code 1234"); // only the first line
    expect(nameFromNotes(`Name: ${"A".repeat(61)}`)).toBe("");
    expect(nameFromNotes("")).toBe("");
    // On import and load only a "Name:" line names a parcel; a plain first line is for prototype imports (#130).
    expect(withNameFromNotes({ ...plain, notes: "Gate code 1234" }).name).toBe("");
    expect(withNameFromNotes({ ...plain, notes: "NAME: Ridge tract" }).name).toBe("Ridge tract");
  });

  it("round-trips through prefs", () => {
    const kv = memory();
    expect(getPref("ps.parcels", kv)).toBeNull();
    const s = commitOpen(EMPTY_STORE, { ...plain, house: [36.629, -81.354], notes: "Note" }, T0, keys());
    setPref("ps.parcels", s, kv);
    expect(getPref("ps.parcels", kv)).toEqual(s);
    expect(readParcelStore(writeParcelStore(s))).toEqual(s);
  });

  it("drops anything stale or malformed", () => {
    const good = JSON.parse(
      writeParcelStore(commitOpen(EMPTY_STORE, { ...plain, house: [36.6, -81.3] }, T0, keys())),
    );
    for (const bad of [
      { ...good, v: 3 },
      { ...good, built: [{ ...good.built[0], key: null }] }, // a History entry without a key
      { ...good, open: { ...good.open, pieces: [] } },
      { ...good, open: { ...good.open, house: [123, 456] } },
      null,
    ])
      expect(readParcelStore(JSON.stringify(bad))).toBeNull();
  });

  it("a store saved before WF2a (no status, archive or milestones) loads every parcel in progress (owner, #133)", () => {
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "kept before WF2a" }, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as {
      open: Record<string, unknown>;
      built: Record<string, unknown>[];
    };
    for (const p of [raw.open, ...raw.built]) {
      delete p.status;
      delete p.archived;
      delete p.milestones;
    }
    const back = readParcelStore(JSON.stringify(raw))!;
    for (const p of [back.open!, ...back.built])
      expect(p).toMatchObject({
        status: "inProgress",
        archived: null,
        milestones: { walked: null, offered: null },
        notes: "kept before WF2a",
      });
    // Step 8: in its adder's History, with no status word.
    expect(statusLine(back.built[0]!)).toBe("");
    expect(libraryRow(back.built[0]!, undefined).status).toBe("inProgress");
  });

  it("a parcel kept before the asking price existed loads with none (B2a)", () => {
    const s = commitOpen(EMPTY_STORE, plain, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as {
      open: Record<string, unknown>;
      built: Record<string, unknown>[];
    };
    delete raw.open.askingPrice;
    delete raw.open.askingPriceAt;
    for (const p of raw.built) {
      delete p.askingPrice;
      delete p.askingPriceAt;
    }
    expect(readParcelStore(JSON.stringify(raw))?.open).toMatchObject({
      askingPrice: null,
      askingPriceAt: null,
    });
  });

  it("a line kept before its condition, width or name existed loads with its kind's (owner, A; #127); a drive is screened as a track", () => {
    const line = (kind: string, id: string) => ({
      id,
      kind,
      line: [
        [36.629, -81.354],
        [36.6295, -81.3535],
      ],
      widthFt: kind === "easement" ? 30 : null,
      note: "",
      at: T0,
    });
    const s = commitOpen(EMPTY_STORE, plain, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as { open: Record<string, unknown> };
    raw.open.markup = [
      line("track", "a"),
      line("easement", "b"),
      { ...line("drive", "c"), condition: "paved" },
      { ...line("easement", "d"), widthFt: 45, note: "Deed book 412" },
    ];
    const back = readParcelStore(JSON.stringify(raw))!.open!.markup;
    expect(linesOf(back).map((m) => [m.name, m.kind, m.condition, m.widthFt])).toEqual([
      ["Track 1", "track", "pioneer", 10],
      ["Easement 1", "easement", "uncleared", 30],
      ["Existing drive 1", "drive", "paved", 12], // the condition chosen: kept
      ["Easement 2", "easement", "uncleared", 45], // the width chosen: kept
    ]);
    // Names come in the order drawn, numbered per kind (owner, #127); a note stays a note.
    expect(back[3]!.note).toBe("Deed book 412");
    expect(DEFAULT_CONDITION).toEqual({ track: "pioneer", drive: "improved", easement: "uncleared" });
    expect(DEFAULT_WIDTH_FT).toEqual({ track: 10, drive: 12, easement: 30 });
    // The screen doesn't know an existing drive yet, nor any condition, nor a track's width: no pricing change.
    expect(drawnInput(back).map((d) => [d.id, d.kind, d.widthFt, "condition" in d])).toEqual([
      ["a", "track", null, false],
      ["b", "easement", 30, false],
      ["c", "track", null, false],
      ["d", "easement", 45, false],
    ]);
  });
});

describe("My order (WF3, docs/plans/parcel-workflow.md §5)", () => {
  it("a parcel gets its rank when it's built, at the bottom; a plain one has none", () => {
    expect(plain.rank).toBeNull();
    const next = keys();
    let s = commitOpen(EMPTY_STORE, { ...plain, notes: "first" }, T0, next);
    s = commitOpen(closeOpen(s), { ...plainParcel(county(-81.351, "52-48"), T0), notes: "second" }, T0, next);
    expect([...s.built].sort(byRank).map((p) => p.notes)).toEqual(["first", "second"]);
    // An edit keeps it.
    const r = s.built[1]!.rank;
    s = commitOpen(s, { ...s.open!, notes: "second, edited" }, T1, next);
    expect(s.built[1]!.rank).toBe(r);
  });

  it("a move writes the rank alone: not when it changed (the list's Last changed), and the open copy follows", () => {
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "x" }, T0, keys());
    const key = s.built[0]!.key!;
    const moved = rankBuilt(s, key, "a");
    expect(moved.built[0]).toEqual({ ...s.built[0], rank: "a" });
    expect(moved.open!.rank).toBe("a");
    expect(rankBuilt(moved, key, "a")).toBe(moved);
  });

  it("a store saved before WF3 loads with no ranks (prefs gives them, below); a malformed rank doesn't drop the store", () => {
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "kept before WF3" }, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as {
      open: Record<string, unknown>;
      built: Record<string, unknown>[];
    };
    delete raw.open.rank;
    delete raw.built[0]!.rank;
    expect(readParcelStore(JSON.stringify(raw))!.built[0]!.rank).toBeNull();
    raw.built[0]!.rank = "not a rank!";
    expect(readParcelStore(JSON.stringify(raw))!.built[0]).toMatchObject({
      rank: null,
      notes: "kept before WF3",
    });
  });

  it("read through prefs, every History parcel is ranked, and that's saved back", () => {
    const data = new Map<string, string>();
    const kv: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "kept before WF3" }, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as { built: Record<string, unknown>[] };
    delete raw.built[0]!.rank;
    kv.setItem("ps.parcels", JSON.stringify(raw));
    const read = getPref("ps.parcels", kv)!;
    expect(read.built[0]!.rank).toBe("V");
    expect(readParcelStore(kv.getItem("ps.parcels")!)!.built[0]!.rank).toBe("V");
  });
});

describe("point and area markers (WF4)", () => {
  it("round-trip through the store; a line kept before WF4 (no shape) loads as a line; a malformed marker fails the read", () => {
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "x" }, T0, keys());
    const markers: WorkingParcel["markup"] = [
      {
        id: "s",
        name: "Spring 1",
        shape: "point",
        kind: "spring",
        ll: [36.629, -81.354],
        septicClass: null,
        note: "",
        at: T0,
      },
      {
        id: "p",
        name: "Septic permit 1",
        shape: "area",
        kind: "septic",
        ring: [
          [36.6285, -81.3545],
          [36.6285, -81.354],
          [36.629, -81.354],
        ],
        septicClass: "alternative",
        note: "on file at the county",
        at: T0,
      },
    ];
    const withMarks = { ...s, open: { ...s.open!, markup: markers } };
    expect(readParcelStore(writeParcelStore(withMarks))!.open!.markup).toEqual(markers);
    // A permit's class is optional: one written without it reads as none.
    const raw = JSON.parse(writeParcelStore(withMarks)) as { open: { markup: Record<string, unknown>[] } };
    delete raw.open.markup[0]!.septicClass;
    expect(readParcelStore(JSON.stringify(raw))!.open!.markup[0]).toMatchObject({ septicClass: null });
    // An area needs three corners.
    raw.open.markup[1]!.ring = [[36.6285, -81.3545]];
    expect(readParcelStore(JSON.stringify(raw))).toBeNull();
    // Only lines reach the screen.
    expect(drawnInput(markers)).toEqual([]);
  });
});

describe("a Septic field saved by #136 (owner, after #136: no separate kind)", () => {
  it("loads as a Septic permit drawn as an area, and imports so", () => {
    // How #136 kept one: the "Septic field" chip made an area of kind "septic", named "Septic permit 1".
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "x" }, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as { built: Record<string, unknown>[] };
    raw.built[0]!.markup = [
      {
        id: "f",
        name: "Septic permit 1",
        shape: "area",
        kind: "septic",
        ring: [
          [36.6285, -81.3545],
          [36.6285, -81.354],
          [36.629, -81.354],
        ],
        note: "",
        at: T0,
      },
    ];
    const m = readParcelStore(JSON.stringify(raw))!.built[0]!.markup[0]!;
    expect(m).toMatchObject({ shape: "area", kind: "septic", name: "Septic permit 1", septicClass: null });
    expect(KIND_NAME[m.kind]).toBe("Septic permit");
  });
});

describe("who added it (step 6)", () => {
  it("a parcel records the profile that first built it, and keeps it through later edits by anyone", () => {
    expect(plain.addedBy).toBeNull();
    const s1 = commitOpen(EMPTY_STORE, { ...plain, notes: "Spring." }, T0, () => "k1", "zach");
    expect(s1.built[0]!.addedBy).toBe("zach");
    const s2 = commitOpen(s1, { ...s1.open!, notes: "Spring by the barn." }, T1, () => "k2", "julie");
    expect(s2.built[0]!.addedBy).toBe("zach");
    // Not built yet: nothing to record.
    expect(commitOpen(EMPTY_STORE, plain, T0, () => "k3", "zach").built).toEqual([]);
  });
});

describe("step 14's parcel fields (plan §3.2)", () => {
  it("a parcel kept before them loads with no deed restrictions, an HOA not known, and easements of no purpose", () => {
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "kept before step 14" }, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as {
      v: number;
      open: Record<string, unknown>;
      built: Record<string, unknown>[];
    };
    for (const p of [raw.open, ...raw.built]) {
      delete p.deedRestrictions;
      delete p.hoa;
      p.markup = [
        {
          id: "e",
          name: "Easement 1",
          shape: "line",
          kind: "easement",
          condition: "uncleared",
          line: [
            [36.629, -81.354],
            [36.6295, -81.3535],
          ],
          widthFt: 30,
          note: "",
          recordedIn: "",
          at: T0,
        },
      ];
    }
    const back = readParcelStore(JSON.stringify(raw))!;
    expect(back.v).toBe(2);
    for (const p of [back.open!, ...back.built]) {
      expect(p).toMatchObject({ deedRestrictions: "", hoa: "unknown", notes: "kept before step 14" });
      expect(linesOf(p.markup)[0]!.easementType).toBeUndefined();
    }
  });

  it("round-trips them, and a Stream mark; an HOA or a purpose it doesn't know fails the read", () => {
    const stream = {
      id: "s",
      name: "Stream 1",
      shape: "point" as const,
      kind: "stream" as const,
      ll: [36.629, -81.354] as [number, number],
      septicClass: null,
      note: "",
      at: T0,
    };
    const easement = {
      id: "e",
      name: "Easement 1",
      shape: "line" as const,
      kind: "easement" as const,
      condition: "uncleared" as const,
      line: [
        [36.629, -81.354],
        [36.6295, -81.3535],
      ] as [number, number][],
      widthFt: 30,
      note: "",
      recordedIn: "",
      easementType: "utility" as const,
      at: T0,
    };
    const p: WorkingParcel = {
      ...plain,
      deedRestrictions: "No mobile homes",
      hoa: "yes",
      markup: [stream, easement],
    };
    const s = commitOpen(EMPTY_STORE, p, T0, keys());
    const back = readParcelStore(writeParcelStore(s))!.open!;
    expect(back).toMatchObject({ deedRestrictions: "No mobile homes", hoa: "yes" });
    expect(back.markup).toEqual([stream, easement]);
    expect(KIND_NAME.stream).toBe("Stream");
    const bad = (patch: Record<string, unknown>) =>
      readParcelStore(writeParcelStore({ ...s, open: { ...s.open!, ...patch } as WorkingParcel }));
    expect(bad({ hoa: "maybe" })).toBeNull();
    expect(bad({ markup: [{ ...easement, easementType: "pipeline" }] })).toBeNull();
  });

  it("split scenarios (§5.2): a parcel kept before them has none; they round-trip, and one builds the parcel", () => {
    const s = commitOpen(EMPTY_STORE, { ...plain, notes: "kept before step 14" }, T0, keys());
    const raw = JSON.parse(writeParcelStore(s)) as {
      open: Record<string, unknown>;
      built: Record<string, unknown>[];
    };
    for (const p of [raw.open, ...raw.built]) delete p.scenarios;
    const back = readParcelStore(JSON.stringify(raw))!;
    expect(back.v).toBe(2);
    for (const p of [back.open!, ...back.built]) expect(p.scenarios).toEqual([]);

    const scenario = {
      id: "sc1",
      name: "Split 1",
      a: [36.627, -81.354] as [number, number],
      b: [36.631, -81.354] as [number, number],
      screens: { left: "scr-left", right: null },
      at: T0,
    };
    expect(isBuilt({ ...plain, scenarios: [scenario] })).toBe(true);
    const kept = commitOpen(EMPTY_STORE, { ...plain, scenarios: [scenario] }, T0, keys());
    expect(readParcelStore(writeParcelStore(kept))!.open!.scenarios).toEqual([scenario]);
    expect(
      readParcelStore(
        writeParcelStore({
          ...kept,
          open: {
            ...kept.open!,
            scenarios: [{ ...scenario, screens: { left: 1 } }],
          } as unknown as WorkingParcel,
        }),
      ),
    ).toBeNull();
  });
});
