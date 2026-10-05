import { area, destination, polygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { combinedRecord, combineParcels, memberLabel } from "./combine";
import { boundarySourceLabel, parcelFacts } from "./parcels";
import { M2_PER_ACRE } from "./types";

const LIMITS = { maxGapM: 30, touchM: 1 };
const ORIGIN = [-81.35, 36.63];

/** A square `sideM` on a side whose west edge is `eastM` metres east of ORIGIN. */
function square(eastM: number, sideM = 200): Feature<Polygon> {
  const at = (e: number, n: number) => {
    const p = destination(ORIGIN, e, 90, { units: "meters" });
    return destination(p, n, 0, { units: "meters" }).geometry.coordinates;
  };
  const [a, b, c, d] = [at(eastM, 0), at(eastM + sideM, 0), at(eastM + sideM, sideM), at(eastM, sideM)];
  return polygon([[a!, b!, c!, d!, a!]]);
}
const ac = (f: Feature<Polygon>) => area(f) / M2_PER_ACRE;

describe("combineParcels", () => {
  it("needs two parcels", () => {
    expect(combineParcels([square(0)], LIMITS)).toEqual({ ok: false, reason: "fewer than two", gapM: 0 });
  });

  it("unions parcels that share an edge, unchanged: no gap, no bridge", () => {
    const a = square(0),
      b = polygon([
        [
          a.geometry.coordinates[0]![1]!,
          square(200).geometry.coordinates[0]![1]!,
          square(200).geometry.coordinates[0]![2]!,
          a.geometry.coordinates[0]![2]!,
          a.geometry.coordinates[0]![1]!,
        ],
      ]);
    const r = combineParcels([a, b], LIMITS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gapM).toBe(0);
    expect(r.bridgeAcres).toBe(0);
    expect(r.acres).toBeCloseTo(ac(a) + ac(b), 3);
    expect(r.geo.geometry.type).toBe("Polygon");
  });

  it("treats a digitizing sliver (under 1 m) as touching", () => {
    const r = combineParcels([square(0), square(200.4)], LIMITS);
    expect(r).toMatchObject({ ok: true, gapM: 0 });
  });

  it("bridges a road-width gap: reports the gap, keeps the parcels' own acres, measures the strip", () => {
    const a = square(0),
      b = square(220); // 20 m apart
    const r = combineParcels([a, b], LIMITS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gapM).toBeCloseTo(20, 0);
    expect(r.acres).toBeCloseTo(ac(a) + ac(b), 3);
    // The strip is about 20 m × 200 m ≈ 0.99 ac (a little more where the corners round).
    expect(r.bridgeAcres).toBeGreaterThan(0.9);
    expect(r.bridgeAcres).toBeLessThan(1.2);
    expect(r.geo.geometry.type).toBe("Polygon");
  });

  it("refuses parcels farther apart than 30 m, saying how far", () => {
    const r = combineParcels([square(0), square(245)], LIMITS);
    expect(r).toMatchObject({ ok: false, reason: "too far apart" });
    expect(r.gapM).toBeCloseTo(45, 0);
  });

  it("chains three parcels by their nearest neighbours (the widest link decides)", () => {
    // 0–200, 210–410 (10 m gap), 435–635 (25 m gap): widest link 25 m, within the limit.
    const r = combineParcels([square(0), square(435), square(210)], LIMITS);
    expect(r).toMatchObject({ ok: true });
    expect(r.gapM).toBeCloseTo(25, 0);
  });
});

describe("the combined parcel record", () => {
  const rec = (eastM: number, props: Record<string, unknown>) => ({
    geo: square(eastM),
    props,
    source: "https://vginmaps.vdem.virginia.gov/x",
    multiPart: false,
  });

  it("names every parcel, merges owners and counties, and keeps the parcels' own acres", () => {
    const a = rec(0, { PARCELID: "52-47A", OWNER: "A. Smith", COUNTY: "Floyd" }),
      b = rec(220, { PARCELID: "52-42", OWNER: "B. Jones", COUNTY: "Floyd" });
    const r = combineParcels([a.geo, b.geo], LIMITS);
    if (!r.ok) throw new Error("expected a combination");
    const c = combinedRecord([a, b], r);
    expect(c.source).toBe("combined");
    expect(c.props).toMatchObject({
      parno: "52-47A + 52-42",
      OWNER_NAME: "A. Smith; B. Jones",
      COUNTY_NAME: "Floyd",
      combined_acres: r.acres,
    });
    const f = parcelFacts(c.geo, c.props);
    expect(f.acres).toBe(r.acres); // not the bridged boundary's area
    expect(ac(c.geo)).toBeGreaterThan(f.acres);
    expect(f.parcelId).toBe("52-47A + 52-42");
    // The members are kept, so the combination can be edited later; combining a combination stays flat.
    expect(c.members!.map((m) => m.props.PARCELID)).toEqual(["52-47A", "52-42"]);
    const d = rec(440, { PARCELID: "52-61" });
    const r2 = combineParcels([c.geo, d.geo], LIMITS);
    if (!r2.ok) throw new Error("expected a combination");
    expect(combinedRecord([c, d], r2).members!.map((m) => m.props.PARCELID)).toEqual([
      "52-47A",
      "52-42",
      "52-61",
    ]);
    expect(boundarySourceLabel(c.source, c.props)).toBe(
      "combined from 52-47A + 52-42 — bridged a 20 m gap (road right-of-way?); the acres leave the strip out",
    );
  });

  it("labels unnumbered parcels by position, and says nothing about a gap when they touch", () => {
    const drawn = { ...rec(0, {}), source: "drawn" };
    expect(memberLabel(drawn, 1)).toBe("parcel 2");
    expect(boundarySourceLabel("combined", { parno: "52-47A + parcel 2", combined_gap_m: 0 })).toBe(
      "combined from 52-47A + parcel 2",
    );
  });
});
