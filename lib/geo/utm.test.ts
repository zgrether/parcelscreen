import { bbox, buffer, distance } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { fwd, inv } from "./utm";

describe("UTM zone 17N", () => {
  it("puts the central meridian at the false easting and the equator at zero", () => {
    expect(fwd(0, -81)).toEqual([500000, 0]);
  });

  it("round-trips within 1 mm inside zone 17 and 5 cm across the whole NC/VA/TN box", () => {
    // The prototype projects everything into zone 17, even eastern Virginia ~6° east of the central
    // meridian, where the truncated series loses a few centimetres. Harmless at screening scale.
    let inZone = 0,
      anywhere = 0;
    for (let lat = 33.8; lat <= 39.5; lat += 0.25)
      for (let lon = -84.4; lon <= -75.2; lon += 0.25) {
        const [x, y] = fwd(lat, lon);
        const [la, lo] = inv(x, y);
        const m = distance([lon, lat], [lo, la], { units: "meters" });
        anywhere = Math.max(anywhere, m);
        if (lon >= -84 && lon <= -78) inZone = Math.max(inZone, m);
      }
    expect(inZone).toBeLessThan(0.001);
    expect(anywhere).toBeLessThan(0.05);
  });

  // Rebuild the prototype's own 3DEP request bboxes from the recorded parcel polygon. Ferney Creek matches
  // bit-for-bit; Macks Mountain differs in the last bits (~1e-9 m) because turf.buffer and fwd() call
  // Math.sin/atan2/…, whose last-bit rounding differs between Chromium's V8 (where the prototype was
  // recorded) and Node's (docs/plans/phase-0.md §5). So: 1 µm, which is still a verbatim-port check.
  it.each(FIXTURE_SLUGS)("reproduces the recorded 3DEP request bboxes to 1 µm (%s)", (slug) => {
    const fx = loadFixture(slug);
    const recorded = fx.har.log.entries
      .filter((e) => e.request.url.includes("/3DEPElevation/ImageServer/exportImage"))
      .map((e) => new URL(e.request.url).searchParams.get("bbox"));
    const requestBbox = (km: number) => {
      const [W, S, E, N] = bbox(buffer(fx.input.polygon, km, { units: "kilometers" })!);
      const [x0, y0] = fwd(S, W),
        [x1, y1] = fwd(N, E);
      return `${x0},${y0},${x1},${y1}`;
    };
    const close = (rec: string | null | undefined, mine: string) =>
      rec!
        .split(",")
        .map(Number)
        .forEach((v, i) => expect(Math.abs(v - Number(mine.split(",")[i]))).toBeLessThan(1e-6));
    close(recorded[0], requestBbox(0.15)); // fine DEM: parcel + 150 m
    close(recorded[1], requestBbox(6)); // wide DEM: parcel + 6 km, for the horizon
  });
});
