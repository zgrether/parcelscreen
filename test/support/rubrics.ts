/**
 * The two weight sets the app shipped with, as named rubrics, for the tests that were written against them (step 1,
 * PR 5): the default rubric (`card.weights.default`, Zach's numbers) and the second set the migration carries as
 * "Julie" (lib/client/migrateProfiles.ts). The app itself names nobody.
 */
import { LEGACY_SECOND_WEIGHTS } from "@/lib/client/migrateProfiles";
import { defaultRubric, rubricFromWeights, type CardNumbers } from "@/lib/rubric/default";
import type { NamedRubric } from "@/lib/rubric/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";

export const ZACH: NamedRubric = { id: "zach", name: "Zach", rubric: defaultRubric() };
export const JULIE: NamedRubric = {
  id: "julie",
  name: "Julie",
  rubric: rubricFromWeights(LEGACY_SECOND_WEIGHTS),
};
export const PERSONS: readonly NamedRubric[] = [ZACH, JULIE];
export const personById = (id: "zach" | "julie"): NamedRubric => (id === "zach" ? ZACH : JULIE);

/** The two rubrics from another card config (the rulebook test edits a copy of the constants). */
export const personsFrom = (
  K: CardNumbers & { weights: { default: Record<string, number> } },
): NamedRubric[] => [
  { id: "zach", name: "Zach", rubric: rubricFromWeights(K.weights.default as never, K) },
  { id: "julie", name: "Julie", rubric: rubricFromWeights(LEGACY_SECOND_WEIGHTS, K) },
];

export { SCREEN_CONSTANTS };
