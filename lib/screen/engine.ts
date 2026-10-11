/**
 * The version of the screening rules (Batch A §6, owner 2026-10-08). A kept screen is stamped with it, on the
 * browser's record envelope rather than inside ScreenResult (schema v2 is frozen), so History can say when a
 * result came from earlier rules. Phase 1 re-runs a screen whose engine is older (owner, 2026-10-09).
 *
 * 1 is Phase 0's rules (the prototype's numbers). Each Batch A PR that changes a number bumps it: A2a → 2,
 * A2b → 3, A2c → 4, A3 → 5, A3b → 6, A4 → 7, the scored route shown first (#88 follow-up) → 8, A4b grade over 30 m and the veto → 9, the A4b router (turns, landings, 32 directions) → 10 (A2c and A3b added by the owner). A record without a stamp counts as 1.
 */
export const ENGINE_VERSION = 10;

/** What a kept screen without a stamp counts as: everything kept before the stamp existed is Phase 0's. */
export const UNSTAMPED_ENGINE = 1;
