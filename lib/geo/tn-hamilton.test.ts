/**
 * Hamilton County's own parcel service (the Tennessee counties mission, docs/plans/tn-counties.md): asked only over
 * Hamilton, read as the state's layer is read (tax card, GISLINK, county, the assessor's card), and named when it's
 * down. The other own-records counties have no source: the map names them and offers Draw.
 */
import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { taxCardQuery, taxCardWhere } from "@/lib/search/query";
import { isOwnRecordsHint, ownRecordsHint, servesBounds, servesPoint, uncoveredCountyAt } from "./ownRecords";
import { askFields, fieldsFor, stateOf, withCounty } from "./parcelFields";
import { parcelFacts } from "./parcels";
import { pieceDedupeKey } from "./recipe";
import { serviceDownMessage } from "./serviceStatus";

const HAMILTON = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("hamiltontn.gov"))!;
const TN = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("Tennessee_Property_Boundaries"))!;

/** Near Three Gorges Farms, Soddy-Daisy (tn-counties.md §0). */
const SODDY_DAISY: [number, number] = [35.2944, -85.2103];
const ROAN: [number, number] = [36.196, -82.072];
const KNOXVILLE: [number, number] = [35.9606, -83.9207];

describe("the service", () => {
  it("is Tennessee's, Hamilton's only, plain parcels only", () => {
    expect(stateOf(HAMILTON)).toBe("TN");
    expect(fieldsFor(HAMILTON)).toMatchObject({
      oid: "OBJECTID",
      id: "GISLINK",
      onlyCounty: "Hamilton",
      where: "PARCEL_TYP=1",
      search: "mapGroupParcel",
    });
  });

  it("isn't asked for a county field it doesn't have; its features are given Hamilton's name", () => {
    const f = fieldsFor(HAMILTON);
    expect(askFields(HAMILTON, [f.oid, f.id, f.county])).toBe("OBJECTID,GISLINK");
    expect(askFields(TN, ["OBJECTID", "GISLINK", "COUNTY_NAME"])).toBe("OBJECTID,GISLINK,COUNTY_NAME");
    expect(withCounty(HAMILTON, { OBJECTID: 1 })).toEqual({ OBJECTID: 1, COUNTY_NAME: "Hamilton" });
    expect(withCounty(TN, { COUNTY_NAME: "Carter" })).toEqual({ COUNTY_NAME: "Carter" });
  });

  it("is asked only over Hamilton; the others everywhere", () => {
    expect(servesPoint(HAMILTON, SODDY_DAISY)).toBe(true);
    expect(servesPoint(HAMILTON, ROAN)).toBe(false);
    expect(servesPoint(HAMILTON, KNOXVILLE)).toBe(false);
    expect(servesPoint(TN, ROAN)).toBe(true);
    const box = (lat: number, lon: number) => ({
      west: lon - 0.01,
      east: lon + 0.01,
      south: lat - 0.01,
      north: lat + 0.01,
    });
    expect(servesBounds(HAMILTON, box(...SODDY_DAISY))).toBe(true);
    expect(servesBounds(HAMILTON, box(...ROAN))).toBe(false);
    expect(servesBounds(TN, box(...ROAN))).toBe(true);
  });

  it("is named by its county when it's down", () => {
    expect(serviceDownMessage(HAMILTON)).toMatch(/^Hamilton County parcel service isn't responding/);
    expect(serviceDownMessage(TN)).toMatch(/^Tennessee parcel service isn't responding/);
  });
});

describe("a record", () => {
  const props = withCounty(HAMILTON, {
    OBJECTID: 8192,
    GISLINK: "033048 04524",
    MAP: "048",
    GROUP_: " ",
    PARCEL: "045.24",
    OWNERNAME1: "[redacted]",
    ADDRESS: "[redacted]",
    RecordsOnl: "https://assessor.hamiltontn.gov/card/048_045.24",
  });
  const geo = polygon([
    [
      [-85.211, 35.294],
      [-85.21, 35.294],
      [-85.21, 35.295],
      [-85.211, 35.295],
      [-85.211, 35.294],
    ],
  ]);

  it("reads as the state's: its tax card, GISLINK, county and the assessor's card", () => {
    const f = parcelFacts(geo, props);
    expect(f.parcelId).toBe("048 045.24");
    expect(f.keyId).toBe("033048 04524");
    expect(f.county).toBe("Hamilton");
    expect(f.countyRecordUrl).toBe("https://assessor.hamiltontn.gov/card/048_045.24");
    expect(f.deededAcres).toBeNull();
  });

  it("is keyed as a Hamilton parcel", () => {
    expect(pieceDedupeKey({ geo, props, source: HAMILTON, multiPart: false })).toBe(
      "TN:hamilton:033048 04524",
    );
  });

  it("links no card from anywhere else", () => {
    const f = parcelFacts(geo, { ...props, RecordsOnl: "https://example.com/card" });
    expect(f.countyRecordUrl).toBeNull();
  });

  it("is searched by MAP, GROUP_ and PARCEL, with no county clause", () => {
    const f = fieldsFor(HAMILTON);
    expect(taxCardWhere(null, null, taxCardQuery("48 45.24")!, f.taxCard)).toBe(
      "MAP='048' AND PARCEL LIKE '045.24%'",
    );
    expect(taxCardWhere(null, "Hamilton", taxCardQuery("110H D 42")!, f.taxCard)).toBe(
      "MAP='110H' AND GROUP_='D' AND PARCEL LIKE '042%'",
    );
  });
});

describe("the own-records counties with no source", () => {
  it("are named over their county; Hamilton isn't one any more", () => {
    expect(uncoveredCountyAt(KNOXVILLE, DEFAULT_ENDPOINTS.parcels)).toBe("Knox");
    expect(uncoveredCountyAt(SODDY_DAISY, DEFAULT_ENDPOINTS.parcels)).toBeNull();
    // Without Hamilton's service, it's one again.
    expect(uncoveredCountyAt(SODDY_DAISY, [TN])).toBe("Hamilton");
    expect(uncoveredCountyAt(ROAN, DEFAULT_ENDPOINTS.parcels)).toBeNull();
  });

  it("are named in the hint, which suggests Draw a custom parcel", () => {
    const h = ownRecordsHint("Knox");
    expect(h).toBe("No parcel lines in Knox County: it keeps its own records. Draw a custom parcel?");
    expect(isOwnRecordsHint(h)).toBe(true);
    expect(isOwnRecordsHint("Dense area — zoom in to see all parcel lines")).toBe(false);
  });
});
