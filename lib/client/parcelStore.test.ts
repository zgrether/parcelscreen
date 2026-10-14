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
  loadParcelStore,
  openBuilt,
  plainParcel,
  readParcelStore,
  removeBuilt,
  writeParcelStore,
  type WorkingParcel,
} from "./parcelStore";
import { getPref, setPref, type KeyValueStore } from "./prefs";
import { libraryRow } from "./library";
import { statusLine } from "./parcelStatus";

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
    // And on the list it reads "In progress".
    expect(statusLine(back.built[0]!)).toBe("In progress");
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
    expect(back.map((m) => [m.name, m.kind, m.condition, m.widthFt])).toEqual([
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
