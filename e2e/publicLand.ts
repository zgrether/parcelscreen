/**
 * Step 16's e2e network for Map layers › Public land and Motor-vehicle routes: PAD-US's Manager Name queries and the
 * MVUM's road and trail queries answered from small synthetic collections beside Mud Creek (the live services are CI's
 * screenshot job's), registered after the HAR replay so they win.
 * - a national forest adjoining the parcel's east side (5 m of overlap: within the engine's 20 m);
 * - a game land further east, its manager unknown, as Pond Mountain Game Land's record is;
 * - a closed preserve to the north.
 */
import type { BrowserContext, Page } from "@playwright/test";

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

/** Two MVUM routes across the forest: a seasonal road for highway-legal vehicles, and a motorcycle trail. */
export const ROUTES = {
  roads: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-81.5585, 36.5845],
            [-81.551, 36.5905],
          ],
        },
        properties: {
          objectid: 7001,
          id: "60061",
          name: "BALD KNOB",
          symbol: "4",
          seasonal: "seasonal",
          passengervehicle: "open",
          passengervehicle_datesopen: "09/12-01/18",
          highclearancevehicle: "open",
          highclearancevehicle_datesopen: "09/12-01/18",
          forestname: "George Washington and Jefferson National Forest",
          districtname: "Mount Rogers National Recreation Area",
        },
      },
    ],
  },
  trails: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-81.5585, 36.5895],
            [-81.551, 36.5855],
          ],
        },
        properties: {
          objectid: 7002,
          id: "301",
          name: "IRON MOUNTAIN",
          symbol: "9",
          seasonal: "yearlong",
          motorcycle: "open",
          motorcycle_datesopen: "01/01-12/31",
          forestname: "George Washington and Jefferson National Forest",
          districtname: "Mount Rogers National Recreation Area",
        },
      },
    ],
  },
};

/** A point on the road, clear of the trail (they cross at the forest's middle). */
export const ROAD_AT: [number, number] = [36.5851, -81.5578];

/** Answers every MVUM road and trail query; `asked` counts them. */
export async function answerRoutes(context: BrowserContext): Promise<{ asked: number }> {
  const log = { asked: 0 };
  await context.route(/EDW_MVUM_01\/MapServer\/[12]\/query/, (route) => {
    log.asked++;
    const layer = /MapServer\/1\//.test(route.request().url()) ? "roads" : "trails";
    return route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      headers: { "access-control-allow-origin": "*", date: "Wed, 28 Oct 2026 12:00:00 GMT" },
      body: JSON.stringify(ROUTES[layer]),
    });
  });
  return log;
}

type DebugMap = {
  jumpTo(o: object): void;
  isMoving(): boolean;
  getLayer(id: string): unknown;
  queryRenderedFeatures(o: { layers: string[] }): unknown[];
  project(ll: [number, number]): { x: number; y: number };
  getContainer(): HTMLElement;
};

export const jump = (page: Page, zoom: number, at: [number, number]) =>
  page.evaluate(
    ([z, lat, lon]) =>
      (window as unknown as { __psMap: DebugMap }).__psMap.jumpTo({ zoom: z, center: [lon, lat] }),
    [zoom, at[0], at[1]] as const,
  );

/** How many of a layer's features are drawn now; -1 while the layer doesn't exist. */
export const rendered = (page: Page, layer: string) =>
  page.evaluate((id) => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    return m.getLayer(id) ? m.queryRenderedFeatures({ layers: [id] }).length : -1;
  }, layer);

/** A click at a point on the map, once it has stopped moving. */
export async function tapAt(page: Page, at: [number, number]): Promise<void> {
  await page.waitForFunction(() => !(window as unknown as { __psMap: DebugMap }).__psMap.isMoving());
  const p = await page.evaluate(([lat, lon]) => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    const q = m.project([lon, lat]);
    const box = m.getContainer().getBoundingClientRect();
    return { x: box.left + q.x, y: box.top + q.y };
  }, at);
  await page.mouse.click(p.x, p.y);
}
