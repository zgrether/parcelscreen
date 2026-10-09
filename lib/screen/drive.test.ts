/** The closer non-chain grocery (owner, #81): the chain rule stands; a clearly nearer store is added last. */
import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "./config";
import { driveTimes } from "./drive";
import { CLOSER_GROCERY, REAL_GROCERY } from "./driveList";
import type { ScreenResult } from "./types";
import type { LatLon } from "./util";

type Near = NonNullable<ScreenResult["near"]>;
const FROM: LatLon = [36.58, -81.56];

/** OSRM answering each destination (by its longitude) with the minutes given; the asked longitudes kept. */
function osrm(minutesByLon: Record<string, number>) {
  const asked: string[] = [];
  const http: HttpClient = {
    fetch: async (url) => {
      const lon = /;(-?[\d.]+),/.exec(url)![1]!;
      asked.push(lon);
      const min = minutesByLon[lon];
      return new Response(
        JSON.stringify(
          min === undefined
            ? { code: "NoRoute" }
            : { routes: [{ duration: min * 60, distance: min * 1000 }] },
        ),
      );
    },
  };
  return { http, asked };
}

const grocer = (name: string, lon: number, big: boolean): Near["grocers"][number] => ({
  name,
  ll: [36.5, lon],
  km: Math.abs(lon),
  big,
});
const near = (grocers: Near["grocers"]): Near => ({
  hospitals: [],
  grocers,
  trailheads: [],
  trailheadCount: 0,
});

async function run(grocers: Near["grocers"], minutes: Record<string, number>) {
  const o = osrm(minutes);
  const drives = await driveTimes(FROM, near(grocers), [{ name: "Airport", lat: 36.1, lon: -80.2 }], {
    http: o.http,
    endpoints: DEFAULT_ENDPOINTS,
  });
  return { drives, asked: o.asked };
}

describe("the closer non-chain grocery (owner, #81)", () => {
  const G = [
    grocer("Lansing Foods", -1, false),
    grocer("Food Lion", -2, true),
    grocer("Corner Market", -3, false),
  ];

  it("is appended last when at least grocery.closerMinMin nearer by road; the chain line is unchanged", async () => {
    expect(SCREEN_CONSTANTS.grocery.closerMinMin).toBe(10);
    const { drives } = await run(G, { "-1": 28, "-2": 38, "-3": 25, "-80.2": 90 });
    expect(drives.map((d) => [d.label, d.name, d.min])).toEqual([
      [REAL_GROCERY, "Food Lion", 38],
      ["Airport", "", 90],
      [CLOSER_GROCERY, "Corner Market", 25], // the quickest of the non-chain stores
    ]);
  });

  it("exactly 10 min nearer counts; 9 doesn't", async () => {
    expect((await run(G, { "-1": 28, "-2": 38, "-80.2": 90 })).drives.at(-1)!.label).toBe(CLOSER_GROCERY);
    expect((await run(G, { "-1": 29, "-2": 38, "-80.2": 90 })).drives.at(-1)!.label).toBe("Airport");
  });

  it("no chain found: the prototype's rule already routes every store, so nothing more is asked", async () => {
    const { drives, asked } = await run([grocer("Lansing Foods", -1, false)], { "-1": 20, "-80.2": 90 });
    expect(drives.map((d) => d.label)).toEqual([REAL_GROCERY, "Airport"]);
    expect(asked).toEqual(["-1", "-80.2"]);
  });

  it("only chains: nothing more is asked", async () => {
    const { drives, asked } = await run([grocer("Food Lion", -2, true)], { "-2": 38, "-80.2": 90 });
    expect(drives.map((d) => d.label)).toEqual([REAL_GROCERY, "Airport"]);
    expect(asked).toEqual(["-2", "-80.2"]);
  });

  it("looks beyond the six listed stores: the pool is every non-chain store found (Macks's Slaughters')", async () => {
    const o = osrm({ "-2": 61, "-4": 61, "-10": 42, "-11": 50, "-80.2": 90 });
    const listed = [grocer("Food City", -2, true), grocer("Maria Bonita", -4, false)];
    const pool = [listed[1]!, grocer("Slaughters'", -10, false), grocer("Harvest Moon", -11, false)];
    const drives = await driveTimes(
      FROM,
      near(listed),
      [],
      { http: o.http, endpoints: DEFAULT_ENDPOINTS },
      pool,
    );
    expect(drives.map((d) => [d.label, d.name, d.min])).toEqual([
      [REAL_GROCERY, "Food City", 61],
      [CLOSER_GROCERY, "Slaughters'", 42],
    ]);
    expect(o.asked).toEqual(["-2", "-4", "-10", "-11"]); // the chain, then the three nearest in the pool
  });

  it("the chain can't be routed: no closer line", async () => {
    const { drives } = await run(G, { "-1": 5, "-80.2": 90 });
    expect(drives.map((d) => d.label)).toEqual(["Airport"]);
  });
});
