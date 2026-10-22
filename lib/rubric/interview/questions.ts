/**
 * The interview's words (step 4, docs/plans/step-4-interview.md §1, §3): each screen's scene and choices as the design
 * doc writes them, the why a card's sheet shows for each choice (the person's own terms, never a question number:
 * owner, 10/18), and the "later" entry an answer adds for a factor the app doesn't measure yet. The numbers each choice
 * sets (points and band edges) are config's, `card.interview` (CLAUDE.md rule 4); this file is text only.
 */
import { fmt } from "../../format";
import type { Chip, InterviewAnswers } from "./answers";

export interface Choice<Id extends string = string> {
  id: Id;
  label: string;
  /** What the card's sheet says (null: the choice says nothing about a card, as "Either" doesn't). */
  why: string | null;
  /** The quiet list's entry, for a factor the app doesn't measure yet. */
  later?: string;
}

export interface Question {
  /** The answers' field this screen sets. */
  key: keyof InterviewAnswers;
  /** The progress line's number: 1–14 (14 has two screens). */
  n: number;
  scene: string;
  choices: Choice[];
  /**
   * A second single-choice row on the same screen (question 7, owner 10/18): the screen's scene heads both rows, and
   * `ask` is the first row's own question. Continue appears once both are answered.
   */
  ask?: string;
  second?: { key: keyof InterviewAnswers; ask: string; choices: Choice[] };
}

