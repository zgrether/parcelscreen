import { describe, expect, it } from "vitest";
import { snapCorner, type SnapRing } from "./snap";
import type { LatLon } from "./types";

// A 100 px square on screen, standing for a parcel whose corners are at these coordinates.
const ring: SnapRing = {
  xy: [
    [100, 100],
    [200, 100],
    [200, 200],
    [100, 200],
    [100, 100],
  ],
  ll: [
    [36.63, -81.355],
    [36.63, -81.353],
    [36.628, -81.353],
    [36.628, -81.355],
    [36.63, -81.355],
  ],
};

describe("snapCorner", () => {
  it("lands exactly on a parcel corner within reach", () => {
    expect(snapCorner([195, 108], [ring], 14)).toEqual({ kind: "corner", ll: [36.63, -81.353] });
  });

  it("prefers a corner over a nearer edge", () => {
    // 4 px from the top edge, 12 px from the top-right corner.
    expect(snapCorner([189, 104], [ring], 14)?.kind).toBe("corner");
  });

  it("else lands on the nearest edge, on the segment between that edge's own corners", () => {
    const s = snapCorner([150, 110], [ring], 14)!;
    expect(s.kind).toBe("edge");
    const [lat, lon] = s.ll;
    expect(lat).toBe(36.63);
    expect(lon).toBeCloseTo(-81.354, 9);
  });

  it("an edge point stays on the straight line between the vertices' coordinates", () => {
    const s = snapCorner([205, 130], [ring], 14)!;
    const A: LatLon = ring.ll[1]!,
      B: LatLon = ring.ll[2]!;
    expect(s.ll[1]).toBe(A[1]);
    expect(s.ll[0]).toBeLessThan(A[0]);
    expect(s.ll[0]).toBeGreaterThan(B[0]);
    expect(s.ll[0]).toBeCloseTo(A[0] + 0.3 * (B[0] - A[0]), 12);
  });

  it("leaves a corner alone when nothing is within reach", () => {
    expect(snapCorner([150, 150], [ring], 14)).toBeNull();
    expect(snapCorner([150, 80], [ring], 14)).toBeNull();
  });
});
