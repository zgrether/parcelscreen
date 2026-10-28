import { describe, expect, it } from "vitest";
import { polygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { tileOfBbox, tileUrl } from "../offline/tiles";
import { publicLandCard, unitLines, PUBLIC_LAND_WORDS as W } from "./card";
import { accessOf, accessStyle, categoryOf } from "./classify";
import { levelAt, parseTile, publicLandTemplate, type PadusUnit } from "./source";

/** Records as PAD-US 4.1's Manager Name layer returned them near Mud Creek and Pond Mountain (the step 16 probe). */
const unit = (p: Partial<PadusUnit>): PadusUnit => ({
  OBJECTID: 1,
  FeatClass: "Fee",
  Mang_Type: "UNK",
  Mang_Name: "UNK",
  Loc_Mang: "",
  Des_Tp: "UNK",
  Loc_Ds: "",
  Unit_Nm: "",
  Pub_Access: "UK",
  Src_Date: null,
  GIS_Acres: 0,
  EsmtHldr: null,
  ...p,
});
const JEFFERSON = unit({
  OBJECTID: 4500,
  Unit_Nm: "Jefferson National Forest",
  Mang_Type: "FED",
  Mang_Name: "USFS",
  Loc_Mang: "Forest Service Region 08 Southern",
  Des_Tp: "NF",
  Pub_Access: "OA",
  Src_Date: "2024/10/06",
  GIS_Acres: 711977,
});
const GRAYSON_HIGHLANDS = unit({
  Unit_Nm: "Grayson Highlands State Park",
  Mang_Type: "STAT",
  Mang_Name: "SDC",
  Loc_Mang: "VA Dept of Conservation and Recreation",
  Des_Tp: "SP",
  Pub_Access: "OA",
  Src_Date: "2016/06/15",
  GIS_Acres: 4476,
});
const GRAYSON_HIGHLANDS_UNK = unit({
  Unit_Nm: "Grayson Highlands State Park",
  Des_Tp: "SP",
  Pub_Access: "OA",
  GIS_Acres: 4476,
});
const OLD_FLAT = unit({
  Unit_Nm: "Old Flat State Forest",
  Des_Tp: "SRMA",
  Pub_Access: "OA",
  Mang_Name: "SDNR",
});
const POND_MOUNTAIN = unit({
  OBJECTID: 222108,
  Unit_Nm: "Pond Mountain Game Land",
  Des_Tp: "SOTH",
  Loc_Ds: "State Other",
  Pub_Access: "OA",
  Src_Date: "2021/01/26",
  GIS_Acres: 3619,
});
const NC_LWF = unit({
  Unit_Nm: "NC Land and Water Fund Project",
  Des_Tp: "SOTH",
  Pub_Access: "RA",
  GIS_Acres: 4135,
});
const PRESERVE = unit({
  Unit_Nm: "Conservation Fund Preserve",
  Mang_Type: "NGO",
  Mang_Name: "NGO",
  Loc_Mang: "The Conservation Fund",
  Des_Tp: "PCON",
  Pub_Access: "XA",
  GIS_Acres: 1410,
});
const EASEMENT = unit({
  FeatClass: "Easement",
  Unit_Nm: "Blue Ridge Conservancy Easement",
  Mang_Type: "NGO",
  Mang_Name: "NGO",
  Loc_Mang: "Blue Ridge Conservancy",
  Des_Tp: "CONE",
  EsmtHldr: "Blue Ridge Conservancy",
  Src_Date: "2019/05/16",
});
const PARKWAY = unit({ Unit_Nm: "Blue Ridge Parkway", Mang_Type: "FED", Mang_Name: "NPS", Des_Tp: "PUB" });

describe("Public land's colours and access (step 16, plan §3.1)", () => {
  it("names each manager's category, by agency, then designation, then name", () => {
    expect(categoryOf(JEFFERSON)).toBe("forest");
    expect(categoryOf(GRAYSON_HIGHLANDS)).toBe("state");
    expect(categoryOf(GRAYSON_HIGHLANDS_UNK)).toBe("state");
    expect(categoryOf(OLD_FLAT)).toBe("state");
    // Unknown manager, "State Other": a game land by its name.
    expect(categoryOf(POND_MOUNTAIN)).toBe("game");
    expect(categoryOf(unit({ Mang_Name: "SFW", Unit_Nm: "Mount Rogers" }))).toBe("game");
    expect(categoryOf(PARKWAY)).toBe("park");
    expect(categoryOf(EASEMENT)).toBe("easement");
    expect(categoryOf(NC_LWF)).toBe("other");
    expect(categoryOf(PRESERVE)).toBe("other");
  });

  it("draws open land solid, restricted and unknown hatched, closed as an outline", () => {
    expect(accessStyle(accessOf(JEFFERSON))).toBe("solid");
    expect(accessStyle(accessOf(NC_LWF))).toBe("hatched");
    expect(accessStyle(accessOf(EASEMENT))).toBe("hatched");
    expect(accessStyle(accessOf(PRESERVE))).toBe("outline");
  });
});

describe("Public land's tiles (plan §2)", () => {
  it("asks one fixed box a tile, at zoom 9 below 11 and zoom 11 from there", () => {
    expect(levelAt(9)).toBe("coarse");
    expect(levelAt(10.9)).toBe("coarse");
    expect(levelAt(11)).toBe("fine");
    const url = new URL(tileUrl(publicLandTemplate("fine"), { z: 11, x: 560, y: 801 }));
    expect(url.searchParams.get("f")).toBe("geojson");
    expect(url.searchParams.get("where")).toBe("FeatClass IN ('Fee','Easement')");
    expect(url.searchParams.get("maxAllowableOffset")).toBe("0.00005");
    expect(tileOfBbox(url.searchParams.get("geometry")!)).toEqual({ z: 11, x: 560, y: 801 });
  });

  it("reads an answer's units, and an ArcGIS error as no answer", () => {
    const square = polygon([
      [
        [-81.6, 36.5],
        [-81.5, 36.5],
        [-81.5, 36.6],
        [-81.6, 36.5],
      ],
    ]);
    const answer = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: square.geometry, properties: JEFFERSON },
        { type: "Feature", geometry: null, properties: POND_MOUNTAIN },
      ],
    };
    expect(parseTile(answer)?.map((f) => f.properties.Unit_Nm)).toEqual(["Jefferson National Forest"]);
    expect(parseTile({ error: { code: 400, message: "Invalid query" } })).toBeNull();
    expect(parseTile("nope")).toBeNull();
  });
});

