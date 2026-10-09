/**
 * What each state parcel service calls the fields the app reads (checked 2026-10-06; record fields 2026-10-09).
 * The outlines carry three (`oid`, `id`, `county`); a parcel's full record asks for `record`, the fields
 * parcelFacts, the recipe's dedupe key and the outlines read, and no others (owner, #89 pre-flight review): the
 * services also hold mailing addresses, second owners, sale and tax data, which the app never shows.
 */
export interface ServiceFields {
  oid: string;
  id: string;
  county: string;
  maxRecords: number;
  /** The full record's `outFields`; null asks for every field (an unknown service, whose names aren't known). */
  record: readonly string[] | null;
}

const FIELDS_BY_HOST: Record<string, ServiceFields> = {
  // parcelFacts: owner ownname, parcel ID parno, site address siteadd, county cntyname; dedupe stcntyfips.
  "services.nconemap.gov": {
    oid: "objectid",
    id: "parno",
    county: "stcntyfips",
    maxRecords: 5000,
    record: ["objectid", "parno", "ownname", "siteadd", "cntyname", "stcntyfips"],
  },
  // No owner or address fields on VGIN's layer; county name LOCALITY, dedupe FIPS.
  "vginmaps.vdem.virginia.gov": {
    oid: "OBJECTID",
    id: "PARCELID",
    county: "FIPS",
    maxRecords: 2000,
    record: ["OBJECTID", "PARCELID", "FIPS", "LOCALITY"],
  },
  // parcelFacts: owner OWNER, parcel ID PARCELID, site address ADDRESS, county (and dedupe) COUNTY.
  "geoviewer.cot.tn.gov": {
    oid: "OBJECTID",
    id: "PARCELID",
    county: "COUNTY",
    maxRecords: 2000,
    record: ["OBJECTID", "PARCELID", "OWNER", "ADDRESS", "COUNTY"],
  },
};
/** An unknown service gets the ArcGIS defaults, and every field of a full record. */
const DEFAULT_FIELDS: ServiceFields = {
  oid: "OBJECTID",
  id: "PARCELID",
  county: "COUNTY",
  maxRecords: 1000,
  record: null,
};

export const fieldsFor = (serviceUrl: string): ServiceFields =>
  FIELDS_BY_HOST[/^https?:\/\/([^/]+)/.exec(serviceUrl)?.[1] ?? ""] ?? DEFAULT_FIELDS;

/** A full record's `outFields` for a service. */
export const recordOutFields = (serviceUrl: string): string => fieldsFor(serviceUrl).record?.join(",") ?? "*";
