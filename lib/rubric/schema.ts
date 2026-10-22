/**
 * The rubric's stored shape (step 1, PR 5): what a profile's `ps.rubrics` document and an export file hold, validated
 * on the way back in. Numbers only; the factor keys are the card's.
 */
import { z } from "zod";
import { SCREEN_CONSTANTS } from "../screen/config";
import { NEW_FACTORS, type FactorsAdded } from "./factorsAdd";
import { GATE_KEYS, ROW_KEYS, type NamedRubric, type RowKey, type Rubric } from "./types";

const num = z.number().finite();
const RowKeySchema = z.enum(ROW_KEYS);
const FactorSchema = z.enum([...GATE_KEYS, ...ROW_KEYS]);
const LetterSchema = z.enum(["A", "B", "C", "D", "F"]);

const BandsSchema = z.strictObject({
  elevationFt: z.array(num),
  skyMag: z.array(num),
  roomX: z.array(num),
  trailheadKm: z.array(num),
  trailheadMin: z.array(num),
  openLandWithinFt: num,
  erMin: z.array(num),
  groceryMin: z.array(num),
  gardenAc: z.array(num),
  // Step 7: an added field. A rubric saved before it reads the starting list's band (REQUIREMENTS §3a's rule).
  drivewayPct: z.array(num).default(() => [...SCREEN_CONSTANTS.card.rows.drivewayPct]),
});

/** Explicit weights by row. A row a saved rubric has no weight for (the Driveway row, step 7) weighs 0. */
const ExplicitWeightsSchema = z
  .partialRecord(RowKeySchema, num)
  .transform((of) => Object.fromEntries(ROW_KEYS.map((k) => [k, of[k] ?? 0])) as Record<RowKey, number>);

export const RubricSchema: z.ZodType<Rubric> = z.strictObject({
  version: z.literal(1),
  musts: z.array(z.strictObject({ factor: FactorSchema, threshold: num.optional() })),
  ranked: z.array(z.strictObject({ factor: RowKeySchema, tier: z.enum(["should", "could"]) })),
  wonts: z.array(RowKeySchema),
  bands: BandsSchema,
  weights: z.union([
    z.strictObject({ mode: z.literal("explicit"), of: ExplicitWeightsSchema }),
    z.strictObject({ mode: z.literal("rankSum") }),
  ]),
  points: z.strictObject({ A: num, B: num, C: num, D: num, F: num }),
  gradeCutoffs: z.array(num),
  verdict: z.strictObject({ contender: num, pass: num, contenderMaxWarns: num }),
  // Step 10: optional, so a rubric saved before it reads as before (no budget row).
  budgets: z
    .strictObject({ camp: num.nonnegative().nullable(), build: num.nonnegative().nullable() })
    .optional(),
}) as z.ZodType<Rubric>;

export const NamedRubricSchema: z.ZodType<NamedRubric> = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  rubric: RubricSchema,
});

/** What a profile keeps (step 1, PR 5): its own rubric, and the others it holds (a household's members, step 5). */
export interface ProfileRubrics {
  mine: Rubric;
  others: NamedRubric[];
  /**
   * Step 7 (owner, #216): the Driveway row was added once to a rubric saved before it (lib/client/drivewayAdd.ts).
   * "new" until What matters has shown its note, then "seen"; "undone" after its Undo. Absent: not added (yet).
   */
  drivewayAdded?: "new" | "seen" | "undone";
  /**
   * Step 11 (plan §1): each new factor added once to a rubric saved before it (lib/client/factorsAdd.ts), marked as
   * Driveway's is. A factor with no mark isn't added yet.
   */
  factorsAdded?: FactorsAdded;
}
const AddedMark = z.enum(["new", "seen", "undone"]);
export const ProfileRubricsSchema: z.ZodType<ProfileRubrics> = z.strictObject({
  mine: RubricSchema,
  others: z.array(NamedRubricSchema),
  drivewayAdded: z.enum(["new", "seen", "undone"]).optional(),
  factorsAdded: z.partialRecord(z.enum(NEW_FACTORS), AddedMark).optional(),
});

export { LetterSchema };
