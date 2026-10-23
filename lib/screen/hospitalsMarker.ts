/**
 * Text in the ER list's `source` line (lib/screen/data/er.json, written by scripts/data-er.mts; the OSM snapshot's
 * before §9.69), by which the service worker's precache leaves out the chunk that holds it (app/serwist/[path]/route.ts).
 * Its own module so the route doesn't import the list. hospitals.test.ts holds the two in step.
 */
export const HOSPITAL_SNAPSHOT_MARKER = "CMS Hospital General Information (Emergency Services = Yes)";
