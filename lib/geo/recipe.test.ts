import { area, destination, polygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { boundarySourceLabel, parcelFacts, type ParcelRecord } from "./parcels";
import { deriveParcel, drawnPart, isCountyRecord } from "./recipe";
import { M2_PER_ACRE, type LatLon } from "./types";

const LIMITS = { maxGapM: 30, touchM: 1 };
const ORIGIN = [-81.35, 36.63];
/** [lat, lon] `eastM` east and `northM` north of ORIGIN. */
function ll(eastM: number, northM: number): LatLon {
  const p = destination(destination(ORIGIN, eastM, 90, { units: "meters" }), northM, 0, { units: "meters" });
  const [lon, lat] = p.geometry.coordinates as [number, number];
  return [lat, lon];
}
/** A rectangle from `eastM` to `eastM + w`, 200 m tall. */
function rect(eastM: number, w = 200): Feature<Polygon> {
  const c = [ll(eastM, 0), ll(eastM + w, 0), ll(eastM + w, 200), ll(eastM, 200)].map(([lat, lon]) => [
    lon,
    lat,
  ]);
  return polygon([[...c, c[0]!]]);
}
const county = (eastM: number, id: string, w = 200): ParcelRecord => ({
  geo: rect(eastM, w),
  props: { PARCELID: id, OWNER: "R. & J. Hale", COUNTY: "Floyd" },
  source: "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0",
  multiPart: false,
});
const ac = (f: Feature<Polygon>) => area(f) / M2_PER_ACRE;
const ok = (d: ReturnType<typeof deriveParcel>) => {
  if (!d.ok) throw new Error("expected a boundary, got " + d.reason);
  return d;
};

describe("deriveParcel", () => {
  it("needs a part", () => {
    expect(deriveParcel({ parts: [] }, LIMITS)).toEqual({ ok: false, reason: "no parts", gapM: 0 });
  });

  it("one county parcel is itself", () => {
    const p = county(0, "52-47A");
    const d = ok(deriveParcel({ parts: [p] }, LIMITS));
    expect(d.record).toBe(p);
    expect(d.acres).toBeCloseTo(ac(p.geo), 6);
    expect(d).toMatchObject({ bridgeAcres: 0, gapM: 0, splitDropped: false });
  });

  it("parcels that touch combine into one boundary, with every ID", () => {
    const a = county(0, "52-47A"),
      b = county(200, "52-42A");
    const d = ok(deriveParcel({ parts: [a, b] }, LIMITS));
    expect(d.record.source).toBe("combined");
    expect(d.record.props.parno).toBe("52-47A + 52-42A");
    expect(d.acres).toBeCloseTo(ac(a.geo) + ac(b.geo), 3);
    expect(d.record.geo.geometry.type).toBe("Polygon");
  });

  it("a drawn shape joins the parcel it overlaps, counted once (the union)", () => {
    const p = county(0, "52-47A");
    const corner = drawnPart(rect(150, 100)); // 50 m over the parcel, 50 m beyond it
    const d = ok(deriveParcel({ parts: [p, corner] }, LIMITS));
    expect(d.record.props.parno).toBe("52-47A + drawn");
    expect(d.acres).toBeCloseTo(ac(rect(0, 250)), 2);
  });

  it("a road gap is bridged; the acres are the parcels' own, the strip reported apart", () => {
    const a = county(0, "52-47A"),
      b = county(220, "52-61");
    const d = ok(deriveParcel({ parts: [a, b] }, LIMITS));
    expect(d.gapM).toBeCloseTo(20, 0);
    expect(d.acres).toBeCloseTo(ac(a.geo) + ac(b.geo), 3);
    expect(d.bridgeAcres).toBeGreaterThan(0.9);
    expect(d.bridgeAcres).toBeLessThan(1.2);
  });

  it("parts too far apart don't make a boundary", () => {
    const d = deriveParcel({ parts: [county(0, "a"), county(245, "b")] }, LIMITS);
    expect(d).toMatchObject({ ok: false, reason: "too far apart" });
  });

  it("a split keeps one side: the two sides add up, and the piece says where it came from", () => {
    const p = county(0, "52-47A");
    const cut = { a: ll(80, -50), b: ll(80, 250) }; // a north–south line 80 m in: west is left of travel
    const west = ok(deriveParcel({ parts: [p], split: { ...cut, keep: -1 } }, LIMITS));
    const east = ok(deriveParcel({ parts: [p], split: { ...cut, keep: 1 } }, LIMITS));
    expect(west.acres).toBeCloseTo(ac(rect(0, 80)), 2);
    expect(west.acres + east.acres).toBeCloseTo(ac(p.geo), 2);
    expect(west.record.source).toBe("split");
    expect(boundarySourceLabel(west.record.source, west.record.props)).toBe(
      "split from 52-47A — verify against the recorded plat",
    );
    expect(parcelFacts(west.record.geo, west.record.props).acres).toBeCloseTo(west.acres, 6);
  });

  it("a split across a bridged combination: the kept acres leave the road strip out", () => {
    const a = county(0, "52-47A"),
      b = county(220, "52-61");
    // Cut 80 m into the second parcel; keep the west side: all of a, the strip, 80 m of b.
    const d = ok(
      deriveParcel({ parts: [a, b], split: { a: ll(300, -50), b: ll(300, 250), keep: -1 } }, LIMITS),
    );
    expect(d.acres).toBeCloseTo(ac(a.geo) + ac(rect(220, 80)), 1);
    expect(d.bridgeAcres).toBeGreaterThan(0.9);
    expect(d.record.props.split_from).toBe("52-47A + 52-61");
    expect(d.record.members?.map((m) => m.props.PARCELID)).toEqual(["52-47A", "52-61"]);
  });

  it("a split that no longer cuts the boundary is left off, and says so", () => {
    const a = county(0, "52-47A");
    // The cut went through a part that has since been taken out.
    const d = ok(deriveParcel({ parts: [a], split: { a: ll(300, -50), b: ll(300, 250), keep: -1 } }, LIMITS));
    expect(d.splitDropped).toBe(true);
    expect(d.record).toBe(a);
  });

  it("knows a county record from a drawn or derived one", () => {
    expect(isCountyRecord(county(0, "x"))).toBe(true);
    expect(isCountyRecord(drawnPart(rect(0)))).toBe(false);
    expect(isCountyRecord({ ...county(0, "x"), source: "split" })).toBe(false);
  });
});
