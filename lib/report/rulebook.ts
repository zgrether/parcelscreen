/**
 * The rulebook, "What the grade means" (value-ranking.md §8; VR7): the same panels as the report card's, for both
 * grades, with every band on every scale and what each band means, and the rules each grade is built from. Every
 * number comes from config (the screen's constants and the user's Settings), so a changed cutoff or weight changes
 * the page; a test renders the page and checks that. Pure: the page draws this.
 */
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { UserConfig } from "../screen/types";
import type { Curve } from "../screen/util";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import { defaultNamedRubric } from "../rubric/default";
import type { NamedRubric } from "../rubric/types";
import { weightsOf } from "../rubric/weights";
import type { GateKey, RowKey } from "./card";
import { panelText, type PanelKey } from "./cardPanels";
import { MEANINGS, type Meaning } from "./meanings";
import {
  SCALE_IDS,
  degToPct,
  elevationMarks,
  pctToDeg,
  scaleBands,
  type ScaleId,
  type ScaleName,
} from "./scales";

type Constants = typeof SCREEN_CONSTANTS;

export interface RuleScale {
  id: ScaleId;
  name: ScaleName;
  /** Each band's label, and what it means for you there. */
  bands: { label: string; meanings: Meaning[] }[];
  /** Where the row's grades start along it (Elevation). */
  marks?: { at: number; label: string }[];
}

export interface RulePanel {
  key: PanelKey;
  title: string;
  question: string;
  scales: RuleScale[];
  howScored: string;
}

/** One part of the homesite grade: its share of the points and how it's scored. */
export interface RulePart {
  key: string;
  label: string;
  /** Quality parts: the share of quality points, percent; cost parts: null. */
  weightPct: number | null;
  how: string;
}

export interface Rulebook {
  card: {
    /** The verdict panel's rules: the points per letter, the grade's cutoffs, the verdict. */
    verdict: RulePanel;
    /** The rubrics the weights table shows, in column order. */
    rubrics: { id: string; name: string }[];
    weights: { key: RowKey; label: string; byRubric: Record<string, number> }[];
    gates: RulePanel[];
    rows: RulePanel[];
    /** Within budget (step 10): a row only in a rubric with budgets, so it's apart from the weights table's rows. */
    budget: RulePanel;
    /** Cost to enjoy: the card's last line, not graded; pending until the unit costs are calibrated. */
    cost: RulePanel;
  };
  homesite: {
    intro: string;
    quality: RulePart[];
    flood: string;
    grades: string;
    /** What build cost points mean, before its parts. */
    costIntro: string;
    cost: RulePart[];
    tiers: string;
    overall: string;
  };
}

const GATES: GateKey[] = ["floodplain", "access", "easement", "septic"];
const ROWS: RowKey[] = [
  "elevation",
  "homesite",
  "sky",
  "room",
  "driveway",
  "trails",
  "town",
  "hospital",
  "garden",
  // Step 11's new factors, in the order they shipped.
  "climate",
  "privacy",
];

/** The scales each panel shows (as the report's panels do), by panel. */
const PANEL_SCALES: Partial<Record<PanelKey, ScaleName[]>> = {
  easement: ["Driveway"],
  septic: ["Septic"],
  elevation: ["Elevation"],
  homesite: ["Winter sun", "Facing", "Frost belt", "Slope as foundation"],
  sky: ["Sky"],
  room: ["Room to build"],
  driveway: ["Driveway"],
  trails: ["Trails"],
  town: ["Town and groceries"],
  hospital: ["Hospital"],
  garden: ["Garden"],
};

function ruleScale(name: ScaleName, C: Constants): RuleScale {
  const id = SCALE_IDS[name];
  return {
    id,
    name,
    // The fuller labels: each band's numbers, and slopes in both units (#118 review).
    bands: scaleBands(name, C.bands, C.card.rows.roomX, { aspectTargetDeg: C.score.siteAspectTargetDeg }).map(
      (label, i) => ({ label, meanings: MEANINGS[id][i] ?? [] }),
    ),
    ...(name === "Elevation" ? { marks: elevationMarks(C.bands, C.card.rows.elevationFt) } : {}),
  };
}

function rulePanel(key: PanelKey, C: Constants, rubrics: readonly NamedRubric[]): RulePanel {
  const t = panelText(key, C.card, C.build, { bothSlopeUnits: true, rubrics });
  return { key, ...t, scales: (PANEL_SCALES[key] ?? []).map((n) => ruleScale(n, C)) };
}

/** A slope in degrees, then as a grade: "10° (18%)"; a grade, then in degrees: "15% (8.5°)" (#118 review). */
const deg = (d: number) => `${fmt(d)}° (${fmt(degToPct(d))}%)`;
const pctGrade = (p: number) => `${fmt(p)}% (${fmt(pctToDeg(p), 1)}°)`;

