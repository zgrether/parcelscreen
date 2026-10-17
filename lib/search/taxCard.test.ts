/**
 * Tennessee's parcel numbers as typed from a tax card (step 2, PR 2): control map, group, parcel. The county stores
 * the map zero-padded ("063D") and the parcel with its decimals ("015.00"); people type them either way.
 */
import { describe, expect, it } from "vitest";
import { taxCardQuery, taxCardWhere } from "./query";

describe("taxCardQuery", () => {
  it("reads map, group and parcel, padding as the county stores them", () => {
    expect(taxCardQuery("063D A 015.00")).toEqual({ map: "063D", group: "A", parcel: "015.00" });
    expect(taxCardQuery("63D A 15")).toEqual({ map: "063D", group: "A", parcel: "015" });
    expect(taxCardQuery("63d-a-15")).toEqual({ map: "063D", group: "A", parcel: "015" });
    expect(taxCardQuery("040 037.01")).toEqual({ map: "040", group: null, parcel: "037.01" });
    expect(taxCardQuery("66 37")).toEqual({ map: "066", group: null, parcel: "037" });
    expect(taxCardQuery("011B")).toEqual({ map: "011B", group: null, parcel: null });
    expect(taxCardQuery("011B A")).toEqual({ map: "011B", group: "A", parcel: null });
  });

  it("isn't one when it doesn't read as map, group, parcel", () => {
    expect(taxCardQuery("52-47A")).toBeNull(); // a Virginia number: 47A isn't a parcel
    expect(taxCardQuery("Roan Mountain")).toBeNull();
    expect(taxCardQuery("1234 5")).toBeNull();
    expect(taxCardQuery("063D A 015 9")).toBeNull();
    expect(taxCardQuery("")).toBeNull();
  });
});

describe("taxCardWhere", () => {
  it("asks for the county and map, and the group and parcel when typed", () => {
    expect(taxCardWhere("COUNTY_NAME", "Carter", { map: "063D", group: "A", parcel: "015" })).toBe(
      "COUNTY_NAME='Carter' AND CMAP='063D' AND GP='A' AND PARCEL LIKE '015%'",
    );
    expect(taxCardWhere("COUNTY_NAME", "O'Brien", { map: "040", group: null, parcel: null })).toBe(
      "COUNTY_NAME='O''Brien' AND CMAP='040'",
    );
  });
});
