import { describe, expect, it } from "vitest";
import { isPlaceholderRecord } from "./parcelFields";

describe("isPlaceholderRecord (owner's bug report, 2026-10-11)", () => {
  const VA =
    "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";
  const NC = "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1";
  it("a blank or zero parcel ID is no record; a real one is", () => {
    for (const id of ["0", "00", " 0 ", "", null, undefined])
      expect(isPlaceholderRecord(VA, { PARCELID: id })).toBe(true);
    expect(isPlaceholderRecord(VA, {})).toBe(true);
    expect(isPlaceholderRecord(VA, null)).toBe(true);
    for (const id of ["6273", "63-A-62", "10", "0820447"])
      expect(isPlaceholderRecord(VA, { PARCELID: id })).toBe(false);
    // Each service's own ID field.
    expect(isPlaceholderRecord(NC, { parno: "082044716014" })).toBe(false);
    expect(isPlaceholderRecord(NC, { parno: "0" })).toBe(true);
  });
});
