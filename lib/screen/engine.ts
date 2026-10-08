/**
 * The version of the screening rules (Batch A §6, owner 2026-10-08). A kept screen is stamped with it, on the
 * browser's record envelope rather than inside ScreenResult (schema v2 is frozen), so History can say when a
 * result came from earlier rules. Phase 1's import carries it into a v3 field.
 *
 * 1 is Phase 0's rules (the prototype's numbers). Each Batch A PR that changes a number bumps it: A2a → 2,
 * A2b → 3, A3 → 4, A4 → 5. A record without a stamp counts as 1.
 */
export const ENGINE_VERSION = 1;

/** What a kept screen without a stamp counts as: everything kept before the stamp existed is Phase 0's. */
export const UNSTAMPED_ENGINE = 1;
