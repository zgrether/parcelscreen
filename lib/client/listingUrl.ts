/**
 * The address in a listing's link (WF1, docs/plans/parcel-workflow.md §2), read from the URL's path only: the listing
 * page is never fetched (no scraping), and only the address read here is geocoded, never the URL. Pure.
 *
 * Good enough to centre the map, not to pick the parcel: vacant land is often "0 Ferney Creek Rd", "Lot 7 Ridge Rd" or
 * "TBD Mud Creek Ln", which places it on a road that may run for miles, and the land sites give only the county.
 */
import { LINES_MIN_ZOOM } from "@/lib/geo/parcelTiles";

export type ListingSite = "Zillow" | "Redfin" | "Realtor.com" | "LandWatch" | "Lands of America" | "Land.com";

/**
 * How closely the address places the parcel, and the zoom that shows it. A road is shown at the zoom the parcel
 * outlines appear from, so the parcel can be tapped there; a county can only be zoomed into.
 */
export type ListingPrecision = "street" | "road" | "county";
export const PRECISION_ZOOM: Record<ListingPrecision, number> = {
  street: 15,
  road: LINES_MIN_ZOOM,
  county: 10,
};

export type ListingRead =
  /** Not a link: the search goes on as usual. */
  | { kind: "notUrl" }
  /** A link without an address the app can read. */
  | { kind: "unreadable" }
  | { kind: "address"; site: ListingSite; query: string; precision: ListingPrecision };

const STATES: Record<string, string> = {
  alabama: "AL",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new-hampshire": "NH",
  "new-jersey": "NJ",
  "new-mexico": "NM",
  "new-york": "NY",
  "north-carolina": "NC",
  "north-dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode-island": "RI",
  "south-carolina": "SC",
  "south-dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west-virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const words = (slug: string) => decodeURIComponent(slug).replace(/[-+]+/g, " ").trim();
const title = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * A street that places the parcel: a real house number gives "street"; "0", "Lot 7", "Tract B", "TBD" or no number
 * gives "road", with that lead dropped so the road itself is found.
 */
function street(s: string): { text: string; precision: "street" | "road" } {
  const lead = /^(0+|lots?\s+\S+|tracts?\s+\S+|tbd|parcel\s+\S+)\s+/i.exec(s);
  if (lead) return { text: s.slice(lead[0].length), precision: "road" };
  return { text: s, precision: /^\d+[a-z]?\s/i.test(s) ? "street" : "road" };
}

/** "floyd-county-virginia" → "Floyd County, Virginia" (the state as the last words that name one). */
function county(slug: string): string | null {
  const m = /^(.+)-county-([a-z-]+)$/.exec(slug.toLowerCase());
  if (!m || !STATES[m[2]!]) return null;
  return `${title(words(m[1]!))} County, ${title(words(m[2]!))}`;
}

export function readListingUrl(text: string): ListingRead {
  const t = text.trim();
  if (!/^(https?:\/\/|www\.)\S+$/i.test(t)) return { kind: "notUrl" };
  let url: URL;
  try {
    url = new URL(/^https?:/i.test(t) ? t : `https://${t}`);
  } catch {
    return { kind: "unreadable" };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const address = (site: ListingSite, s: string, rest: string): ListingRead => {
    const st = street(s);
    return {
      kind: "address",
      site,
      query: [st.text, rest].filter(Boolean).join(", "),
      precision: st.precision,
    };
  };

  if (host === "zillow.com" && parts[0] === "homedetails" && parts[1]) {
    // 123-Ferney-Creek-Rd-Floyd-VA-24091: the town can't be told from the street, so it all goes to the geocoder.
    const m = /^(.*)-([A-Z]{2})-(\d{5})$/.exec(parts[1]);
    if (!m) return { kind: "unreadable" };
    return address("Zillow", words(m[1]!), `${m[2]} ${m[3]}`);
  }
  if (host === "redfin.com" && parts.length >= 4 && parts[3] === "home" && /^[A-Z]{2}$/.test(parts[0]!)) {
    // /VA/Floyd/123-Ferney-Creek-Rd-24091/home/12345678
    const m = /^(.*)-(\d{5})$/.exec(parts[2]!);
    if (!m) return { kind: "unreadable" };
    return address("Redfin", words(m[1]!), `${words(parts[1]!)}, ${parts[0]} ${m[2]}`);
  }
  if (host === "realtor.com" && parts[0] === "realestateandhomes-detail" && parts[1]) {
    // 123-Ferney-Creek-Rd_Floyd_VA_24091_M12345-67890 (the street may be missing)
    const f = parts[1].split("_");
    const zip = f.findIndex((x) => /^\d{5}$/.test(x));
    if (zip < 2 || !/^[A-Z]{2}$/.test(f[zip - 1]!)) return { kind: "unreadable" };
    const town = words(f[zip - 2]!);
    const rest = `${town}, ${f[zip - 1]} ${f[zip]}`;
    return zip >= 3 ? address("Realtor.com", words(f[zip - 3]!), rest) : address("Realtor.com", "", rest);
  }
  const land: Partial<Record<string, ListingSite>> = {
    "landwatch.com": "LandWatch",
    "landsofamerica.com": "Lands of America",
    "land.com": "Land.com",
  };
  const site = land[host];
  if (site) {
    // /floyd-county-virginia-land-for-sale/pid/412345678 or /property/43-acres-in-floyd-county-virginia/12345678
    for (const p of parts) {
      const slug =
        /^(.+-county-[a-z-]+?)-land-for-sale$/.exec(p)?.[1] ?? /-in-(.+-county-[a-z-]+)$/.exec(p)?.[1];
      const c = slug && county(slug);
      if (c) return { kind: "address", site, query: c, precision: "county" };
    }
  }
  return { kind: "unreadable" };
}

/** The listing's link as a link, only when it's http or https (a stored "javascript:" never becomes one). */
export function safeListingHref(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
