import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { drawnPart } from "@/lib/geo/recipe";
import {
  closeOpen,
  commitOpen,
  EMPTY_STORE,
  fromV1,
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
      ["two parts", { ...plain, recipe: { parts: [county(-81.355, "a"), county(-81.353, "b")] } }],
      ["a drawn part", { ...plain, recipe: { parts: [drawnPart(sq(-81.355))] } }],
      [
        "a split piece from 13d",
        { ...plain, recipe: { parts: [{ ...county(-81.355, "a"), source: "split" }] } },
      ],
      [
        "a split",
        {
          ...plain,
          recipe: { ...plain.recipe, split: { a: [36.62, -81.354], b: [36.64, -81.354], keep: 1 } },
        },
      ],
      ["a house", { ...plain, house: [36.629, -81.354] }],
      ["notes", { ...plain, notes: "Ask about the spring." }],
      ["results", { ...plain, screenedAt: T1 }],
      ["a key (it was built before)", { ...plain, key: "k9" }],
    ];
    for (const [why, p] of changed) expect(isBuilt(p), why).toBe(true);
    expect(isBuilt({ ...plain, notes: "   " })).toBe(false);
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

describe("13d's v1 record converts", () => {
  it("a combination becomes its members, built, with the house", () => {
    const a = county(-81.355, "52-47A"),
      b = county(-81.353, "52-42A");
    const v1 = {
      parcel: { ...a, source: "combined", props: { parno: "52-47A + 52-42A" }, members: [a, b] },
      house: [36.629, -81.354] as [number, number],
    };
    const s = fromV1(v1, T0, keys());
    expect(s.open?.recipe.parts.map((p) => p.props.PARCELID)).toEqual(["52-47A", "52-42A"]);
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
      { ...good, open: { ...good.open, recipe: { parts: [] } } },
      { ...good, open: { ...good.open, house: [123, 456] } },
      null,
    ])
      expect(readParcelStore(JSON.stringify(bad))).toBeNull();
  });
});
