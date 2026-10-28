/**
 * Each national forest's official Motor Vehicle Use Map page (roadmap step 16, owner on #382): the route card's link
 * and the key's. The forests are those within reach of the area catalog (VA, NC, TN, WV, KY, OH, PA, GA, SC), matched by
 * the MVUM's `forestname`; any other forest, or none in view, gets the Forest Service's own MVUM page. Where a forest
 * has no MVUM page of its own, its maps page, which lists its MVUMs. Pure.
 */

export interface MvumPage {
  forest: string;
  /** Matched against the MVUM's `forestname` ("George Washington and Jefferson National Forest", …). */
  match: RegExp;
  url: string;
}

const FS = "https://www.fs.usda.gov";

export const MVUM_PAGES: readonly MvumPage[] = [
  {
    forest: "George Washington and Jefferson",
    match: /washington|jefferson/i,
    url: `${FS}/r08/gwj/maps-guides/motor-vehicle-use-map`,
  },
  {
    forest: "Pisgah, Nantahala, Uwharrie and Croatan (National Forests in North Carolina)",
    match: /north carolina|pisgah|nantahala|uwharrie|croatan/i,
    url: `${FS}/r08/northcarolina/maps-guides`,
  },
  { forest: "Cherokee", match: /cherokee/i, url: `${FS}/r08/cherokee/maps-guides` },
  {
    forest: "Monongahela",
    match: /monongahela/i,
    url: `${FS}/r09/monongahela/maps-guides/motor-vehicle-use-maps`,
  },
  { forest: "Daniel Boone", match: /daniel boone/i, url: `${FS}/r08/danielboone/maps-guides` },
  { forest: "Wayne", match: /wayne/i, url: `${FS}/r09/wayne/maps-guides/motor-vehicle-use-maps` },
  { forest: "Allegheny", match: /allegheny/i, url: `${FS}/r09/allegheny/maps-guides` },
  {
    forest: "Chattahoochee-Oconee",
    match: /chattahoochee|oconee/i,
    url: `${FS}/r08/chattahoochee-oconee/recreation/opportunities/highway-vehicles-ohv`,
  },
  {
    forest: "Francis Marion and Sumter",
    match: /francis marion|sumter/i,
    url: `${FS}/r08/francismarionsumter/maps-guides`,
  },
];

/** The Forest Service's own page on MVUMs: for a forest not listed, or when no route is in view. */
export const MVUM_FALLBACK_URL = `${FS}/visit/maps/mvum-faq`;

/** The MVUM page for a route's forest. */
export function mvumPage(forestname: string | null | undefined): string {
  const name = forestname?.trim();
  return (name && MVUM_PAGES.find((p) => p.match.test(name))?.url) || MVUM_FALLBACK_URL;
}
