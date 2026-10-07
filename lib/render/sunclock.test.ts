import { describe, expect, it } from "vitest";
import { nextDay, solarNoon, sunAltitude, sunrise, sunset, SUNRISE_ALT } from "./sunclock";

/**
 * NOAA's results, recorded 2026-10-07 by running NOAA's own calculator code (gml.noaa.gov/grad/solcalc:
 * calcSunriseSet and calcSolNoon, timezone 0) for each site and date. Minutes after 0h UTC on the date; a
 * sunset past midnight UTC is on the next UTC day (+1440).
 */
const NOAA = [
  {
    site: "Ferney Creek",
    lat: 36.8874,
    lon: -80.45455,
    date: "2026-12-21",
    rise: 751.07,
    set: 1328.94,
    noon: 1039.76,
  },
  {
    site: "Ferney Creek",
    lat: 36.8874,
    lon: -80.45455,
    date: "2026-03-20",
    rise: 685.25,
    set: 1413.72,
    noon: 1049.33,
  },
  {
    site: "Ferney Creek",
    lat: 36.8874,
    lon: -80.45455,
    date: "2026-06-21",
    rise: 602.86,
    set: 1440 + 44.52,
    noon: 1043.58,
  },
  {
    site: "Macks Mountain",
    lat: 36.93492,
    lon: -80.63139,
    date: "2026-12-21",
    rise: 751.91,
    set: 1329.52,
    noon: 1040.47,
  },
  {
    site: "Macks Mountain",
    lat: 36.93492,
    lon: -80.63139,
    date: "2026-03-20",
    rise: 685.95,
    set: 1414.43,
    noon: 1050.04,
  },
  {
    site: "Macks Mountain",
    lat: 36.93492,
    lon: -80.63139,
    date: "2026-06-21",
    rise: 603.42,
    set: 1440 + 45.37,
    noon: 1044.29,
  },
  {
    site: "Ashe Co.",
    lat: 36.4512,
    lon: -81.5523,
    date: "2026-12-21",
    rise: 754.25,
    set: 1334.54,
    noon: 1044.15,
  },
  {
    site: "Ashe Co.",
    lat: 36.4512,
    lon: -81.5523,
    date: "2026-03-20",
    rise: 689.66,
    set: 1418.08,
    noon: 1053.72,
  },
  {
    site: "Ashe Co.",
    lat: 36.4512,
    lon: -81.5523,
    date: "2026-06-21",
    rise: 608.53,
    set: 1440 + 47.63,
    noon: 1047.97,
  },
];

const minutesOf = (iso: string, t: number) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return (t - Date.UTC(y, m - 1, d)) / 60_000;
};

describe.each(NOAA)("$site on $date, against NOAA (owner: within 1 minute)", (c) => {
  it("sunrise, sunset and solar noon", () => {
    expect(Math.abs(minutesOf(c.date, sunrise(c.date, c.lat, c.lon)!) - c.rise)).toBeLessThan(1);
    expect(Math.abs(minutesOf(c.date, sunset(c.date, c.lat, c.lon)!) - c.set)).toBeLessThan(1);
    expect(Math.abs(minutesOf(c.date, solarNoon(c.date, c.lon)) - c.noon)).toBeLessThan(1);
  });
  it("the sun stands at −0.833° at sunrise and sunset", () => {
    expect(sunAltitude(sunrise(c.date, c.lat, c.lon)!, c.lat, c.lon)).toBeCloseTo(SUNRISE_ALT, 1);
    expect(sunAltitude(sunset(c.date, c.lat, c.lon)!, c.lat, c.lon)).toBeCloseTo(SUNRISE_ALT, 1);
  });
});

describe("twilight", () => {
  it("ends in order after sunset: civil, nautical, astronomical", async () => {
    const { sunEvent } = await import("./sunclock");
    const lat = 36.8874,
      lon = -80.45455;
    for (const iso of ["2026-12-21", "2026-06-21"]) {
      const s = sunset(iso, lat, lon)!;
      const civil = sunEvent(iso, lat, lon, -6, false)!,
        nautical = sunEvent(iso, lat, lon, -12, false)!,
        astro = sunEvent(iso, lat, lon, -18, false)!;
      expect(s < civil && civil < nautical && nautical < astro).toBe(true);
      expect(sunAltitude(astro, lat, lon)).toBeCloseTo(-18, 1);
      // June 21 here: astronomical twilight ends about two hours after sunset.
      if (iso === "2026-06-21") expect((astro - s) / 60_000).toBeGreaterThan(100);
    }
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
