/**
 * Records the map search's region-wide ask for Roan's tax-card number (UX part 2 PR 4: search looks across the region,
 * not the counties in view) and appends it to Roan's recording, as the e2e replays it. The answer's fields are the
 * parcel's numbers and county only: no owner or address. Run by hand, never in CI:
 *
 *   node test/tools/record-region-search.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { taxCardQuery, taxCardWhere, idPattern } from "../../lib/search/query.ts";
import { envelopeParams, REGION } from "../../lib/search/region.ts";

const HAR = "test/fixtures/roan-hwy-143-099-046-02/network-port.har";
const TN =
  "https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Property_Boundaries_Public_Use/FeatureServer/0";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const QUERY = "099 046.02";

if (!idPattern(QUERY)) throw new Error("not a parcel number");
const tc = taxCardQuery(QUERY)!;
// As lib/search/sources.ts byTaxCard asks it within the region (whereFor adds the service's own filter).
const body = new URLSearchParams({
  where: `(PARCEL_TYPE NOT IN (4,5)) AND (${taxCardWhere("COUNTY_NAME", null, tc)})`,
  outFields: ["OBJECTID", "GISLINK", "COUNTY_NAME", "CMAP", "GP", "PARCEL"].join(","),
  ...envelopeParams(REGION.bbox),
  returnGeometry: "true",
  outSR: "4326",
  maxAllowableOffset: "0.0002",
  geometryPrecision: "5",
  orderByFields: "GISLINK",
  resultRecordCount: "25",
  f: "geojson",
});
const url = `${TN}/query`;
const r = await fetch(url, {
  method: "POST",
  body,
  headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
});
const text = await r.text();
const parsed = JSON.parse(text) as { features?: { properties: Record<string, unknown> }[] };
console.log(
  r.status,
  (parsed.features ?? []).map((f) => [f.properties.COUNTY_NAME, f.properties.GISLINK]),
);
const DROP = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "date",
  "etag",
]);
const har = JSON.parse(readFileSync(HAR, "utf8"));
har.log.entries.push({
  startedDateTime: new Date().toISOString(),
  request: {
    method: "POST",
    url,
    headers: [
      { name: "content-type", value: "application/x-www-form-urlencoded" },
      { name: "user-agent", value: UA },
    ],
    postData: { mimeType: "application/x-www-form-urlencoded", text: body.toString() },
  },
  response: {
    status: r.status,
    statusText: r.statusText,
    headers: [...r.headers]
      .filter(([n]) => !DROP.has(n.toLowerCase()))
      .map(([name, value]) => ({ name, value })),
    content: { mimeType: r.headers.get("content-type") ?? "application/json", text },
  },
});
// The recording is one line, with no newline at the end: appended, the rest stays byte for byte.
writeFileSync(HAR, JSON.stringify(har));
console.log("appended to", HAR);
