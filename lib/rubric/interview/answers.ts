/**
 * The interview's answers (step 4, docs/plans/step-4-interview.md §5), stored raw on the profile: one field per
 * question, typed by its choices, the answers about factors the app doesn't measure yet included (steps 9–10 read
 * them). A field left out is a question skipped or not reached. Validated with Zod on the way back in.
 */
import { z } from "zod";

export const CLIMATE = ["cool", "between", "warm", "either"] as const;
export const SKY = ["camera", "look", "inside"] as const;
export const GLOW = ["shrug", "spoils"] as const;
export const SUN_VIEW = ["sun", "view", "both", "neither"] as const;
export const TRAILS = ["door", "bike", "drive", "none"] as const;
export const GROCERIES = ["close", "far", "either"] as const;
export const ER = ["15", "30", "45", "60"] as const;
export const WORK = ["calls", "flyFew", "flyMonthly"] as const;
export const NEIGHBORS = ["wave", "lights", "never"] as const;
export const GARDEN = ["none", "herbs", "kitchen", "most"] as const;
export const DRIVEWAY = ["steep", "gentle", "build"] as const;
export const HOA = ["welcome", "light", "none"] as const;
export const CREEK = ["best", "notNear", "rather", "either"] as const;
export const ACRES = ["under5", "5to20", "20to50", "over50"] as const;
/** Question 14's chips, in the screen's order: the same nine for "walk away" (14a) and "doesn't matter" (14b). */
export const CHIPS = [
  "flood",
  "hoa",
  "sharedDriveway",
  "belowFt",
  "erOver",
  "neighborInView",
  "noWinterSun",
  "altSeptic",
  "overBudget",
] as const;
export type Chip = (typeof CHIPS)[number];

export interface InterviewAnswers {
  climate?: (typeof CLIMATE)[number];
  sky?: (typeof SKY)[number];
  /** Question 2's follow-up, asked after "Out with a camera". */
  glow?: (typeof GLOW)[number];
  sunView?: (typeof SUN_VIEW)[number];
  trails?: (typeof TRAILS)[number];
  groceries?: (typeof GROCERIES)[number];
  /** The longest drive to the ER the person is comfortable with, minutes ("60": an hour or more). */
  er?: (typeof ER)[number];
  /** Pick any; empty is "Neither". */
  work?: (typeof WORK)[number][];
  neighbors?: (typeof NEIGHBORS)[number];
  garden?: (typeof GARDEN)[number];
  driveway?: (typeof DRIVEWAY)[number];
  hoa?: (typeof HOA)[number];
  creek?: (typeof CREEK)[number];
  /** The acres range, and the two optional budgets in dollars. */
  land?: { acres?: (typeof ACRES)[number]; campBudget?: number; buildBudget?: number };
  /** 14a: the chips that would make the person walk away, with the two numbers they set. */
  walkAway?: { chips: Chip[]; belowFt?: number; erOverMin?: number };
  /** 14b: the chips that don't matter at all (none of 14a's). */
  dontMatter?: Chip[];
}

const dollars = z.number().finite().nonnegative();

export const InterviewAnswersSchema: z.ZodType<InterviewAnswers> = z.strictObject({
  climate: z.enum(CLIMATE).optional(),
  sky: z.enum(SKY).optional(),
  glow: z.enum(GLOW).optional(),
  sunView: z.enum(SUN_VIEW).optional(),
  trails: z.enum(TRAILS).optional(),
  groceries: z.enum(GROCERIES).optional(),
  er: z.enum(ER).optional(),
  work: z.array(z.enum(WORK)).optional(),
  neighbors: z.enum(NEIGHBORS).optional(),
  garden: z.enum(GARDEN).optional(),
  driveway: z.enum(DRIVEWAY).optional(),
  hoa: z.enum(HOA).optional(),
  creek: z.enum(CREEK).optional(),
  land: z
    .strictObject({
      acres: z.enum(ACRES).optional(),
      campBudget: dollars.optional(),
      buildBudget: dollars.optional(),
    })
    .optional(),
  walkAway: z
    .strictObject({
      chips: z.array(z.enum(CHIPS)),
      belowFt: z.number().finite().optional(),
      erOverMin: z.number().finite().optional(),
    })
    .optional(),
  dontMatter: z.array(z.enum(CHIPS)).optional(),
}) as z.ZodType<InterviewAnswers>;
