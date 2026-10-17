/**
 * The rubric's stored shape (step 1, PR 5): what a profile's `ps.rubrics` document and an export file hold, validated
 * on the way back in. Numbers only; the factor keys are the card's.
 */
import { z } from "zod";
import { GATE_KEYS, ROW_KEYS, type NamedRubric, type Rubric } from "./types";

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
});

export const RubricSchema: z.ZodType<Rubric> = z.strictObject({
  version: z.literal(1),
  musts: z.array(z.strictObject({ factor: FactorSchema, threshold: num.optional() })),
  ranked: z.array(z.strictObject({ factor: RowKeySchema, tier: z.enum(["should", "could"]) })),
  wonts: z.array(RowKeySchema),
  bands: BandsSchema,
  weights: z.union([
    z.strictObject({ mode: z.literal("explicit"), of: z.record(RowKeySchema, num) }),
    z.strictObject({ mode: z.literal("rankSum") }),
  ]),
  points: z.strictObject({ A: num, B: num, C: num, D: num, F: num }),
  gradeCutoffs: z.array(num),
  verdict: z.strictObject({ contender: num, pass: num, contenderMaxWarns: num }),
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
}
export const ProfileRubricsSchema: z.ZodType<ProfileRubrics> = z.strictObject({
  mine: RubricSchema,
  others: z.array(NamedRubricSchema),
});

export { LetterSchema };
