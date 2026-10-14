import { describe, expect, it } from "vitest";
import { PRECISION_ZOOM, readListingUrl, safeListingHref } from "./listingUrl";

describe("the address in a listing's link (WF1)", () => {
  it("Zillow, Redfin and Realtor.com: the street, town, state and ZIP from the path", () => {
    expect(
      readListingUrl("https://www.zillow.com/homedetails/123-Ferney-Creek-Rd-Floyd-VA-24091/12345678_zpid/"),
    ).toEqual({
      kind: "address",
      site: "Zillow",
      query: "123 Ferney Creek Rd Floyd, VA 24091",
      precision: "street",
    });
    expect(readListingUrl("https://www.redfin.com/VA/Floyd/123-Ferney-Creek-Rd-24091/home/12345678")).toEqual(
      {
        kind: "address",
        site: "Redfin",
        query: "123 Ferney Creek Rd, Floyd, VA 24091",
        precision: "street",
      },
    );
    expect(
      readListingUrl(
        "https://www.realtor.com/realestateandhomes-detail/123-Ferney-Creek-Rd_Floyd_VA_24091_M12345-67890",
      ),
    ).toEqual({
      kind: "address",
      site: "Realtor.com",
      query: "123 Ferney Creek Rd, Floyd, VA 24091",
      precision: "street",
    });
  });

  it("vacant land: '0', 'Lot 7', 'TBD' or no number places it on the road only, with the lead dropped", () => {
    const q = (u: string) => readListingUrl(u);
    expect(
      q("https://www.zillow.com/homedetails/0-Ferney-Creek-Rd-Floyd-VA-24091/2077665544_zpid/"),
    ).toMatchObject({
      query: "Ferney Creek Rd Floyd, VA 24091",
      precision: "road",
    });
    expect(q("https://www.redfin.com/VA/Floyd/Lot-7-Ridge-Rd-24091/home/99")).toMatchObject({
      query: "Ridge Rd, Floyd, VA 24091",
      precision: "road",
    });
    expect(q("https://www.redfin.com/NC/Boone/TBD-Mud-Creek-Ln-28607/home/1")).toMatchObject({
      query: "Mud Creek Ln, Boone, NC 28607",
      precision: "road",
    });
    expect(q("https://www.redfin.com/VA/Floyd/Ferney-Creek-Rd-24091/home/1")).toMatchObject({
      precision: "road",
    });
    // Realtor.com without a street: the town and ZIP.
    expect(q("https://www.realtor.com/realestateandhomes-detail/Floyd_VA_24091_M99-1")).toMatchObject({
      query: "Floyd, VA 24091",
      precision: "road",
    });
  });

  it("the land sites: the county and state only", () => {
    expect(
      readListingUrl("https://www.landwatch.com/floyd-county-virginia-land-for-sale/pid/412345678"),
    ).toEqual({ kind: "address", site: "LandWatch", query: "Floyd County, Virginia", precision: "county" });
    expect(
      readListingUrl(
        "https://www.landsofamerica.com/property/43-acres-in-ashe-county-north-carolina/12345678",
      ),
    ).toEqual({
      kind: "address",
      site: "Lands of America",
      query: "Ashe County, North Carolina",
      precision: "county",
    });
    expect(
      readListingUrl("https://www.land.com/property/12-acres-in-johnson-county-tennessee/1"),
    ).toMatchObject({
      site: "Land.com",
      query: "Johnson County, Tennessee",
    });
    // A road at the zoom the parcel outlines appear from, so the parcel can be tapped.
    expect(PRECISION_ZOOM).toEqual({ street: 15, road: 14, county: 10 });
  });

  it("other links can't be read; text that isn't a link is left to the search", () => {
    expect(readListingUrl("https://www.zillow.com/homes/for_sale/")).toEqual({ kind: "unreadable" });
    expect(readListingUrl("https://example.com/listing/123")).toEqual({ kind: "unreadable" });
    expect(readListingUrl("www.landwatch.com/search")).toEqual({ kind: "unreadable" });
    for (const t of ["Floyd", "52-47A", "36.887, -80.454", "", "zillow listing"])
      expect(readListingUrl(t), t).toEqual({ kind: "notUrl" });
  });

  it("a stored link is a link only when it's http or https", () => {
    expect(safeListingHref("https://www.redfin.com/VA/Floyd/x/home/1")).toBe(
      "https://www.redfin.com/VA/Floyd/x/home/1",
    );
    expect(safeListingHref("javascript:alert(1)")).toBeNull();
    expect(safeListingHref("redfin listing")).toBeNull();
  });
});
