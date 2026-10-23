/** Which parcels are samples (step 13 plan §5): by their piece's source; a preview until it's on the list. */
import { describe, expect, it } from "vitest";
import { plainParcel } from "./parcelStore";
import { isPreview, sampleOf } from "./samples";

const parcel = (source: string) =>
  plainParcel(
    {
      geo: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
      props: {},
      source,
      multiPart: false,
    },
    "2026-10-22T00:00:00Z",
  );

describe("a sample parcel", () => {
  it("is known by its source, area and number", () => {
    expect(sampleOf(parcel("sample:grayson-highlands-2"))).toEqual({ area: "grayson-highlands", n: 2 });
    expect(sampleOf(parcel("https://vginmaps.vdem.virginia.gov/x"))).toBeNull();
    expect(sampleOf(null)).toBeNull();
  });

  it("is a preview until it's on the list", () => {
    const p = parcel("sample:floyd-1");
    expect(isPreview(p)).toBe(true);
    expect(isPreview({ ...p, status: "saved" })).toBe(false);
    expect(isPreview(parcel("drawn"))).toBe(false);
  });
});