describe("Public land's card (plan §4)", () => {
  const square = (west: number, props: PadusUnit): Feature<Polygon, PadusUnit> =>
    polygon(
      [
        [
          [west, 36.5],
          [west + 0.01, 36.5],
          [west + 0.01, 36.51],
          [west, 36.51],
          [west, 36.5],
        ],
      ],
      props,
    );
  /** 0.01° of longitude at 36.5° N is about 894 m. */
  const parcel = square(-81.61, unit({}));

  it("lists the units largest first, merges a duplicate, and names the manager and access", () => {
    const c = publicLandCard(
      [square(-81.6, GRAYSON_HIGHLANDS_UNK), square(-81.6, GRAYSON_HIGHLANDS), square(-81.6, JEFFERSON)],
      null,
    );
    expect(c.units.map((u) => u.name)).toEqual(["Jefferson National Forest", "Grayson Highlands State Park"]);
    expect(unitLines(c.units[0]!)).toEqual([
      "Jefferson National Forest",
      "U.S. Forest Service",
      "Open to the public",
      "National Forest",
      "PAD-US source date: 2024-10-06",
    ]);
    // The record with a known manager wins.
    expect(c.units[1]!.manager).toBe("VA Dept of Conservation and Recreation");
  });

  it("says when the manager isn't recorded, and an easement's holder and why it's private", () => {
    const c = publicLandCard([square(-81.6, POND_MOUNTAIN), square(-81.6, EASEMENT)], null);
    expect(unitLines(c.units[0]!)).toEqual([
      "Pond Mountain Game Land",
      W.noManager,
      "Open to the public",
      "State Other or Unknown",
      "PAD-US source date: 2021-01-26",
    ]);
    expect(unitLines(c.units[1]!)).toEqual([
      "Blue Ridge Conservancy Easement",
      "Blue Ridge Conservancy",
      "Held by Blue Ridge Conservancy",
      W.easement,
      "Conservation Easement",
      "PAD-US source date: 2019-05-16",
    ]);
  });

  it("shows three, then and n more", () => {
    const c = publicLandCard(
      [JEFFERSON, POND_MOUNTAIN, NC_LWF, PRESERVE, EASEMENT].map((u, i) =>
        square(-81.6, { ...u, OBJECTID: i, GIS_Acres: 100 - i }),
      ),
      null,
    );
    expect(c.units).toHaveLength(3);
    expect(c.more).toBe(2);
    expect(W.more(c.more)).toBe("and 2 more");
  });

  it("adjoins the open parcel within 20 m, and not at 30 m", () => {
    // The parcel's east edge is at -81.60; 15 m east, and 30 m east.
    const near = square(-81.6 + 15 / 89_400, JEFFERSON);
    const far = square(-81.6 + 30 / 89_400, JEFFERSON);
    expect(publicLandCard([near], parcel).units[0]!.adjoins).toBe(true);
    expect(publicLandCard([far], parcel).units[0]!.adjoins).toBe(false);
    expect(unitLines(publicLandCard([near], parcel).units[0]!).at(-1)).toBe(W.adjoins);
    expect(publicLandCard([near], null).units[0]!.adjoins).toBe(false);
  });
});
