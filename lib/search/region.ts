/**
 * The household's region (the audit's J-6, approved 2026-10-24; UX part 2 PR 4): where search looks for parcel numbers
 * and places, so a listing's number is found whatever county is on screen, and "Floyd" doesn't find Poland. The
 * default is the household's own, "SW Virginia, NW North Carolina, NE Tennessee"; changing it is parked (J-6's "change").
 * The map's own view is added to it, so a search where the map stands still works outside the region.
 */

/** [west, south, east, north], degrees. */
export type Bbox = readonly [number, number, number, number];

export const REGION: { name: string; bbox: Bbox } = {
  name: "SW Virginia, NW North Carolina, NE Tennessee",
  // From the Blue Ridge's foot at Roanoke and Danville west past Johnson City, Kingsport and Greeneville, south past
  // Asheville's north edge: Grayson, Floyd, Carter and Ashe are well inside it.
  bbox: [-83.3, 35.55, -79.4, 37.6],
};

/** The box holding both: the region and the map's view. */
export const unionBbox = (a: Bbox, b: Bbox | null): Bbox =>
  b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a;

/** ArcGIS's envelope filter, in WGS 84. */
export const envelopeParams = (b: Bbox): Record<string, string> => ({
  geometry: b.join(","),
  geometryType: "esriGeometryEnvelope",
  inSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
});
