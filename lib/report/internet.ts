/**
 * Internet's words (step 11, docs/plans/step-11-new-data.md §2.7): the dish spot's line and the report section's.
 * Pure; the card (card.ts internet) and the Internet block read it.
 */
import type { Heading } from "./parts";

export const internetHeading: Heading = { title: "Satellite internet", slug: "internet", help: "h-internet" };

/** The terrain's limits, kept with the numbers (CLAUDE.md: the data's caveats are part of the product's honesty). */
export const DISH_CAVEAT =
  "Trees not counted: the skyline is bare earth, so a spot in the woods needs clearing, and the dish's own app checks the real view before you buy.";
