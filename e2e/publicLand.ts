/**
 * Step 16's e2e network for Map layers › Public land: PAD-US's Manager Name queries answered from a small synthetic
 * collection beside Mud Creek (the live service is CI's screenshot job's), registered after the HAR replay so it wins.
 * - a national forest adjoining the parcel's east side (5 m of overlap: within the engine's 20 m);
 * - a game land further east, its manager unknown, as Pond Mountain Game Land's record is;
 * - a closed preserve to the north.
 */
import type { BrowserContext } from "@playwright/test";

const square = (west: number, south: number, east: number, north: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
});

const base = {
  FeatClass: "Fee",
  Loc_Mang: "",
  Loc_Ds: "",
  EsmtHldr: null,
};

export const PUBLIC_LAND = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: square(-81.5598, 36.5835, -81.5498, 36.5915),
      properties: {
        ...base,
        OBJECTID: 9001,
        Unit_Nm: "Jefferson National Forest",
        Mang_Type: "FED",
        Mang_Name: "USFS",
        Loc_Mang: "Forest Service Region 08 Southern",
        Des_Tp: "NF",
        Pub_Access: "OA",
        Src_Date: "2024/10/06",
        GIS_Acres: 711977,
      },
    },
    {
      type: "Feature",
      geometry: square(-81.545, 36.584, -81.54, 36.59),
      properties: {
        ...base,
        OBJECTID: 9002,
        Unit_Nm: "Pond Mountain Game Land",
        Mang_Type: "UNK",
        Mang_Name: "UNK",
        Des_Tp: "SOTH",
        Pub_Access: "OA",
        Src_Date: "2021/01/26",
        GIS_Acres: 3619,
      },
    },
    {
      type: "Feature",
      geometry: square(-81.566, 36.592, -81.56, 36.596),
      properties: {
        ...base,
        OBJECTID: 9003,
        Unit_Nm: "Conservation Fund Preserve",
        Mang_Type: "NGO",
        Mang_Name: "NGO",
        Loc_Mang: "The Conservation Fund",
        Des_Tp: "PCON",
        Pub_Access: "XA",
        Src_Date: "2017/08/14",
        GIS_Acres: 1410,
      },
    },
  ],
};

/** The forest's middle and the game land's, for taps. */
export const FOREST_AT: [number, number] = [36.5875, -81.5548];
export const GAME_LAND_AT: [number, number] = [36.587, -81.5425];

/** Answers every Public land query; `asked` counts them. */
export async function answerPublicLand(context: BrowserContext): Promise<{ asked: number }> {
  const log = { asked: 0 };
  await context.route(/Manager_Name_PADUS\/FeatureServer\/0\/query/, (route) => {
    log.asked++;
    return route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(PUBLIC_LAND),
    });
  });
  return log;
}
