/**
 * Map layers › Motor-vehicle routes' classes, words and tap card (roadmap step 16, docs/plans/step-16-public-lands.md
 * §3.2, §4, §8). A route's class is what its MVUM symbol allows; seasonal routes are dashed. The MVUM carries no
 * publication date, so the card says when the data was read, and never that it's the map's date (plan §9 Q2). Pure.
 */
import { VEHICLES, type RouteLayer, type RouteProps, type VehicleField } from "./source";

export const ROUTE_CLASSES = ["all", "highway", "atv", "motorcycle", "special"] as const;
export type RouteClass = (typeof ROUTE_CLASSES)[number];

export const ROUTE_COLOR: Record<RouteClass, string> = {
  all: "#d7263d",
  highway: "#ffffff",
  atv: "#f28c28",
  motorcycle: "#7b4fb0",
  special: "#2a8bd8",
};
export const ROUTE_CASING = "#1b1f1c";

export const MVUM_WORDS = {
  toggle: "Motor-vehicle routes",
  legend: {
    all: "All vehicles",
    highway: "Highway-legal vehicles only",
    atv: 'ATVs and side-by-sides, 50" or narrower',
    motorcycle: "Motorcycles only",
    special: "Special designation (see the MVUM)",
  } satisfies Record<RouteClass, string>,
  seasonal: "Seasonal",
  info: "On national forests, motor vehicles may use only designated routes. Check the current Motor Vehicle Use Map before driving.",
  dispersed: "Dispersed-camping corridors aren't in the Forest Service's data; the paper MVUM marks them.",
  zoomIn: "Zoom in to see motor-vehicle routes",
  failed: "Some routes didn't load",
  attribution: "Routes: U.S. Forest Service MVUM",
  allYear: "Open all year",
  season: (dates: string) => `Seasonal: open ${dates}`,
  allowed: (vehicles: string) => `Open to ${vehicles}`,
  read: (date: string) => `Forest Service MVUM data, read ${date}. Check the forest's current MVUM.`,
} as const;

/** Each vehicle class as the card lists it. */
const VEHICLE_NAME: Record<VehicleField, string> = {
  passengervehicle: "passenger vehicles",
  highclearancevehicle: "high-clearance vehicles",
  truck: "trucks",
  bus: "buses",
  motorhome: "motorhomes",
  fourwd_gt50inches: '4WD vehicles over 50"',
  twowd_gt50inches: '2WD vehicles over 50"',
  other_ohv_gt50inches: 'other OHVs over 50"',
  tracked_ohv_gt50inches: 'tracked OHVs over 50"',
  atv: "ATVs",
  motorcycle: "motorcycles",
  otherwheeled_ohv: "other wheeled OHVs",
  other_ohv_lt50inches: 'other OHVs 50" or narrower',
  tracked_ohv_lt50inches: 'tracked OHVs 50" or narrower',
};

/** What a route's MVUM symbol allows (the service's own legend). */
export function routeClass(layer: RouteLayer, symbol: string): RouteClass {
  if (symbol === "11" || symbol === "12") return "special";
  if (layer === "roads") return symbol === "1" || symbol === "2" ? "all" : "highway";
  if (symbol === "5" || symbol === "6") return "all";
  if (symbol === "9" || symbol === "10") return "motorcycle";
  return "atv"; // 7, 8, 16, 17: vehicles 50" or narrower
}

export const isSeasonal = (p: RouteProps): boolean => p.seasonal?.trim().toLowerCase() === "seasonal";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (md: string): string | null => {
  const m = md.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const month = MONTHS[Number(m[1]) - 1];
  return month ? `${month} ${Number(m[2])}` : null;
};

/** "04/01-01/10,09/01-12/31" as "Apr 1 – Jan 10, Sep 1 – Dec 31"; null when it doesn't read. */
export function datesInWords(dates: string | null | undefined): string | null {
  if (!dates?.trim()) return null;
  const ranges = dates.split(",").map((r) => {
    const [a, b] = r.split("-");
    const from = a ? day(a) : null;
    const to = b ? day(b) : null;
    return from && to ? `${from} – ${to}` : null;
  });
  return ranges.every((r) => r !== null) ? ranges.join(", ") : null;
}

const open = (p: RouteProps, f: VehicleField) =>
  String(p[f] ?? "")
    .trim()
    .toLowerCase() === "open";

/** "Bald Knob" from "BALD KNOB". */
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The route card's lines: name and number, what's allowed, its season, its forest, the data's date. */
export function routeLines(layer: RouteLayer, p: RouteProps, readOn: string): string[] {
  const number = p.id?.trim() ? `FS ${p.id.trim()}` : null;
  const name = p.name?.trim() ? titleCase(p.name.trim()) : null;
  const title = name && number ? `${name} (${number})` : (name ?? number ?? "Forest Service route");
  const openTo = VEHICLES.filter(([f]) => open(p, f));
  // The season of the first vehicle class open: on a route they share it, and the MVUM's own symbol says seasonal.
  const dates = datesInWords(openTo.map(([, d]) => p[d] as string | null | undefined).find((d) => d?.trim()));
  const season = isSeasonal(p)
    ? dates
      ? MVUM_WORDS.season(dates)
      : MVUM_WORDS.seasonal
    : MVUM_WORDS.allYear;
  const where = [p.forestname?.trim(), p.districtname?.trim()].filter(Boolean).join(", ");
  return [
    title,
    MVUM_WORDS.legend[routeClass(layer, p.symbol)],
    ...(openTo.length ? [MVUM_WORDS.allowed(openTo.map(([f]) => VEHICLE_NAME[f]).join(", "))] : []),
    season,
    ...(where ? [where] : []),
    MVUM_WORDS.read(readOn),
  ];
}
