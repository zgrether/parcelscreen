/**
 * The area catalog's extent (step 13, docs/plans/step-13-area-catalog.md §3.4), [south, west, north, east]: every
 * area's outline lies inside it. The climate grid, the ER list and the airport list are made for it
 * (scripts/data-climate.mts, data-er.mts, data-airports.mts; a test holds their copies equal).
 */
export const CATALOG_BOX = [34.9, -83.8, 38.6, -78.6] as const;
