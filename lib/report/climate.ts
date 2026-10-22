/**
 * Climate's words (step 11, docs/plans/step-11-new-data.md §2.2): the card row's line, and the report section's table
 * of each site's readings with the stations they name. Pure; the card (card.ts climate) and the Climate block read it.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { PartialScreenResult } from "../screen/types";
import type { Heading } from "./parts";

export const climateHeading: Heading = { title: "Climate", slug: "climate", help: "h-climate" };

/** A factor a screen made before it doesn't have (plan §1): it counts as unknown. */
export const NOT_MEASURED = "not measured: grade again";
/** A parcel outside the baked data's region (plan §1). */
export const OUTSIDE_AREA = "not measured: outside the data's area";

type Stations = NonNullable<PartialScreenResult["climate"]>["stations"];
type Station = Stations[number];

/** "Mar 30" from NOAA's "03-30". */
export function dayOf(mmdd: string): string {
  const [m, d] = mmdd.split("-").map(Number) as [number, number];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${month} ${d}`;
}

/** "Galax (2,380 ft, 4.1 mi away)". */
export const stationName = (st: Station, mi: number | null): string =>
  `${st.name.replace(/, [A-Z]{2}$/, "")} (${fmt(st.elevFt)} ft${mi === null ? "" : `, ${fmt(mi, 1)} mi away`})`;

/** "28 in of snow a year, 160 frost-free days (Apr 28 to Oct 5)". */
export const stationLine = (st: Station): string =>
  `${fmt(st.snowIn)} in of snow a year, ${fmt(st.frostFreeDays)} frost-free days (${dayOf(st.lastFreeze)} to ${dayOf(st.firstFreeze)})`;

/** The sources' limits, kept with the numbers (CLAUDE.md: the data's caveats are part of the product's honesty). */
export const CLIMATE_CAVEAT =
  `30-year averages (1991–2020): any one year differs. Temperatures are PRISM's 800 m grid moved to each site's ` +
  `elevation at ${fmt(SCREEN_CONSTANTS.climate.lapseFPer1000Ft, 1)} °F per 1,000 ft. Snowfall and frost dates are the ` +
  `nearby station's own: a station in a valley has the valley's frosts, which come later in spring and earlier in fall ` +
  `than on a slope above it.`;

/** Where the numbers come from, for "How it's scored" and the report (plan §3; checked 2026-10-21). */
export const CLIMATE_SOURCES =
  "PRISM Group, Oregon State University, https://prism.oregonstate.edu, accessed Oct 21, 2026; NOAA NCEI U.S. Climate " +
  "Normals 1991–2020 (doi:10.25921/4ek7-fk11).";

export interface ClimateRowView {
  label: string;
  elevFt: number;
  janLowF: number;
  julHighF: number;
  station: string | null;
}

/** The report section: each site's readings (and the house's), then the stations they name; null when not measured. */
export function climateView(
  r: PartialScreenResult,
): { outside: boolean; rows: ClimateRowView[]; stations: { name: string; line: string }[] } | null {
  if (!r.climate) return null;
  const spots = [
    ...(r.house && !("outside" in r.house) && r.house.elevFt != null
      ? [{ label: "The marked house", elevFt: r.house.elevFt, climate: r.house.climate }]
      : []),
    ...(r.sites ?? []).map((s) => ({ label: `Site #${s.rank}`, elevFt: s.elevFt, climate: s.climate })),
  ];
  const rows = spots.flatMap((x) =>
    x.climate
      ? [
          {
            label: x.label,
            elevFt: x.elevFt,
            janLowF: x.climate.janLowF,
            julHighF: x.climate.julHighF,
            station: x.climate.station,
          },
        ]
      : [],
  );
  const named = new Set(rows.map((x) => x.station));
  const stations = r.climate.stations
    .filter((st) => named.has(st.id))
    .map((st) => ({ name: stationName(st, null), line: stationLine(st) }));
  return { outside: r.climate.outside, rows, stations };
}
