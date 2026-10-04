import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { createHttpClient, type HttpClient } from "../http";
import { arcQuery } from "./arcgis";
import { DEFAULT_ENDPOINTS } from "./config";

const respond = (body: string, status = 200): HttpClient => ({
  fetch: async () => new Response(body, { status }),
});

describe.each(FIXTURE_SLUGS)("arcQuery replaying the prototype's queries (%s)", (slug) => {
  const fx = loadFixture(slug);
  const parcel = polygon(fx.input.polygon.geometry.coordinates);
  const http = createHttpClient({ env: "node", fetchImpl: fx.replayFetch() });
  const recordedCount = (re: RegExp) =>
    (
      JSON.parse(fx.har.log.entries.find((e) => re.test(e.request.url))!.response.content.text!) as {
        features: unknown[];
      }
    ).features.length;

  it("FEMA NFHL flood zones (same request, same features)", async () => {
    const feats = await arcQuery(
      DEFAULT_ENDPOINTS.nfhl,
      parcel,
      { outFields: "FLD_ZONE,SFHA_TF,ZONE_SUBTY" },
      { http },
    );
    expect(feats.length).toBe(recordedCount(/NFHL\/MapServer\/28/));
    expect(feats.every((f) => (f.properties as { FLD_ZONE?: string }).FLD_ZONE)).toBe(true);
  });

  it("PAD-US within 1,600 m (same request, same features)", async () => {
    const feats = await arcQuery(
      DEFAULT_ENDPOINTS.padus[0]!,
      parcel,
      {
        distance: 1600,
        units: "esriSRUnit_Meter",
        outFields: "Unit_Nm,Mang_Name,Mang_Type,Pub_Access,GAP_Sts,Des_Tp",
      },
      { http },
    );
    expect(feats.length).toBe(recordedCount(/Fee_Managers_PADUS/));
  });
});

describe("arcQuery errors (the prototype's messages)", () => {
  const parcel = polygon([
    [
      [-80.5, 36.9],
      [-80.49, 36.9],
      [-80.49, 36.91],
      [-80.5, 36.9],
    ],
  ]);

  it("an HTTP error carries the service path, status and a tag-stripped body excerpt", async () => {
    const http = respond("<html><body><h1>Service   Unavailable</h1></body></html>", 503);
    await expect(arcQuery(DEFAULT_ENDPOINTS.nfhl, parcel, {}, { http })).rejects.toThrow(
      // Verbatim: tags become spaces and the excerpt isn't trimmed, hence the double space.
      /^public\/NFHL\/MapServer\/28 503: {2}Service Unavailable $/,
    );
  });

  it("an ArcGIS error inside a 200 response is an error too (FEMA's glitch during recording)", async () => {
    const http = respond(
      JSON.stringify({
        error: {
          code: 400,
          message: "Invalid or missing input parameters.",
          details: ["The provided output spatial reference is not supported with geoJSON format."],
        },
      }),
    );
    await expect(arcQuery(DEFAULT_ENDPOINTS.nfhl, parcel, {}, { http })).rejects.toThrow(
      "public/NFHL/MapServer/28: Invalid or missing input parameters.",
    );
  });

  it("no features is an empty list, not an error", async () => {
    await expect(arcQuery(DEFAULT_ENDPOINTS.nfhl, parcel, {}, { http: respond("{}") })).resolves.toEqual([]);
  });
});
