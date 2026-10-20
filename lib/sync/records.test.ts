import { describe, expect, it } from "vitest";
import {
  batches,
  canonical,
  diffParcels,
  isSyncedDoc,
  mergeParcels,
  parcelOf,
  parcelSnapshot,
  parseParcels,
  profileRecord,
} from "./records";
import type { StoredParcel } from "./wire";

const store = (built: object[], open: object | null = null) => JSON.stringify({ v: 2, open, built });
const remote = (key: string, record: object | null): StoredParcel => ({
  key,
  profile: "p1",
  record: record as Record<string, unknown> | null,
  deleted: record === null,
  updatedAt: "2026-10-19T12:00:00Z",
});

describe("whole records (step 5 §5)", () => {
  it("a profile's record: its name and created time, and only the documents that sync", () => {
    const docs: Record<string, string> = { "ps.cfg": "{}", "ps.rubrics": '{"mine":1}', "ps.library": "{}" };
    expect(profileRecord({ name: "Zach", createdAt: "t" }, (k) => docs[k] ?? null)).toEqual({
      name: "Zach",
      createdAt: "t",
      docs: { "ps.cfg": "{}", "ps.rubrics": '{"mine":1}' },
    });
    expect(isSyncedDoc("ps.interview")).toBe(true);
    for (const k of ["ps.parcels", "ps.compare", "ps.library", "ps.rubricView", "ps.recentMarks"])
      expect(isSyncedDoc(k)).toBe(false);
  });

  it("compares content, not key order", () => {
    expect(canonical({ a: 1, b: { c: 2, d: [1, { f: 1, e: 2 }] } })).toBe(
      canonical({ b: { d: [1, { e: 2, f: 1 }], c: 2 }, a: 1 }),
    );
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });

  it("reads the parcels document: each built parcel by key; the open parcel isn't one of them", () => {
    const raw = store(
      [
        { key: "k1", name: "Ferney" },
        { key: "k2", name: "Macks" },
      ],
      { key: "k1", name: "Ferney" },
    );
    expect([...parcelSnapshot(raw).keys()]).toEqual(["k1", "k2"]);
    expect(parcelOf(raw, "k2")).toEqual({ key: "k2", name: "Macks" });
    expect(parseParcels(null)).toEqual({ v: 2, open: null, built: [] });
    expect(parseParcels("not json")).toEqual({ v: 2, open: null, built: [] });
  });

  it("diffs two copies: added and edited parcels whole, and removed keys", () => {
    const before = parcelSnapshot(
      store([
        { key: "k1", name: "A" },
        { key: "k2", name: "B" },
      ]),
    );
    const after = parcelSnapshot(
      store([
        { key: "k1", name: "A2" },
        { key: "k3", name: "C" },
      ]),
    );
    expect(diffParcels(before, after)).toEqual({ changed: ["k1", "k3"], removed: ["k2"] });
    expect(diffParcels(before, before)).toEqual({ changed: [], removed: [] });
    // Opening a parcel rewrites the document, but no built parcel changes.
    const opened = parcelSnapshot(
      store(
        [
          { key: "k1", name: "A" },
          { key: "k2", name: "B" },
        ],
        { key: "k1" },
      ),
    );
    expect(diffParcels(before, opened)).toEqual({ changed: [], removed: [] });
  });

  it("merges the space's changes whole, keeping what's unsaved here; the open parcel follows its entry", () => {
    const raw = store(
      [
        { key: "k1", name: "Ferney" },
        { key: "k2", name: "Macks" },
        { key: "k3", name: "Mud Creek" },
      ],
      { key: "k1", name: "Ferney" },
    );
    const merged = JSON.parse(
      mergeParcels(
        raw,
        [
          remote("k1", { key: "k1", name: "Ferney B" }),
          remote("k2", null),
          remote("k3", { key: "k3", name: "Mud Creek (theirs)" }),
          remote("k4", { key: "k4", name: "Roan" }),
        ],
        new Set(["k3"]),
      ),
    ) as { open: { name: string } | null; built: { key: string; name: string }[] };
    expect(merged.built).toEqual([
      { key: "k1", name: "Ferney B" },
      { key: "k3", name: "Mud Creek" },
      { key: "k4", name: "Roan" },
    ]);
    expect(merged.open).toEqual({ key: "k1", name: "Ferney B" });
    const closed = JSON.parse(mergeParcels(raw, [remote("k1", null)], new Set())) as { open: unknown };
    expect(closed.open).toBeNull();
  });

  it("batches under a size, one oversized item alone", () => {
    const size = (x: number) => x;
    expect(batches([3, 3, 3, 9, 2], 6, size)).toEqual([[3, 3], [3], [9], [2]]);
    expect(batches([], 6, size)).toEqual([]);
  });
});
