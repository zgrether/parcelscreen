/**
 * Recordings keep cookies, auth headers and parcel owners out of the repo (owner, #89 pre-flight review), and the
 * app asks the parcel services only for the fields it reads.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fieldsFor, recordOutFields } from "@/lib/geo/parcelFields";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { FIXTURE_SLUGS } from "./fixtures";
import { portHarPath } from "./portHar";
import type { HarEntry } from "./replayFetch";
import { OWNER_FIELD, PARCEL_HOSTS, scrubEntry } from "./scrubHar";

const NC = DEFAULT_ENDPOINTS.parcels[0]!;
const PADUS =
  "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/Fee_Managers_PADUS/FeatureServer/0";

const entry = (url: string, body: unknown, encoding?: "base64"): HarEntry =>
  ({
    startedDateTime: "2026-10-09T00:00:00Z",
    request: {
      method: "GET",
      url: `${url}/query?f=geojson`,
      headers: [
        { name: "Cookie", value: "a=1" },
        { name: "Authorization", value: "Bearer x" },
        { name: "Accept", value: "*/*" },
      ],
      cookies: [{ name: "a", value: "1" }],
    },
    response: {
      status: 200,
      statusText: "",
      headers: [
        { name: "set-cookie", value: "AWSALB=xyz" },
        { name: "content-type", value: "application/json" },
      ],
      cookies: [{ name: "AWSALB", value: "xyz" }],
      content: {
        size: 0,
        mimeType: "application/json",
        text: encoding ? Buffer.from(JSON.stringify(body)).toString("base64") : JSON.stringify(body),
        ...(encoding ? { encoding } : {}),
      },
    },
  }) as HarEntry;

const body = (e: HarEntry) =>
  JSON.parse(
    e.response.content.encoding === "base64"
      ? Buffer.from(e.response.content.text!, "base64").toString()
      : e.response.content.text!,
  );

describe("scrubHar", () => {
  it("knows the app's parcel services", () => {
    expect([...PARCEL_HOSTS].sort()).toEqual(DEFAULT_ENDPOINTS.parcels.map((u) => new URL(u).host).sort());
  });

  it("drops cookies and auth headers both ways, and HAR cookie lists", () => {
    const { entry: e, headers } = scrubEntry(entry(PADUS, { features: [] }));
    expect(e.request.headers.map((h) => h.name)).toEqual(["Accept"]);
    expect(e.response.headers.map((h) => h.name)).toEqual(["content-type"]);
    expect("cookies" in e.request || "cookies" in e.response).toBe(false);
    expect(headers).toBe(3);
  });

  it.each([undefined, "base64"] as const)(
    "redacts owner, mailing and site-address fields in a parcel answer (%s), and keeps the rest",
    (enc) => {
      const props = {
        objectid: 1,
        parno: "123",
        ownname: "A PERSON",
        ownname2: "B PERSON",
        mailadd: "1 MAIN ST",
        mcity: "TOWN",
        mzip: "27000",
        siteadd: "2 RIDGE RD",
        cntyname: "Ashe",
        stcntyfips: "37009",
        gisacres: 30,
      };
      const { entry: e, fields } = scrubEntry(entry(NC, { features: [{ properties: props }] }, enc));
      const kept = body(e).features[0].properties;
      expect(kept).toEqual({
        ...props,
        ownname: "[redacted]",
        ownname2: "[redacted]",
        mailadd: "[redacted]",
        mcity: "[redacted]",
        mzip: "[redacted]",
        siteadd: "[redacted]",
      });
      expect(fields).toBe(6);
      expect(e.response.content.encoding).toBe(enc);
    },
  );

  it("leaves other services' answers alone (PAD-US's Own_Type is public land, not a person)", () => {
    const answer = { features: [{ properties: { Own_Type: "FED", Mang_Name: "USFS" } }] };
    expect(body(scrubEntry(entry(PADUS, answer)).entry)).toEqual(answer);
  });

  it("matches the state services' owner and address names, not the fields the app keeps", () => {
    for (const k of [
      "ownname",
      "OWNER",
      "OWNER2",
      "OWNJAN1",
      "mailadd",
      "maddstname",
      "siteadd",
      "ADDRESS",
      "ST_NUM",
    ])
      expect(OWNER_FIELD.test(k), k).toBe(true);
    for (const k of ["objectid", "parno", "PARCELID", "FIPS", "LOCALITY", "cntyname", "COUNTY", "stcntyfips"])
      expect(OWNER_FIELD.test(k), k).toBe(false);
  });

  it.each(FIXTURE_SLUGS)("%s: the committed port recording is scrubbed", (slug) => {
    const path = portHarPath(slug);
    if (!existsSync(path)) return;
    const har = JSON.parse(readFileSync(path, "utf8")) as { log: { entries: HarEntry[] } };
    for (const e of har.log.entries) {
      const { headers, fields } = scrubEntry(e);
      expect(headers + fields, e.request.url).toBe(0);
    }
  });
});

describe("the parcel services are asked for the fields the app reads", () => {
  it.each([
    [DEFAULT_ENDPOINTS.parcels[0]!, "objectid,parno,ownname,siteadd,cntyname,stcntyfips"],
    [DEFAULT_ENDPOINTS.parcels[1]!, "OBJECTID,PARCELID,FIPS,LOCALITY"],
    [DEFAULT_ENDPOINTS.parcels[2]!, "OBJECTID,PARCELID,OWNER,ADDRESS,COUNTY"],
    ["https://example.org/arcgis/rest/services/Parcels/FeatureServer/0", "*"],
  ])("%s", (url, want) => {
    expect(recordOutFields(url)).toBe(want);
    const f = fieldsFor(url);
    // The outlines' three fields are always among the record's.
    if (f.record) for (const k of [f.oid, f.id, f.county]) expect(f.record).toContain(k);
  });
});