/** A depth in cm as inches or feet, with the cm: "about 20 in (50 cm)", "about 5 ft (150 cm)". */
function depth(cm: number): string {
  const inches = cm / 2.54;
  return inches < 36
    ? `about ${fmt(inches)} in (${fmt(cm)} cm)`
    : `about ${fmt(inches / 12)} ft (${fmt(cm)} cm)`;
}

/**
 * The over-limit term in words, from the same branches as overLimitTerm (score.ts; #118 review): points a percent over
 * the limit up to the knee (practicalMaxPct, or the limit when it's higher), then a straight line to the most points
 * at overLimitMaxAtPct; all at once when the knee is already there.
 */
export function overLimitWords(
  limitPct: number,
  D: Constants["driveway"] = SCREEN_CONSTANTS.driveway,
): string {
  const knee = Math.max(limitPct, D.practicalMaxPct);
  const per = `${fmt(D.overLimitPtsPerPct)} point${D.overLimitPtsPerPct === 1 ? "" : "s"} a percent over the limit`;
  const top = `${fmt(D.overLimitMaxPts)} at ${fmt(D.overLimitMaxAtPct)}% and steeper`;
  if (knee >= D.overLimitMaxAtPct)
    return knee > limitPct
      ? `${per} up to ${fmt(knee)}%, then the full ${fmt(D.overLimitMaxPts)}`
      : `the full ${fmt(D.overLimitMaxPts)} for any grade over the limit`;
  if (knee > limitPct) return `${per} up to ${fmt(knee)}%, then rising to ${top}`;
  return `rising in a straight line from 0 at ${fmt(limitPct)}% to ${top}`;
}

/**
 * "100 up to 6°, 75 at 10°, 50 at 14°, …": a curve's points in words, the leading points with the same value as one
 * ("100 up to 30° off", not "100 up to 0°, 100 at 30°"). Between the points the score runs in a straight line.
 */
function curveWords(pts: Curve, x: (v: number) => string): string {
  let lead = 0;
  while (lead + 1 < pts.length && pts[lead + 1]![1] === pts[0]![1]) lead++;
  const [x0, y0] = pts[lead]!;
  return [`${fmt(y0)} up to ${x(x0)}`, ...pts.slice(lead + 1).map(([xi, y]) => `${fmt(y)} at ${x(xi)}`)].join(
    ", ",
  );
}

const pct = (share: number) => fmt(share * 100);

