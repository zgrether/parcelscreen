/**
 * The version of the screening rules (Batch A §6, owner 2026-10-08). Every result carries it (`ScreenResult.engine`,
 * schema v3; before v3 it was on the browser's record envelope only), and a kept screen from an older engine
 * re-screens when its parcel is opened (owner, #101, 2026-10-11).
 *
 * 1 is Phase 0's rules (the prototype's numbers). Each Batch A PR that changes a number bumps it: A2a → 2,
 * A2b → 3, A2c → 4, A3 → 5, A3b → 6, A4 → 7, the scored route shown first (#88 follow-up) → 8, A4b grade over 30 m and the veto → 9, the A4b router (turns, landings, 32 directions) → 10, the driveway quantities, relief culverts and "no practical drive" (#99 decisions) → 11, schema v3 (B2a) → 12, the 15% grade limit and 25% veto (#103 decisions) → 13, schema v4 (VR3a: the build footprint ranks the sites, OSM frontage) → 14, schema v5 (follow-up 34: drawn tracks and easements) → 15, the trailhead search reaching the Trails row's last cutoff (#118 review: 20 → 36 km) → 16, schema v6 (follow-up 54: drives from the driveway entrance, Trails by drive minutes) → 17, schema v7 (follow-up 55: the entrance road's class) → 18 (A2c and A3b added by the owner). A record without a stamp counts as 1.
 */
export const ENGINE_VERSION = 18;

/** What a kept screen without a stamp counts as: everything kept before the stamp existed is Phase 0's. */
export const UNSTAMPED_ENGINE = 1;
