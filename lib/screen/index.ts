// Entry point of the screening pipeline. screen() lands in step 10 (docs/plans/phase-0.md §6);
// until then this only pins the result schema version so the pure-code checks have a target.
export const SCREEN_SCHEMA_VERSION = 1 as const;
