/**
 * The offline map cache's numbers (step 14e, docs/plans/step-14e-offline.md §3). UI and storage only: nothing here
 * reaches a grade.
 */

const MB = 1024 * 1024;

/** The automatic cache's cap until the person picks another (the brief: 1 GB). */
export const DEFAULT_CAP_BYTES = 1024 * MB;
/** Settings › Offline's choices. */
export const CAP_CHOICES: readonly number[] = [250 * MB, 500 * MB, 1024 * MB, 2048 * MB, 5120 * MB];
/** Debug mode's extra choice, small enough for the eviction e2e to cross. */
export const DEBUG_CAP_BYTES = 5 * MB;
/** Past the cap, the oldest tiles go until the cache is under this share of it, so eviction doesn't run per tile. */
export const EVICT_TO = 0.9;
/** A cached tile viewed after this long is fetched again in the background (§12, Q3). */
export const REFRESH_AFTER_DAYS = 7;
/** Hits are written in batches this often, not one transaction per tile. */
export const TOUCH_EVERY_MS = 5_000;

/**
 * The elevation tiles (Mapterhorn, AWS Terrarium) are kept like any map tile (owner, #358, §12 Q1): CLAUDE.md's "DEM
 * rasters are never persisted" is about the app's own storage (saved screens, the database, exports), not the capped
 * map tile cache.
 */
export const ELEVATION_TILES_CACHED = true;
