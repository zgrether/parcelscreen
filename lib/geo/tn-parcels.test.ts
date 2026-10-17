/**
 * Tennessee's parcel service (step 2, PR 2; docs/plans/step-2-tennessee.md §1): the Comptroller's public-use layer,
 * replayed from a Carter County recording (test/support/tnCarter.ts, `pnpm record:tn`). A parcel is its GISLINK; a
 * tap takes every polygon with it as one record; railroad and conflict polygons are never lines or taps, and a
 * conflict touching a parcel is named on its facts card; parcel numbers are searched in the tax card's form.
 */
import { polygon } from "@turf/turf";
import { beforeAll, describe, expect, it } from "vitest";
import {
  carterReplay,
  carterSamples,
  CONFLICT_GISLINK,
  TN_SOURCE,
  TWO_PIECE_GISLINK,
} from "@/test/support/tnCarter";
import { ownRecordsCountyAt } from "./ownRecords";
import { fieldsFor, stateOf, whereFor, whereParam } from "./parcelFields";
import { conflictTouches } from "./parcelTiles";
import { parcelFacts } from "./parcels";
import { pieceDedupeKey } from "./recipe";

const VA =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";

let got: Awaited<ReturnType<typeof carterSamples>>;
beforeAll(async () => {
  got = await carterSamples(carterReplay());
});

describe("the service (§1.1)", () => {
  it("is Tennessee's, found by its URL on a shared ArcGIS host; VA and NC are asked as before", () => {
    expect(stateOf(TN_SOURCE)).toBe("TN");
    expect(
      stateOf("https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Other/FeatureServer/0"),
    ).toBe(null);
    expect(fieldsFor(TN_SOURCE)).toMatchObject({ oid: "OBJECTID", id: "GISLINK", county: "COUNTY_NAME" });
    expect(whereParam(TN_SOURCE)).toEqual({ where: "PARCEL_TYPE NOT IN (4,5)" });
    expect(whereParam(VA)).toEqual({});
    expect(whereFor(VA, "A=1")).toBe("A=1");
  });

  it("a tile's outlines and its count leave railroads and conflicts out", () => {
    expect(got.tile.complete).toBe(true);
    expect(got.tile.lines.length).toBeGreaterThan(50);
    for (const l of got.tile.lines) expect(l.feature.properties?.GISLINK).toMatch(/^010/);
    expect(got.count).toBe(90);
  });

  it("a point inside a conflict polygon picks nothing: no parcel lies there", () => {
    expect(got.picked.parcel).toBeNull();
  });
});

describe("a record (§1.2)", () => {
  it("is named by its tax card, keyed by GISLINK, with its deeded acres and the state's record link", () => {
    const f = parcelFacts(got.conflict.geo, got.conflict.props);
    expect(f.parcelId).toBe("066 037.00");
    expect(f.keyId).toBe(CONFLICT_GISLINK);
    expect(f.county).toBe("Carter");
    expect(f.deededAcres).toBe(67.18);
    expect(f.countyRecordUrl).toMatch(
      /^https:\/\/assessment\.cot\.tn\.gov\/TPAD\/Parcel\/GIS\?gislink=010066/,
    );
    // Owner and address are asked for (shown live) but scrubbed from the recording.
    expect(f.owner).toBe("[redacted]");
    expect(pieceDedupeKey(got.conflict)).toBe(`TN:carter:${CONFLICT_GISLINK}`);
  });

  it("a parcel drawn as two polygons is one record with both as parts", () => {
    expect(got.twoPiece.multiPart).toBe(true);
    expect(got.twoPiece.parts).toHaveLength(2);
    expect(got.twoPiece.geo).toBe(got.twoPiece.parts![0]);
    const f = parcelFacts(got.twoPiece.geo, got.twoPiece.props);
    expect(f.parcelId).toBe("083 080.00");
    expect(f.deededAcres).toBe(45.75);
    expect(f.boundaryConflict).toBe(false);
    expect(pieceDedupeKey(got.twoPiece)).toBe(`TN:carter:${TWO_PIECE_GISLINK}`);
  });

  it("a conflict polygon touching the parcel is named; none near the two-piece parcel", () => {
    expect(got.conflict.props.boundary_conflict).toBe(true);
    expect(got.twoPiece.props.boundary_conflict).toBeUndefined();
  });
});

describe("conflictTouches", () => {
  const sq = (x0: number, y0: number, d: number) =>
    polygon([
      [
        [x0, y0],
        [x0 + d, y0],
        [x0 + d, y0 + d],
        [x0, y0 + d],
        [x0, y0],
      ],
    ]);
  const parcel = sq(-82, 36, 0.001);
  it("an overlap or a shared edge touches; a corner within 1 m does; 10 m away doesn't", () => {
    expect(conflictTouches(sq(-81.9995, 36.0005, 0.001), parcel)).toBe(true);
    expect(conflictTouches(sq(-81.999, 36, 0.001), parcel)).toBe(true); // shares the east edge
    expect(conflictTouches(sq(-81.999 + 0.000005, 36, 0.001), parcel)).toBe(true); // about 0.45 m off
    expect(conflictTouches(sq(-81.999 + 0.00011, 36, 0.001), parcel)).toBe(false); // about 10 m off
  });
});

describe("parcel-number search (§1.2): the tax card's form", () => {
  it("finds map 066's parcels starting 037 from '66 37', named as the tax card reads", () => {
    expect(got.search.map((h) => h.id)).toEqual(["066 037.00", "066 037.01", "066 037.02"]);
    expect(got.search[0]!.county).toBe("Carter");
    expect(got.search[0]!.props.GISLINK).toBe(CONFLICT_GISLINK);
  });

  it("lists a two-polygon parcel once", () => {
    expect(got.searchTwoPiece.map((h) => h.id)).toEqual(["083 080.00"]);
  });
});

describe("the nine counties with no state lines (§6.4)", () => {
  it("Knoxville is in Knox County; Roan Mountain and Elizabethton aren't in any of them", () => {
    expect(ownRecordsCountyAt([35.9606, -83.9207])).toBe("Knox");
    expect(ownRecordsCountyAt([36.1627, -86.7816])).toBe("Davidson");
    expect(ownRecordsCountyAt([36.196, -82.072])).toBeNull();
    expect(ownRecordsCountyAt([36.3487, -82.2107])).toBeNull();
  });
});
