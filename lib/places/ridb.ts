/**
 * Public launches the bake's sources missed (#350, owner 10/26): the Corps of Engineers' parks with boating on Philpott
 * Lake and W. Kerr Scott Reservoir, and the Forest Service's two on South Holston Lake's Tennessee side, from
 * Recreation.gov's public export (RIDB, RIDBFullExport_V1_JSON, read 2026-10-26). Each is a facility RIDB lists with the
 * BOATING activity, at RIDB's point for it (the park's, which may sit a few hundred metres from its ramp). A fixed list:
 * the bake adds it as is, flatwater on its lake (Philpott Park, below the dam, a river launch on the Smith River), so
 * the monthly refresh needs no RIDB download.
 */
import type { BakedLaunch } from "../screen/placeData";
import { tailwaterOf } from "./flatwater";

export const RIDB_EXPORT = "https://ridb.recreation.gov/downloads/RIDBFullExport_V1_JSON.zip";

/** On its lake, unless it's below the dam (flatwater.ts tailwaterOf): then a river launch, on the river below. */
const launch = (id: string, name: string, ll: [number, number], lake: string): BakedLaunch => {
  const below = tailwaterOf({ id: `ridb:${id}`, name });
  return {
    kind: "launch",
    id: `ridb:${id}`,
    name,
    ll,
    src: "ridb",
    water: below ? "river" : "flat",
    ...(below ? (below.waterName ? { waterName: below.waterName } : {}) : { waterName: lake }),
  };
};

export const RIDB_LAUNCHES: readonly BakedLaunch[] = [
  // Philpott Lake (USACE).
  launch("233687", "Goose Point", [36.803889, -80.057222], "Philpott Lake"),
  launch("233582", "Philpott Park", [36.776111, -80.036944], "Philpott Lake"),
  launch("233616", "Salthouse Branch", [36.813611, -80.04], "Philpott Lake"),
  launch("233515", "Horseshoe Point", [36.833056, -80.063333], "Philpott Lake"),
  launch("248504", "Jamison Mill", [36.850195, -80.065082], "Philpott Lake"),
  // W. Kerr Scott Reservoir (USACE).
  launch("233421", "Bandits Roost", [36.12195, -81.250719], "W Kerr Scott Reservoir"),
  launch("248187", "Wilkes Skyline Marina", [36.126354, -81.231785], "W Kerr Scott Reservoir"),
  launch("250008", "Keowee Park", [36.104167, -81.283333], "W Kerr Scott Reservoir"),
  launch("250016", "Dam Site Park", [36.130556, -81.228889], "W Kerr Scott Reservoir"),
  launch("250025", "Boomer Park", [36.09545, -81.276768], "W Kerr Scott Reservoir"),
  // South Holston Lake, Tennessee side (USFS, on TVA's lake).
  launch("10128487", "Jacobs Creek", [36.561379, -82.000193], "South Holston Lake"),
  launch("122240", "Little Oak", [36.519539, -82.060817], "South Holston Lake"),
];
