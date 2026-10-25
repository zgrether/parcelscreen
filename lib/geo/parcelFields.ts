/**
 * What each state parcel service calls the fields the app reads (checked 2026-10-06; record fields 2026-10-09;
 * Tennessee's public-use layer 2026-10-17, step 2). The outlines carry three (`oid`, `id`, `county`); a parcel's full
 * record asks for `record`, the fields parcelFacts, the recipe's dedupe key and the outlines read, and no others
 * (owner, #89 pre-flight review): the services also hold mailing addresses, second owners, sale and tax data, which
 * the app never shows.
 *
 * A service is matched by URL prefix, not host: Tennessee's layer is on a shared ArcGIS Online host
 * (services1.arcgis.com), which also serves the state's trails and parks.
 */
export type StateCode = "VA" | "NC" | "TN";

export interface ServiceFields {
  oid: string;
  id: string;
  county: string;
  maxRecords: number;
  /** The full record's `outFields`; null asks for every field (an unknown service, whose names aren't known). */
  record: readonly string[] | null;
  /** Outlines, taps and counts ask only for features matching this (Tennessee: no railroad or conflict polygons). */
  where?: string;
  /**
   * A parcel can be several features sharing its `id` (Tennessee: a tract split by a road, drawn as two polygons
   * with the same record). A tap on either takes them all, as one multi-part record.
   */
  groupById?: true;
  /** Polygons the county map marks as a boundary conflict: kept out of taps, named on a parcel they overlap. */
  conflictWhere?: string;
  /** How parcel numbers are searched: by the id's prefix (VA, NC), or by control map, group and parcel (TN). */
  search: "idPrefix" | "mapGroupParcel";
  /**
   * A second number the county's listings use, searched beside `id` (the UX audit's B-3): Virginia's tax map number
   * (PTM_ID, "63-A-62" for Grayson's record 6273).
   */
  altId?: string;
  /** The county's name, where `county` is a code (Virginia's and North Carolina's FIPS): what a search hit shows. */
  countyName?: string;
}

interface ParcelService {
  /** A service URL starting with this is this service. */
  prefix: string;
  state: StateCode;
  fields: ServiceFields;
}

const SERVICES: readonly ParcelService[] = [
  // parcelFacts: owner ownname, parcel ID parno, site address siteadd, county cntyname; dedupe stcntyfips.
  {
    prefix: "https://services.nconemap.gov/",
    state: "NC",
    fields: {
      oid: "objectid",
      id: "parno",
      county: "stcntyfips",
      maxRecords: 5000,
      record: ["objectid", "parno", "ownname", "siteadd", "cntyname", "stcntyfips"],
      search: "idPrefix",
      countyName: "cntyname",
    },
  },
  // No owner or address fields on VGIN's layer; county name LOCALITY, dedupe FIPS.
  {
    prefix: "https://vginmaps.vdem.virginia.gov/",
    state: "VA",
    fields: {
      oid: "OBJECTID",
      id: "PARCELID",
      county: "FIPS",
      maxRecords: 2000,
      record: ["OBJECTID", "PARCELID", "FIPS", "LOCALITY"],
      search: "idPrefix",
      altId: "PTM_ID",
      countyName: "LOCALITY",
    },
  },
  // The Comptroller's public-use layer (step 2 plan §1). GISLINK is the parcel (county, control map, group, parcel),
  // stable across tax years: PARCELID ends in the tax year, so it isn't asked for. parcelFacts shows the tax-card
  // form from CMAP, GP and PARCEL; deeded acres DEEDAC; the state's assessment record LINK_TPAD. PARCEL_TYPE 4 is
  // railroad right-of-way and 5 a parcel conflict (the layer's own types).
  {
    prefix:
      "https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Property_Boundaries_Public_Use/",
    state: "TN",
    fields: {
      oid: "OBJECTID",
      id: "GISLINK",
      county: "COUNTY_NAME",
      maxRecords: 2000,
      record: [
        "OBJECTID",
        "GISLINK",
        "COUNTY_NAME",
        "CMAP",
        "GP",
        "PARCEL",
        "OWNER",
        "ADDRESS",
        "DEEDAC",
        "LINK_TPAD",
      ],
      where: "PARCEL_TYPE NOT IN (4,5)",
      groupById: true,
      conflictWhere: "PARCEL_TYPE=5",
      search: "mapGroupParcel",
    },
  },
];

/** An unknown service gets the ArcGIS defaults, and every field of a full record. */
const DEFAULT_FIELDS: ServiceFields = {
  oid: "OBJECTID",
  id: "PARCELID",
  county: "COUNTY",
  maxRecords: 1000,
  record: null,
  search: "idPrefix",
};

const serviceOf = (serviceUrl: string): ParcelService | undefined =>
  SERVICES.find((s) => serviceUrl.startsWith(s.prefix));

export const fieldsFor = (serviceUrl: string): ServiceFields =>
  serviceOf(serviceUrl)?.fields ?? DEFAULT_FIELDS;

/**
 * A county record's service: by its URL, or for a record kept without one (a parcel imported from a file has the source
 * "saved"), the service whose record fields it carries. Undefined for a drawn boundary.
 */
export const serviceOfRecord = (r: {
  source: string;
  props: Record<string, unknown>;
}): { state: StateCode; fields: ServiceFields } | undefined =>
  serviceOf(r.source) ?? SERVICES.find((s) => s.fields.record?.every((k) => k in r.props));

/** The state a county record comes from, by its parcel service; null for anything else (drawn, an edited URL). */
export const stateOf = (serviceUrl: string): StateCode | null => serviceOf(serviceUrl)?.state ?? null;

/** The where clause for a service's outlines, taps and counts, with `also` when given. */
export function whereFor(serviceUrl: string, also?: string): string {
  const own = fieldsFor(serviceUrl).where;
  if (own && also) return `(${own}) AND (${also})`;
  return own ?? also ?? "1=1";
}

/**
 * The `where` parameter for a spatial query: the service's own filter, or nothing (VA and NC are asked as they were
 * before step 2, so their recorded requests still match).
 */
export const whereParam = (serviceUrl: string): { where?: string } => {
  const own = fieldsFor(serviceUrl).where;
  return own ? { where: own } : {};
};

/**
 * A feature that isn't a parcel record: its parcel ID is blank or "0". VGIN keeps the unparceled land of a county
 * (roads, water, gaps between records) as one such feature: Grayson's is PARCELID "0", 61 parts and 14,126
 * vertices around Whitetop. Drawn as an outline it could be tapped, and joining its parts never finished (owner's
 * bug report, 2026-10-11). It's dropped wherever a service's features come in.
 */
export function isPlaceholderRecord(
  serviceUrl: string,
  props: Record<string, unknown> | null | undefined,
): boolean {
  const id = props?.[fieldsFor(serviceUrl).id];
  return id == null || /^\s*0*\s*$/.test(String(id));
}

/** A full record's `outFields` for a service. */
export const recordOutFields = (serviceUrl: string): string => fieldsFor(serviceUrl).record?.join(",") ?? "*";

/** ArcGIS SQL string literal. */
export const sqlString = (s: string): string => `'${s.replace(/'/g, "''")}'`;