/** The rulebook for these constants, Settings and rubrics (the profile's; the default rubric alone without them). */
export function rulebook(
  C: Constants = SCREEN_CONSTANTS,
  cfg: UserConfig = DEFAULT_USER_CONFIG,
  rubrics: readonly NamedRubric[] = [defaultNamedRubric(C.card)],
): Rulebook {
  const S = C.score,
    SU = C.suitability,
    D = C.driveway,
    W = S.weights;
  const fr = SU.frostHouse;
  const [m0, m1] = C.sky.magRange;
  const aspect = SU.aspectCurve;
  const quality: RulePart[] = [
    {
      key: "sun",
      label: "December sun",
      weightPct: W.sun * 100,
      how: `The share of December's daylight with the sun above the skyline, from 0 to 100; trees are counted as raising the skyline by ${fmt(cfg.canopyDeg)}° (Settings). Over ${pct(S.sunGoodShare)}% reads "good", over ${pct(S.sunOkShare)}% "acceptable".`,
    },
    {
      key: "aspect",
      label: "Facing",
      weightPct: W.aspect * 100,
      how: `By how far the ground faces from ${fmt(S.siteAspectTargetDeg)}° (${compass(S.siteAspectTargetDeg)}): ${curveWords(aspect, (x) => `${fmt(x)}° off`)}, in a straight line between. Ground flatter than ${deg(SU.flatBelowDeg)} has no real facing and scores ${fmt(aspect[0]![1])}.`,
    },
    {
      key: "frost",
      label: "Frost position",
      weightPct: W.frost * 100,
      // frostCurve (sites.ts): straight lines between these points, level beyond the last.
      how: `By height above the valley floor, where cold air pools on still nights: ${fmt(fr.atFloor)} on the valley floor, rising to ${fmt(fr.full)} at ${fmt(cfg.thermalMinFt)} ft above it (Settings), ${fmt(fr.full)} up to ${fmt(fr.beltTopFt)} ft, then easing to ${fmt(fr.exposed)} by ${fmt(fr.exposedFt)} ft and above, where it's exposed to wind.`,
    },
    {
      key: "slope",
      label: "Slope",
      weightPct: W.slope * 100,
      how: `How gentle the ground is under the house: ${curveWords(SU.slopeHouse, deg)}, in a straight line between. (What it costs to level the pad is counted separately, under build cost.)`,
    },
    {
      key: "sky",
      label: "Night sky",
      weightPct: W.sky * 100,
      how: `From 0 at ${fmt(m0, 1)} to 100 at ${fmt(m1, 1)} mag/arcsec² (a darkness reading; higher is darker) overhead; up to ${fmt(C.sky.domePenaltyMax)} less for a light dome to the south; ${fmt(C.sky.coreBlockedPenalty)} less when a ridge hides the Milky Way's core, ${fmt(C.sky.coreLowPenalty)} less when it clears the ridge by under ${fmt(C.sky.coreLowDeg)}°; ${fmt(S.skyIfMissing)} when the sky didn't load.`,
    },
  ];
  const DC = S.drivewayCost;
  const cost: RulePart[] = [
    {
      key: "septic",
      label: "Septic",
      weightPct: null,
      how: `By NRCS's septic rating: ${fmt(S.septic.fine)} not limited, ${fmt(S.septic.workable)} somewhat limited, ${fmt(S.septic.poor)} very limited, ${fmt(S.septic.unrated)} unrated.`,
    },
    {
      key: "foundation",
      label: "Foundation",
      weightPct: null,
      how: `By NRCS's rating for dwellings without basements: ${fmt(S.foundation.fine)} not limited, ${fmt(S.foundation.workable)} somewhat limited, ${fmt(S.foundation.poor)} very limited, ${fmt(S.foundation.unrated)} unrated.`,
    },
    {
      key: "rock",
      label: "Rock",
      weightPct: null,
      how: `Up to ${fmt(S.rock)} points: all of them with bedrock within ${depth(S.rockDepthCm.full)}, none with bedrock ${depth(S.rockDepthCm.none)} or deeper, in a straight line between. No bedrock reported counts as none: no points.`,
    },
    {
      key: "pad",
      label: "House pad",
      weightPct: null,
      how: `What it costs to level the pad, by slope: ${curveWords(S.pad, deg)} and steeper, in a straight line between; ${fmt(S.compactPad)} for a compact site's cut pad.`,
    },
    {
      key: "driveway",
      label: "Driveway",
      weightPct: null,
      how: `From the routed driveway's cost: ${fmt(DC.k)} × ln(1 + cost ÷ $${fmt(DC.c0)}); ${fmt(DC.easement)} more when it needs an easement; when it needs more than the grade limit (Settings: ${pctGrade(cfg.roadMaxGradePct)}), ${overLimitWords(cfg.roadMaxGradePct, D)}; at most ${fmt(DC.max)} in all. A route steeper than the veto (Settings: ${pctGrade(cfg.roadVetoGradePct)} over ${fmt(D.gradeWindowsM.headline)} m) can't be chosen.`,
    },
  ];
  const [gA, gB, gC, gD] = S.grades.map(([v]) => v);
  const [t1, t2, t3] = S.costTiers.map(([v]) => v);
  return {
    card: {
      verdict: rulePanel("verdict", C, rubrics),
      rubrics: rubrics.map(({ id, name }) => ({ id, name })),
      weights: ROWS.map((key) => ({
        key,
        label: panelText(key, C.card, C.build).title,
        byRubric: Object.fromEntries(rubrics.map((nr) => [nr.id, weightsOf(nr.rubric)[key]])),
      })),
      gates: GATES.map((k) => rulePanel(k, C, rubrics)),
      rows: ROWS.map((k) => rulePanel(k, C, rubrics)),
      budget: rulePanel("budget", C, rubrics),
      cost: rulePanel("cost", C, rubrics),
    },
    homesite: {
      intro:
        "The homesite grade picks and orders the build sites; it never grades the parcel. Each site gets two numbers: its quality, which money can't change, and what it costs to build there.",
      quality,
      flood: `A site inside a FEMA flood zone keeps ${pct(S.sfhaQualityFactor)}% of its quality.`,
      grades: `Quality grades: A from ${fmt(gA!)}, B from ${fmt(gB!)}, C from ${fmt(gC!)}, D from ${fmt(gD!)}, F under that.`,
      cost,
      costIntro:
        "Build cost is counted in points: higher means more expensive. The five parts below add up, capped at 100.",
      tiers: `Build cost tiers: $ under ${fmt(t1!)} points, $$ under ${fmt(t2!)}, $$$ under ${fmt(t3!)}, $$$$ at ${fmt(t3!)} and over.`,
      overall: `The sites are ranked by ${pct(S.overall.quality)}% quality and ${pct(S.overall.cost)}% build cost (100 less its points).`,
    },
  };
}
