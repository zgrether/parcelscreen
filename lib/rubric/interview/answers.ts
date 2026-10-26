/**
 * The interview's answers (step 4, docs/plans/step-4-interview.md §5), stored raw on the profile: one field per
 * question, typed by its choices, the answers about factors the app doesn't measure yet included (steps 9–10 read
 * them). A field left out is a question skipped or not reached. Validated with Zod on the way back in.
 */
import { z } from "zod";

export const CLIMATE = ["cool", "between", "warm", "either"] as const;
/** Question 1's follow-ups (step 11): winters, and summer heat. */
export const WINTER = ["mild", "some", "real"] as const;
export const SUMMER = ["cool", "warm", "hot"] as const;
export const SKY = ["camera", "look", "inside"] as const;
export const GLOW = ["shrug", "spoils"] as const;
export const SUN_VIEW = ["sun", "view", "both", "neither"] as const;
export const TRAILS = ["door", "bike", "drive", "none"] as const;
export const GROCERIES = ["close", "far", "either"] as const;
export const ER = ["15", "30", "45", "60"] as const;
export const FLY = ["rarely", "few", "monthly"] as const;
export const PADDLE = ["rarely", "some", "big"] as const;
export const PADDLE_DRIVE = ["m15", "m30", "m45", "m60"] as const;
export const CALLS = ["yes", "no"] as const;
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
  /** Question 1's follow-ups (step 11; plan §2.2), preset from its answer: winters, and summer heat. */
  winter?: (typeof WINTER)[number];
  summer?: (typeof SUMMER)[number];
  sky?: (typeof SKY)[number];
  /** Question 2's follow-up, asked after "Out with a camera". */
  glow?: (typeof GLOW)[number];
  sunView?: (typeof SUN_VIEW)[number];
  trails?: (typeof TRAILS)[number];
  /** Step 14d: question 4's second screen, how often the person would paddle, and the longest drive to a launch. */
  paddle?: (typeof PADDLE)[number];
  paddleDrive?: (typeof PADDLE_DRIVE)[number];
  groceries?: (typeof GROCERIES)[number];
  /** The longest drive to the ER the person is comfortable with, minutes ("60": an hour or more). */
  er?: (typeof ER)[number];
  /** Question 7's first row: how often the person flies. */
  fly?: (typeof FLY)[number];
  /** Question 7's second row: internet for video calls from home. */
  calls?: (typeof CALLS)[number];
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
  winter: z.enum(WINTER).optional(),
  summer: z.enum(SUMMER).optional(),
  sky: z.enum(SKY).optional(),
  glow: z.enum(GLOW).optional(),
  sunView: z.enum(SUN_VIEW).optional(),
  trails: z.enum(TRAILS).optional(),
  paddle: z.enum(PADDLE).optional(),
  paddleDrive: z.enum(PADDLE_DRIVE).optional(),
  groceries: z.enum(GROCERIES).optional(),
  er: z.enum(ER).optional(),
  fly: z.enum(FLY).optional(),
  calls: z.enum(CALLS).optional(),
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