export const QUESTIONS: readonly Question[] = [
  {
    key: "climate",
    n: 1,
    scene:
      "Which year sounds better: cool summer days and frigid winter nights, or hot summer days and snow that rarely sticks?",
    choices: [
      {
        id: "cool",
        label: "Cool and snowy",
        why: "You'd like cool summer days and snowy winters",
      },
      {
        id: "between",
        label: "In between",
        why: "You'd like a climate in between",
      },
      {
        id: "warm",
        label: "Warm and mild",
        why: "You'd like hot summers and snow that rarely sticks",
      },
      { id: "either", label: "Either is fine", why: "You said either climate is fine" },
    ],
  },
  {
    key: "sky",
    n: 2,
    scene: "It's a clear January night. Where are you?",
    choices: [
      {
        id: "camera",
        label: "Out with a camera",
        why: "You'd be out with a camera on a clear January night",
      },
      {
        id: "look",
        label: "Out for a minute to look",
        why: "You'd step out for a minute to look at the stars",
      },
      { id: "inside", label: "Inside by the fire", why: "You'd rather be inside by the fire" },
    ],
  },
  {
    key: "sunView",
    n: 3,
    scene: "December morning: sun across the breakfast table, or a long view down the valley?",
    choices: [
      { id: "sun", label: "Sun", why: "You'd rather have sun at breakfast than a long view" },
      {
        id: "view",
        label: "View",
        why: "You'd rather have a long view than sun at breakfast",
      },
      {
        id: "both",
        label: "Both",
        why: "You want both sun at breakfast and a long view",
      },
      { id: "neither", label: "Neither", why: "You said neither morning sun nor a long view matters much" },
    ],
  },
  {
    key: "trails",
    n: 4,
    scene: "Saturday morning. What's the plan?",
    choices: [
      {
        id: "door",
        label: "Walk out the door into the woods",
        why: "You'd like to walk out the door into the woods",
      },
      {
        id: "bike",
        label: "Bike from home to a long trail",
        why: "You'd like to bike from home to a long trail",
      },
      {
        id: "drive",
        label: "Drive 20 min to the best trail",
        why: "You'd drive 20 minutes to the best trail",
      },
      { id: "none", label: "Not trail people", why: "You said you're not trail people" },
    ],
  },
  {
    key: "groceries",
    n: 5,
    scene: "Groceries: a small market 10 minutes away, or a big store 40 minutes away once a week?",
    choices: [
      { id: "close", label: "Small and close", why: "You'd rather have a small market 10 minutes away" },
      { id: "far", label: "Big and far", why: "You'd rather drive 40 minutes to a big store once a week" },
      { id: "either", label: "Either is fine", why: "You said either store is fine" },
    ],
  },
  {
    key: "er",
    n: 6,
    scene:
      "Someone gets hurt on a Sunday afternoon. What's the longest drive to the ER you'd be comfortable with?",
    choices: [
      { id: "15", label: "15 min", why: "You'd want an ER within 15 minutes" },
      { id: "30", label: "30 min", why: "You'd want an ER within 30 minutes" },
      { id: "45", label: "45 min", why: "You'd want an ER within 45 minutes" },
      { id: "60", label: "An hour or more", why: "You're fine with an hour or more to the ER" },
    ],
  },
  {
    key: "fly",
    n: 7,
    scene: "Work and travel.",
    ask: "How often will you fly?",
    choices: [
      { id: "rarely", label: "Rarely or never", why: "You rarely or never fly" },
      {
        id: "few",
        label: "A few times a year",
        why: "You fly a few times a year",
      },
      {
        id: "monthly",
        label: "Monthly or more",
        why: "You fly monthly or more",
      },
    ],
    second: {
      key: "calls",
      ask: "Do you need internet for video calls from home?",
      choices: [
        {
          id: "yes",
          label: "Yes",
          why: "You need internet for video calls from home",
          later: "Internet for video calls",
        },
        { id: "no", label: "Not really", why: "You don't need internet for video calls" },
      ],
    },
  },
  {
    key: "neighbors",
    n: 8,
    scene: "Neighbors: wave from the porch, see their lights at night, or never know they're there?",
    choices: [
      {
        id: "wave",
        label: "Wave from the porch",
        why: "You'd like neighbors close enough to wave to",
      },
      {
        id: "lights",
        label: "See their lights",
        why: "You don't mind seeing the neighbors' lights at night",
      },
      {
        id: "never",
        label: "Never know they're there",
        why: "You'd rather never know the neighbors are there",
      },
    ],
  },
  {
    key: "garden",
    n: 9,
    scene: "It's August. What's on your table from your own ground?",
    choices: [
      { id: "none", label: "Nothing", why: "You don't plan to grow food" },
      { id: "herbs", label: "Herbs and tomatoes", why: "You'd grow herbs and tomatoes" },
      {
        id: "kitchen",
        label: "A real kitchen garden",
        why: "You'd like a real kitchen garden",
        later: "Frost-free season",
      },
      {
        id: "most",
        label: "Most of our produce, maybe chickens",
        why: "You'd grow most of your produce, maybe keep chickens",
        later: "Frost-free season",
      },
    ],
  },
  {
    key: "driveway",
    n: 10,
    scene: "Snowy morning. Which driveway would you happily live with?",
    choices: [
      {
        id: "steep",
        label: "Short and steep: 4WD some days",
        why: "You'd live with a short, steep driveway and 4WD some days",
      },
      {
        id: "gentle",
        label: "Long and gentle",
        why: "You'd rather have a long, gentle driveway",
      },
      {
        id: "build",
        label: "Whatever it takes, we'll build it",
        why: "You'd build whatever driveway it takes",
      },
    ],
  },
  {
    key: "hoa",
    n: 11,
    scene: "An HOA that stops neighbors clear-cutting, or no rules at all?",
    choices: [
      {
        id: "welcome",
        label: "Rules that protect views are welcome",
        why: "You'd welcome rules that protect the views",
        later: "HOA (welcome)",
      },
      {
        id: "light",
        label: "Light rules are OK",
        why: "You said light rules are OK",
        later: "HOA (light rules)",
      },
      {
        id: "none",
        label: "No HOA or restrictions",
        why: "You want no HOA and no restrictions",
        later: "No HOA (a must)",
      },
    ],
  },
  {
    key: "creek",
    n: 12,
    scene: "A creek on the land: the best feature, or something to keep away from the house?",
    choices: [
      {
        id: "best",
        label: "Best feature",
        why: "You said a creek would be the best feature",
        later: "A creek (the best feature)",
      },
      {
        id: "notNear",
        label: "Nice, not near the house",
        why: "You'd like a creek, just not near the house",
        later: "A creek (not near the house)",
      },
      { id: "rather", label: "Rather not", why: "You'd rather not have a creek", later: "No creek" },
      { id: "either", label: "Either is fine", why: null },
    ],
  },
];

/**
 * Question 1's follow-ups (step 11, plan §2.2): on its screen, preset from its answer (config `climatePreset`), so a
 * tap on the first row is enough. Their whys say the limit in the person's words.
 */
export const WINTER_QUESTION = {
  key: "winter",
  ask: "Winters",
  choices: [
    { id: "mild", label: "Mild", why: "You'd rather have mild winters" },
    { id: "some", label: "Some snow", why: "You'd like some snow in winter" },
    { id: "real", label: "Real winter welcome", why: "You'd welcome a real winter" },
  ],
} as const satisfies { key: "winter"; ask: string; choices: readonly Choice[] };

export const SUMMER_QUESTION = {
  key: "summer",
  ask: "Summer heat",
  choices: [
    { id: "cool", label: "Keep it cool", why: "You'd rather keep summers cool" },
    { id: "warm", label: "Warm is fine", why: "Warm summers are fine with you" },
    { id: "hot", label: "Hot is fine", why: "Hot summers are fine with you" },
  ],
} as const satisfies { key: "summer"; ask: string; choices: readonly Choice[] };

