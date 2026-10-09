/**
 * Text in the hospital snapshot's `source` line (written by scripts/data-hospitals.mts), by which the service
 * worker's precache leaves out the chunk that holds it (app/serwist/[path]/route.ts). Its own module so the route
 * doesn't import the snapshot. hospitals.test.ts holds the two in step.
 */
export const HOSPITAL_SNAPSHOT_MARKER = "amenity=hospital or healthcare=hospital in";
