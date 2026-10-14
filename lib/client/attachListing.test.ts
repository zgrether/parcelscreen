import { describe, expect, it } from "vitest";
import { county, T0 } from "@/test/support/parcels";
import { ATTACH_MS, attachLabel, attachPatch, offersListing, type SearchedListing } from "./attachListing";
import { plainParcel } from "./parcelStore";

const plain = () => plainParcel(county(-81.355, "52-47A"), T0);

const searched: SearchedListing = {
  url: "https://www.redfin.com/VA/Floyd/0-Ferney-Creek-Rd-24091/home/1",
  site: "Redfin",
  street: "0 Ferney Creek Rd",
  query: "Ferney Creek Rd, Floyd, VA 24091",
  afterSerial: 3,
};

describe("attaching a searched listing link (owner, #130)", () => {
  it("is offered to a parcel opened after the search, without a link of its own", () => {
    const p = plain();
    expect(offersListing(searched, p, 4)).toBe(true);
    expect(offersListing(searched, p, 3)).toBe(false); // the parcel open during the search
    expect(offersListing(searched, null, 4)).toBe(false);
    expect(offersListing(null, p, 4)).toBe(false);
    expect(offersListing(searched, { ...p, listingUrl: "https://x.test/other" }, 4)).toBe(false);
    expect(ATTACH_MS).toBe(30 * 60 * 1000);
  });

  it("says which listing; fills the link, and the name only when there's none", () => {
    expect(attachLabel(searched)).toBe("Attach Redfin listing (0 Ferney Creek Rd)");
    expect(
      attachLabel({ ...searched, site: "LandWatch", street: null, query: "Floyd County, Virginia" }),
    ).toBe("Attach LandWatch listing (Floyd County, Virginia)");
    expect(attachPatch(searched, plain())).toEqual({ listingUrl: searched.url, name: "0 Ferney Creek Rd" });
    expect(attachPatch(searched, { ...plain(), name: "Ferney Creek" })).toEqual({ listingUrl: searched.url });
    expect(attachPatch({ ...searched, street: null }, plain())).toEqual({ listingUrl: searched.url });
  });
});