/** Question 2's follow-up, on the same screen after "Out with a camera". */
export const GLOW_QUESTION = {
  scene: "A town's glow on one horizon: shrug, or spoils it?",
  choices: [
    { id: "shrug", label: "Shrug", why: null },
    { id: "spoils", label: "Spoils it", why: "You'd be out with a camera, and a town's glow would spoil it" },
  ] as Choice[],
};

/**
 * Question 13: the acres, then two optional budgets. Polish #26 (draft for the owner's approval, 2026-10-20): each says
 * it's all in, the land's price too, as the design's Cost to camp and Cost to build count them.
 */
export const LAND_QUESTION = {
  n: 13,
  scene: "How much land, and how much money?",
  acres: [
    { id: "under5", label: "Under 5 acres" },
    { id: "5to20", label: "5–20 acres" },
    { id: "20to50", label: "20–50 acres" },
    { id: "over50", label: "50+ acres" },
  ],
  // Owner, #240: the sentences say what each budget covers; the box's own label asks for the number.
  camp: "Ready to camp, all in: the land, a way in, and a track to a clearing your 4x4 can reach.",
  build:
    "Ready to build, all in: the same, plus a finished driveway, well, septic and power. Everything but the house.",
  most: "The most you'd spend (optional)",
} as const;

export const ACRES_WORDS: Record<string, string> = {
  under5: "under 5 acres",
  "5to20": "5–20 acres",
  "20to50": "20–50 acres",
  over50: "50+ acres",
};

export const dollars = (n: number): string => `$${fmt(n)}`;

/** Question 14's two screens. */
export const WALK_AWAY_SCENE = "Which of these would make you walk away from an otherwise perfect place?";
export const DONT_MATTER_SCENE = "Which don't matter at all?";

/** A chip: its label, and what each half of question 14 says and adds. */
export interface ChipWords {
  label: string;
  walkAway: (a: { belowFt: number; erOverMin: number }) => string;
  dontMatter: string;
  /** The quiet list's entries for a factor the app doesn't measure yet. */
  laterWalkAway?: string;
  laterDontMatter?: string;
}

export const CHIP_WORDS: Record<Chip, ChipWords> = {
  flood: {
    label: "Flood zone",
    walkAway: () => "You'd walk away from a flood zone",
    dontMatter: "You said a flood zone doesn't matter",
  },
  hoa: {
    label: "An HOA",
    walkAway: () => "You'd walk away from an HOA",
    dontMatter: "You said an HOA doesn't matter",
    laterWalkAway: "No HOA (a must)",
    laterDontMatter: "HOA (doesn't matter)",
  },
  // Polish #28: the card's own words for it, "Driveway on your land" (lib/rubric/words.ts), in both halves.
  sharedDriveway: {
    label: "Driveway not on your land",
    walkAway: () => "You'd walk away from a driveway that isn't on your land",
    dontMatter: "You said a driveway on your land doesn't matter",
    laterWalkAway: "Driveway on your land (a must)",
  },
  belowFt: {
    label: "Elevation below ___ ft",
    walkAway: ({ belowFt }) => `You'd walk away from land below ${fmt(belowFt)} ft`,
    dontMatter: "You said elevation doesn't matter",
  },
  erOver: {
    label: "ER over ___ min away",
    walkAway: ({ erOverMin }) => `You'd walk away from an ER more than ${fmt(erOverMin)} minutes away`,
    dontMatter: "You said the drive to an ER doesn't matter",
  },
  neighborInView: {
    label: "Neighbor's house in view",
    walkAway: () => "You'd walk away from a neighbor's house in view",
    dontMatter: "You said a neighbor's house in view doesn't matter",
  },
  noWinterSun: {
    label: "No winter sun",
    walkAway: () => "You'd walk away from a place with no winter sun",
    dontMatter: "You said winter sun doesn't matter",
  },
  altSeptic: {
    // Polish: plain words (it was "Alternative septic only").
    label: "Only an alternative septic system",
    walkAway: () => "You'd walk away if only an alternative septic system would work",
    dontMatter: "You said an alternative septic system doesn't matter",
  },
  overBudget: {
    label: "Over budget",
    walkAway: () => "You'd walk away from a place over budget",
    dontMatter: "You said the budget doesn't matter",
    laterWalkAway: "Within budget (a must)",
    laterDontMatter: "Budgets (don't matter)",
  },
};

/** The screens' count, for the progress line: questions 1–14. */
export const QUESTION_COUNT = 14;
