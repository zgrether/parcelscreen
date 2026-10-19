/**
 * The app's three places (step 4b, docs/plans/step-4b-navigation.md §1): the tabs of the phone's bottom bar and the
 * desktop's top bar. Pure, so the routes each place covers are Node-tested.
 */

export type PlaceId = "map" | "list" | "matters";

export interface Place {
  id: PlaceId;
  /** The tab's label: "What matters" is the short form of the page's heading, "What matters to you". */
  label: string;
  href: string;
}

export const PLACES: readonly Place[] = [
  { id: "map", label: "Map", href: "/explore" },
  { id: "list", label: "Your list", href: "/library" },
  { id: "matters", label: "What matters", href: "/priorities" },
];

/** The menu's button: "More" on the phone's tab bar, ☰ on the desktop's top bar. */
export const MORE_LABEL = "More";

const under = (pathname: string, route: string): boolean =>
  pathname === route || pathname.startsWith(`${route}/`);

/** The place a page belongs to, for marking its tab: Compare counts as Your list; Help and the rest as none. */
export function placeOf(pathname: string): PlaceId | null {
  if (under(pathname, "/explore")) return "map";
  if (under(pathname, "/library") || under(pathname, "/compare")) return "list";
  if (under(pathname, "/priorities")) return "matters";
  return null;
}

/** Every page has the tabs but the opening redirect ("/") and the interview, a focused flow with its own way out (§2). */
export function showsNav(pathname: string): boolean {
  return pathname !== "/" && !under(pathname, "/interview");
}
