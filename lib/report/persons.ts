/**
 * The two weight sets in config as named rubrics (step 1, PR 1): the card, the list, Compare and the rulebook grade
 * with a rubric now, and these are the rubrics they had. PR 5 replaces this file with the profile's own rubrics
 * (`mine`, and the "other" rubrics the migration carries), so that nothing stays hard-coded to a person.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { rubricFromWeights, type CardNumbers } from "../rubric/default";
import type { NamedRubric, RowKey } from "../rubric/types";

export type Person = "zach" | "julie";
export const PERSONS: readonly Person[] = ["zach", "julie"];
const NAMES: Record<Person, string> = { zach: "Zach", julie: "Julie" };

type WithWeights = CardNumbers & { weights: Record<Person, Record<RowKey, number>> };

/** Each person's rubric from the card's config: today's weights, explicit. */
export function personRubrics(K: WithWeights = SCREEN_CONSTANTS.card): Record<Person, NamedRubric> {
  return Object.fromEntries(
    PERSONS.map((p) => [p, { id: p, name: NAMES[p], rubric: rubricFromWeights(K.weights[p], K) }]),
  ) as Record<Person, NamedRubric>;
}

/** A rubric by name, or as given: what the card's callers pass until PR 5. */
export type RubricLike = Person | NamedRubric;

export const toRubric = (r: RubricLike, K: WithWeights = SCREEN_CONSTANTS.card): NamedRubric =>
  typeof r === "string" ? personRubrics(K)[r] : r;
