/**
 * The two weight sets the app shipped with, as named rubrics, for the tests that were written against them (step 1,
 * PR 5): the default rubric (`card.weights.default`, Zach's numbers) and the second set step 1's migration carried as
 * "Julie". The app itself names nobody.
 */
import { defaultRubric, rubricFromWeights, type CardNumbers } from "@/lib/rubric/default";
import type { NamedRubric, RowKey } from "@/lib/rubric/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";

/**
 * The second weight set the app shipped with (config `card.weights.julie` until step 1). Step 1's migration carried it
 * into the first profile as another's rubric; step 2 removed the migration, and the step 1 card oracle still needs it.
 */
export const LEGACY_SECOND_WEIGHTS: Record<RowKey, number> = {
  elevation: 10,
  homesite: 15,
  sky: 10,
  room: 10,
  driveway: 0,
  trails: 25,
  // Step 11: Town graded the ER then; Hospital takes its weight (plan §2.1).
  town: 0,
  hospital: 10,
  garden: 20,
  climate: 0,
  privacy: 0,
  longView: 0,
  budget: 0,
};

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
