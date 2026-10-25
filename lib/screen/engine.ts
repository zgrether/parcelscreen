/**
 * The version of the screening rules (Batch A §6, owner 2026-10-08). Every result carries it (`ScreenResult.engine`,
 * schema v3; before v3 it was on the browser's record envelope only), and a kept screen from an older engine
 * re-screens when its parcel is opened (owner, #101, 2026-10-11).
 *
 * 1 is Phase 0's rules (the prototype's numbers). Each Batch A PR that changes a number bumps it: A2a → 2,
 * A2b → 3, A2c → 4, A3 → 5, A3b → 6, A4 → 7, the scored route shown first (#88 follow-up) → 8, A4b grade over 30 m and the veto → 9, the A4b router (turns, landings, 32 directions) → 10, the driveway quantities, relief culverts and "no practical drive" (#99 decisions) → 11, schema v3 (B2a) → 12, the 15% grade limit and 25% veto (#103 decisions) → 13, schema v4 (VR3a: the build footprint ranks the sites, OSM frontage) → 14, schema v5 (follow-up 34: drawn tracks and easements) → 15, the trailhead search reaching the Trails row's last cutoff (#118 review: 20 → 36 km) → 16, schema v6 (follow-up 54: drives from the driveway entrance, Trails by drive minutes) → 17, schema v7 (follow-up 55: the entrance road's class) → 18, the sky read at each site and the house (follow-up 58) → 19, site #1's card the same with and without a house (§9.43) → 20, schema v8 (step 1: measurements, no grades; the sky read at each spot, its soil key and its chosen driveway's facts, NRCS's slope-free ratings and the run's thresholds) → 21, schema v9 (step 2: Tennessee's TREC trails, the trails a trailhead serves) → 22, step 11's Climate (each spot's normals; optional fields, §9.66) → 23, its Privacy (each spot's houses) → 24, its Long view (each spot's view) → 25, its Bike to a long trail (the drive to the nearest one) → 26, its Internet (the dish spot) → 27, Long view open past 3 mi, not 5 km (owner, #273) → 28, the Hospital row's ERs from CMS's list with the hand-checked overrides, not OpenStreetMap (§9.69) → 29, step 14's power lines and road frontage (measurements only, §9.70) → 30, its land cover, mapped streams, trail estimate and county (§9.70) → 31, road frontage walked along the boundary, the ponds on the parcel and the houses near its boundary (owner, after #312; §9.71) → 32, step 14d's baked places for the groceries, trailheads and their parking (§9.73) → 33 (A2c and A3b added by the owner). A record without a stamp counts as 1.
 */
export const ENGINE_VERSION = 33;

/**
 * The oldest rules whose kept screens still count as current (step 11, docs/plans/step-11-new-data.md §1; owner,
 * 10/21: old screens aren't dropped). From step 11 on, a bump that only adds a measurement leaves this where it is: a
 * screen from these rules keeps its grade, and the new factor reads "not measured: grade again" until it's re-screened.
 * A bump that changes an existing number moves it up to the new version, as every bump did before, unless the owner
 * keeps it: §9.71's frontage and step 14d's baked places (§9.73) left it, so an older grade keeps its own until graded
 * again.
 */
export const ENGINE_CURRENT_FROM = 29;

/** What a kept screen without a stamp counts as: everything kept before the stamp existed is Phase 0's. */
export const UNSTAMPED_ENGINE = 1;
